// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct AppState {
    pub is_recording: Mutex<bool>,
    pub current_session_id: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize)]
pub struct SessionResponse {
    pub session_id: String,
    pub status: String,
}

#[tauri::command]
fn start_recording(state: State<AppState>) -> Result<SessionResponse, String> {
    let mut is_rec = state.is_recording.lock().map_err(|e| e.to_string())?;
    *is_rec = true;
    let session_id = format!("session_{}", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    let mut current_id = state.current_session_id.lock().map_err(|e| e.to_string())?;
    *current_id = Some(session_id.clone());

    println!("[Rust Core] Started isolated multi-track recording: {}", session_id);
    Ok(SessionResponse {
        session_id,
        status: "recording".to_string(),
    })
}

#[tauri::command]
fn stop_recording(state: State<AppState>) -> Result<SessionResponse, String> {
    let mut is_rec = state.is_recording.lock().map_err(|e| e.to_string())?;
    *is_rec = false;
    let mut current_id = state.current_session_id.lock().map_err(|e| e.to_string())?;
    let session_id = current_id.take().unwrap_or_else(|| "unknown".to_string());

    println!("[Rust Core] Finalizing recording session: {}", session_id);
    Ok(SessionResponse {
        session_id,
        status: "saved".to_string(),
    })
}

#[tauri::command]
fn discard_recording(state: State<AppState>) -> Result<bool, String> {
    let mut is_rec = state.is_recording.lock().map_err(|e| e.to_string())?;
    *is_rec = false;
    let mut current_id = state.current_session_id.lock().map_err(|e| e.to_string())?;
    let _ = current_id.take();

    println!("[Rust Core] Discarded recording buffer (Loom instant trash)");
    Ok(true)
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

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            discard_recording,
            toggle_camera_bubble
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
