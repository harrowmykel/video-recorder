// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod ai;
mod session;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use session::{SessionManager, SessionMetadata};
use ai::{process_video_background, OutputFormat};

pub struct AppState {
    pub session_manager: Mutex<SessionManager>,
}

#[tauri::command]
fn start_recording(state: State<AppState>) -> Result<String, String> {
    let mut manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    let base_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join("recordings");
    let session_id = manager.start(&base_dir).map_err(|e| e.to_string())?;
    Ok(session_id)
}

#[tauri::command]
fn stop_recording(state: State<AppState>) -> Result<Option<SessionMetadata>, String> {
    let mut manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    let metadata = manager.stop().map_err(|e| e.to_string())?;
    Ok(metadata)
}

#[tauri::command]
fn discard_recording(state: State<AppState>) -> Result<bool, String> {
    let mut manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.discard().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn toggle_live_zoom(state: State<AppState>, active: bool) -> Result<bool, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.toggle_live_zoom(active);
    Ok(active)
}

#[tauri::command]
fn toggle_camera_bubble(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("camera_bubble") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;
        if is_visible {
            window.hide().map_err(|e| e.to_string())?;
            println!("[Rust Core] Camera bubble hidden (Camera recording continues in background!)");
            Ok(false)
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            println!("[Rust Core] Camera bubble restored");
            Ok(true)
        }
    } else {
        Err("Camera bubble window not found".to_string())
    }
}

#[tauri::command]
fn extract_transparent_background(file_path: String, format: String) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    let out_format = match format.as_str() {
        "webm_alpha" => OutputFormat::WebmAlpha,
        "luma_matte" => OutputFormat::LumaMatte,
        _ => OutputFormat::ProRes4444,
    };
    let output = process_video_background(&path, out_format).map_err(|e| e.to_string())?;
    Ok(output.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            session_manager: Mutex::new(SessionManager::default()),
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            discard_recording,
            toggle_live_zoom,
            toggle_camera_bubble,
            extract_transparent_background
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
