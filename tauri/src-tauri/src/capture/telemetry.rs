use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub timestamp_us: u64,
    pub x: i32,
    pub y: i32,
    pub is_clicked: bool,
    pub zoom_factor: f32,
}

pub struct TelemetryLogger {
    output_path: PathBuf,
    is_running: Arc<AtomicBool>,
    is_zoom_active: Arc<AtomicBool>,
    join_handle: Option<thread::JoinHandle<()>>,
}

impl TelemetryLogger {
    pub fn new(output_path: PathBuf) -> Self {
        Self {
            output_path,
            is_running: Arc::new(AtomicBool::new(false)),
            is_zoom_active: Arc::new(AtomicBool::new(false)),
            join_handle: None,
        }
    }

    pub fn set_zoom_active(&self, active: bool) {
        self.is_zoom_active.store(active, Ordering::SeqCst);
    }

    pub fn start(&mut self) {
        self.is_running.store(true, Ordering::SeqCst);
        let is_running = self.is_running.clone();
        let is_zoom_active = self.is_zoom_active.clone();
        let output_path = self.output_path.clone();

        let handle = thread::spawn(move || {
            let start_time = Instant::now();
            let mut events: Vec<TelemetryEvent> = Vec::new();

            // 60 Hz sampling loop (every ~16.6 ms)
            while is_running.load(Ordering::SeqCst) {
                let elapsed_us = start_time.elapsed().as_micros() as u64;
                let zoom = if is_zoom_active.load(Ordering::SeqCst) { 1.5 } else { 1.0 };

                // Get cursor coordinates (mock / system API)
                let (x, y) = get_cursor_position();

                events.push(TelemetryEvent {
                    timestamp_us: elapsed_us,
                    x,
                    y,
                    is_clicked: false,
                    zoom_factor: zoom,
                });

                thread::sleep(Duration::from_millis(16));
            }

            // Save JSON telemetry
            if let Ok(json_str) = serde_json::to_string_pretty(&events) {
                let _ = std::fs::write(&output_path, json_str);
            }
        });

        self.join_handle = Some(handle);
    }

    pub fn stop(&mut self) -> PathBuf {
        self.is_running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
        self.output_path.clone()
    }

    pub fn discard(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
        if self.output_path.exists() {
            let _ = std::fs::remove_file(&self.output_path);
        }
    }
}

// Fallback cursor position tracker across platforms
fn get_cursor_position() -> (i32, i32) {
    // Basic fallback simulation if X11/Win32 headers are not linked
    (960, 540)
}
