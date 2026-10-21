mod capture;
mod ai;
mod session;
pub mod ffmpeg;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use warp::Filter;
use serde::{Deserialize, Serialize};
use session::{
    SessionManager, StartRecordingRequest,
    default_recordings_base_dir, list_recorded_sessions,
};
use capture::{enumerate_displays, enumerate_windows};
use ai::{process_video_background, OutputFormat};

#[derive(Deserialize)]
struct ExtractBgRequest {
    file_path: String,
    format: String,
    output_dir: Option<String>,
}

#[derive(Deserialize)]
struct ToggleZoomRequest {
    active: bool,
}

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    is_recording: bool,
    is_paused: bool,
    current_session_id: Option<String>,
}

#[tokio::main]
async fn main() {
    let session_manager = Arc::new(Mutex::new(SessionManager::default()));
    let recordings_dir = default_recordings_base_dir();

    // 1. Health / Status route
    let sm_clone = session_manager.clone();
    let status_route = warp::path("status")
        .and(warp::get())
        .map(move || {
            let mgr = sm_clone.lock().unwrap();
            warp::reply::json(&StatusResponse {
                status: "ready".to_string(),
                is_recording: mgr.is_recording(),
                is_paused: mgr.is_paused(),
                current_session_id: mgr.current_session_id(),
            })
        });

    // 2. Enumerate displays & windows route
    let sources_route = warp::path("sources")
        .and(warp::get())
        .map(|| {
            let displays = enumerate_displays();
            let windows = enumerate_windows();
            warp::reply::json(&serde_json::json!({
                "displays": displays,
                "windows": windows,
            }))
        });

    // 3. Start recording route (accepts optional JSON body or empty body)
    let sm_clone = session_manager.clone();
    let rec_dir_start = recordings_dir.clone();
    let start_route = warp::path("start")
        .and(warp::post())
        .and(warp::body::bytes())
        .map(move |body_bytes: warp::hyper::body::Bytes| {
            let req: StartRecordingRequest = if body_bytes.is_empty() {
                StartRecordingRequest::default()
            } else {
                serde_json::from_slice(&body_bytes).unwrap_or_default()
            };
            let mut mgr = sm_clone.lock().unwrap();
            match mgr.start_with_options(&rec_dir_start, req) {
                Ok(id) => warp::reply::json(&serde_json::json!({ "success": true, "session_id": id })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            }
        });

    // 4. Pause recording route
    let sm_clone = session_manager.clone();
    let pause_route = warp::path("pause")
        .and(warp::post())
        .map(move || {
            let mut mgr = sm_clone.lock().unwrap();
            mgr.pause();
            warp::reply::json(&serde_json::json!({ "success": true, "is_paused": mgr.is_paused() }))
        });

    // 5. Resume recording route
    let sm_clone = session_manager.clone();
    let resume_route = warp::path("resume")
        .and(warp::post())
        .map(move || {
            let mut mgr = sm_clone.lock().unwrap();
            mgr.resume();
            warp::reply::json(&serde_json::json!({ "success": true, "is_paused": mgr.is_paused() }))
        });

    // 5b. Update audio route (dynamic mic switching & mute toggles)
    let sm_clone = session_manager.clone();
    let update_audio_route = warp::path("update_audio")
        .and(warp::post())
        .and(warp::body::bytes())
        .map(move |body_bytes: warp::hyper::body::Bytes| {
            let req: crate::session::UpdateAudioRequest = if body_bytes.is_empty() {
                crate::session::UpdateAudioRequest::default()
            } else {
                serde_json::from_slice(&body_bytes).unwrap_or_default()
            };
            let mut mgr = sm_clone.lock().unwrap();
            match mgr.update_audio(req) {
                Ok(_) => warp::reply::json(&serde_json::json!({ "success": true })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            }
        });

    // 5c. Update capture source route (dynamic display, window, or area switching mid-recording)
    let sm_clone = session_manager.clone();
    let update_source_route = warp::path("update_source")
        .and(warp::post())
        .and(warp::body::bytes())
        .map(move |body_bytes: warp::hyper::body::Bytes| {
            let req: crate::session::UpdateCaptureSourceRequest = if body_bytes.is_empty() {
                crate::session::UpdateCaptureSourceRequest::default()
            } else {
                serde_json::from_slice(&body_bytes).unwrap_or_default()
            };
            let mut mgr = sm_clone.lock().unwrap();
            match mgr.update_source(req) {
                Ok(_) => warp::reply::json(&serde_json::json!({ "success": true })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            }
        });

    // 6. Stop recording route (spawned off-thread to avoid blocking async runtime)
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

    // 7. Upload composited camera track from browser/Electron MediaRecorder
    let sm_clone = session_manager.clone();
    let upload_camera_route = warp::path("upload_camera_track")
        .and(warp::post())
        .and(warp::body::bytes())
        .and_then(move |bytes: warp::hyper::body::Bytes| {
            let sm = sm_clone.clone();
            async move {
                let res = tokio::task::spawn_blocking(move || {
                    let mgr = sm.lock().unwrap();
                    mgr.save_uploaded_camera_track(&bytes)
                }).await.map_err(|_| warp::reject::reject())?;

                let reply = match res {
                    Ok(path) => warp::reply::json(&serde_json::json!({
                        "success": true,
                        "camera_path": path.to_string_lossy()
                    })),
                    Err(e) => warp::reply::json(&serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    })),
                };
                Ok::<_, warp::Rejection>(reply)
            }
        });

    // 8. List recorded sessions
    let rec_dir_list = recordings_dir.clone();
    let sessions_route = warp::path("sessions")
        .and(warp::get())
        .map(move || {
            let sessions = list_recorded_sessions(&rec_dir_list);
            warp::reply::json(&serde_json::json!({ "sessions": sessions }))
        });

    // 9. Serve recorded session media files (/media/<session_id>/<file>)
    let media_route = warp::path("media")
        .and(warp::fs::dir(recordings_dir.clone()));

    // 10. Discard recording route (Loom instant trash)
    let sm_clone = session_manager.clone();
    let discard_route = warp::path("discard")
        .and(warp::post())
        .map(move || {
            let mut mgr = sm_clone.lock().unwrap();
            let _ = mgr.discard();
            warp::reply::json(&serde_json::json!({ "success": true, "discarded": true }))
        });

    // 11. Toggle live cursor zoom
    let sm_clone = session_manager.clone();
    let toggle_zoom_route = warp::path("toggle_zoom")
        .and(warp::post())
        .and(warp::body::json())
        .map(move |req: ToggleZoomRequest| {
            let mgr = sm_clone.lock().unwrap();
            mgr.toggle_live_zoom(req.active);
            warp::reply::json(&serde_json::json!({ "success": true, "active": req.active }))
        });

    // 12. Extract background transparent video route (spawned off-thread)
    let extract_route = warp::path("extract_bg")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(|req: ExtractBgRequest| async move {
            let path = PathBuf::from(&req.file_path);
            let out_dir = req.output_dir.map(PathBuf::from);
            let out_format = match req.format.as_str() {
                "webm_alpha" => OutputFormat::WebmAlpha,
                "luma_matte" => OutputFormat::LumaMatte,
                _ => OutputFormat::ProRes4444,
            };

            let res = tokio::task::spawn_blocking(move || {
                process_video_background(&path, out_format, out_dir.as_deref())
            }).await.map_err(|_| warp::reject::reject())?;

            let reply = match res {
                Ok(out) => warp::reply::json(&serde_json::json!({ "success": true, "output_path": out.to_string_lossy() })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            };
            Ok::<_, warp::Rejection>(reply)
        });

    // 13. AI Model catalog route
    let models_route = warp::path!("models")
        .and(warp::get())
        .map(|| {
            if let Ok(manager) = ai::ModelManager::new() {
                warp::reply::json(&manager.list_models())
            } else {
                warp::reply::json(&Vec::<ai::ModelInfo>::new())
            }
        });

    #[derive(Deserialize)]
    struct DownloadModelRequest {
        file_name: String,
    }

    // 13b. Download AI Model on demand
    let models_download_route = warp::path!("models" / "download")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(|req: DownloadModelRequest| async move {
            let res = tokio::task::spawn_blocking(move || {
                let manager = ai::ModelManager::new()?;
                manager.ensure_model_downloaded(&req.file_name)
            }).await.map_err(|_| warp::reject::reject())?;

            let reply = match res {
                Ok(path) => warp::reply::json(&serde_json::json!({
                    "success": true,
                    "path": path.to_string_lossy()
                })),
                Err(e) => warp::reply::json(&serde_json::json!({
                    "success": false,
                    "error": e.to_string()
                })),
            };
            Ok::<_, warp::Rejection>(reply)
        });

    // 14. Upload individual camera chunk
    let sm_clone = session_manager.clone();
    let upload_camera_chunk_route = warp::path("upload_camera_chunk")
        .and(warp::post())
        .and(warp::header::optional::<u32>("x-chunk-index"))
        .and(warp::header::optional::<String>("x-camera-metadata"))
        .and(warp::body::bytes())
        .and_then(move |chunk_idx: Option<u32>, meta: Option<String>, bytes: warp::hyper::body::Bytes| {
            let sm = sm_clone.clone();
            async move {
                let idx = chunk_idx.unwrap_or(1);
                let res = tokio::task::spawn_blocking(move || {
                    let mgr = sm.lock().unwrap();
                    mgr.save_uploaded_camera_chunk(idx, &bytes, meta.as_deref())
                }).await.map_err(|_| warp::reject::reject())?;

                let reply = match res {
                    Ok(path) => warp::reply::json(&serde_json::json!({
                        "success": true,
                        "chunk_path": path.to_string_lossy()
                    })),
                    Err(e) => warp::reply::json(&serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    })),
                };
                Ok::<_, warp::Rejection>(reply)
            }
        });

    // 15. Delete session route
    let sm_clone = session_manager.clone();
    let delete_session_route = warp::path!("sessions" / String)
        .and(warp::delete())
        .and_then(move |session_id: String| {
            let sm = sm_clone.clone();
            async move {
                let res = tokio::task::spawn_blocking(move || {
                    let mut mgr = sm.lock().unwrap();
                    mgr.delete_session(&session_id)
                }).await.map_err(|_| warp::reject::reject())?;

                let reply = match res {
                    Ok(deleted) => warp::reply::json(&serde_json::json!({ "success": true, "deleted": deleted })),
                    Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
                };
                Ok::<_, warp::Rejection>(reply)
            }
        });

    // 16. Camera MJPEG preview stream route
    // Enable CORS for frontend dev server
    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "DELETE", "OPTIONS"])
        .allow_headers(vec!["Content-Type", "x-chunk-index", "x-camera-metadata"]);

    let routes = status_route
        .or(sources_route)
        .or(start_route)
        .or(pause_route)
        .or(resume_route)
        .or(update_audio_route)
        .or(update_source_route)
        .or(stop_route)
        .or(upload_camera_route)
        .or(upload_camera_chunk_route)
        .or(delete_session_route)
        .or(sessions_route)
        .or(media_route)
        .or(discard_route)
        .or(toggle_zoom_route)
        .or(extract_route)
        .or(models_route)
        .or(models_download_route)
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
