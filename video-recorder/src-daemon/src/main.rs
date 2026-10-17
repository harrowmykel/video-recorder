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

    // 3. Stop recording route
    let sm_clone = session_manager.clone();
    let stop_route = warp::path("stop")
        .and(warp::post())
        .map(move || {
            let mut mgr = sm_clone.lock().unwrap();
            match mgr.stop() {
                Ok(meta) => warp::reply::json(&serde_json::json!({ "success": true, "metadata": meta })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
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

    // 5. Extract background transparent video route
    let extract_route = warp::path("extract_bg")
        .and(warp::post())
        .and(warp::body::json())
        .map(|req: ExtractBgRequest| {
            let path = PathBuf::from(&req.file_path);
            let out_format = match req.format.as_str() {
                "webm_alpha" => OutputFormat::WebmAlpha,
                "luma_matte" => OutputFormat::LumaMatte,
                _ => OutputFormat::ProRes4444,
            };

            match process_video_background(&path, out_format) {
                Ok(out) => warp::reply::json(&serde_json::json!({ "success": true, "output_path": out.to_string_lossy() })),
                Err(e) => warp::reply::json(&serde_json::json!({ "success": false, "error": e.to_string() })),
            }
        });

    // 6. AI Model catalog route
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
        .or(extract_route)
        .or(models_route)
        .with(cors);

    println!("[Rust Core Daemon] Hardware capture service listening on http://127.0.0.1:4820");
    warp::serve(routes).run(([127, 0, 0, 1], 4820)).await;
}
