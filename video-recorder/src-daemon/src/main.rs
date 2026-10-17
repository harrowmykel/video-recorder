mod capture;
mod ai;
mod session;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use warp::Filter;
use serde::{Deserialize, Serialize};
use session::SessionManager;
use ai::{process_video_background, OutputFormat};

#[derive(Deserialize)]
struct ExtractBgRequest {
    file_path: String,
    format: String,
}

#[derive(Deserialize)]
struct ToggleZoomRequest {
    active: bool,
}

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    is_recording: bool,
}

#[tokio::main]
async fn main() {
    let session_manager = Arc::new(Mutex::new(SessionManager::default()));

    // 1. Health / Status route
    let sm_clone = session_manager.clone();
    let status_route = warp::path("status")
        .and(warp::get())
        .map(move || {
            let is_rec = sm_clone.lock().unwrap().is_recording();
            warp::reply::json(&StatusResponse {
                status: "ready".to_string(),
                is_recording: is_rec,
            })
        });

    // 2. Start recording route
    let sm_clone = session_manager.clone();
    let start_route = warp::path("start")
        .and(warp::post())
        .map(move || {
            let mut mgr = sm_clone.lock().unwrap();
            let base_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join("recordings");
            match mgr.start(&base_dir) {
                Ok(id) => warp::reply::json(&serde_json::json!({ "success": true, "session_id": id })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            }
        });

    // 3. Stop recording route (spawned off-thread to avoid blocking async runtime)
    let sm_clone = session_manager.clone();
    let stop_route = warp::path("stop")
        .and(warp::post())
        .and_then(move || {
            let sm = sm_clone.clone();
            async move {
                let res = tokio::task::spawn_blocking(move || {
                    let mut mgr = sm.lock().unwrap();
                    mgr.stop()
                }).await.map_err(|_| warp::reject::reject())?;

                let reply = match res {
                    Ok(meta) => warp::reply::json(&serde_json::json!({ "success": true, "metadata": meta })),
                    Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
                };
                Ok::<_, warp::Rejection>(reply)
            }
        });

    // 4. Discard recording route (Loom instant trash)
    let sm_clone = session_manager.clone();
    let discard_route = warp::path("discard")
        .and(warp::post())
        .map(move || {
            let mut mgr = sm_clone.lock().unwrap();
            let _ = mgr.discard();
            warp::reply::json(&serde_json::json!({ "success": true, "discarded": true }))
        });

    // 5. Toggle live cursor zoom
    let sm_clone = session_manager.clone();
    let toggle_zoom_route = warp::path("toggle_zoom")
        .and(warp::post())
        .and(warp::body::json())
        .map(move |req: ToggleZoomRequest| {
            let mgr = sm_clone.lock().unwrap();
            mgr.toggle_live_zoom(req.active);
            warp::reply::json(&serde_json::json!({ "success": true, "active": req.active }))
        });

    // 6. Extract background transparent video route (spawned off-thread)
    let extract_route = warp::path("extract_bg")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(|req: ExtractBgRequest| async move {
            let path = PathBuf::from(&req.file_path);
            let out_format = match req.format.as_str() {
                "webm_alpha" => OutputFormat::WebmAlpha,
                "luma_matte" => OutputFormat::LumaMatte,
                _ => OutputFormat::ProRes4444,
            };

            let res = tokio::task::spawn_blocking(move || {
                process_video_background(&path, out_format)
            }).await.map_err(|_| warp::reject::reject())?;

            let reply = match res {
                Ok(out) => warp::reply::json(&serde_json::json!({ "success": true, "output_path": out.to_string_lossy() })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            };
            Ok::<_, warp::Rejection>(reply)
        });

    // 7. AI Model catalog route
    let models_route = warp::path("models")
        .and(warp::get())
        .map(|| {
            if let Ok(manager) = ai::ModelManager::new() {
                warp::reply::json(&manager.list_models())
            } else {
                warp::reply::json(&Vec::<ai::ModelInfo>::new())
            }
        });

    // Enable CORS for frontend dev server
    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "OPTIONS"])
        .allow_headers(vec!["Content-Type"]);

    let routes = status_route
        .or(start_route)
        .or(stop_route)
        .or(discard_route)
        .or(toggle_zoom_route)
        .or(extract_route)
        .or(models_route)
        .with(cors);

    let start_port: u16 = std::env::var("DAEMON_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4820);
    let port_range = start_port..=(start_port + 20);

    let mut bound_server = None;

    for port in port_range {
        let addr = ([127, 0, 0, 1], port);
        match warp::serve(routes.clone()).try_bind_ephemeral(addr) {
            Ok((actual_addr, fut)) => {
                println!("[Rust Core Daemon] Hardware capture service listening on http://{}", actual_addr);
                save_daemon_port(actual_addr.port());
                bound_server = Some(fut);
                break;
            }
            Err(e) => {
                eprintln!("[Rust Core Daemon] Port {} unavailable ({}). Searching next port...", port, e);
            }
        }
    }

    if let Some(server_fut) = bound_server {
        server_fut.await;
    } else {
        eprintln!("[Rust Core Daemon] FATAL: Could not bind to any port in range {}..={}", start_port, start_port + 20);
        std::process::exit(1);
    }
}

fn save_daemon_port(port: u16) {
    let temp_file = std::env::temp_dir().join("video-recorder-daemon.port");
    let _ = std::fs::write(&temp_file, port.to_string());

    if let Ok(home) = std::env::var("HOME") {
        let config_dir = PathBuf::from(home).join(".config").join("video-recorder");
        let _ = std::fs::create_dir_all(&config_dir);
        let _ = std::fs::write(config_dir.join("daemon.port"), port.to_string());
    }
}
