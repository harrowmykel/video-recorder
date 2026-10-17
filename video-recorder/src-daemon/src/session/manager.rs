use std::path::{Path, PathBuf};
use anyhow::Result;
use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::capture::{AudioRecorder, CameraRecorder, ScreenRecorder, TelemetryLogger};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub id: String,
    pub created_at: String,
    pub screen_track: String,
    pub camera_raw_track: String,
    pub mic_track: String,
    pub sys_audio_track: String,
    pub telemetry_file: String,
}

pub struct SessionManager {
    session_id: Option<String>,
    session_dir: Option<PathBuf>,
    screen_recorder: Option<ScreenRecorder>,
    camera_recorder: Option<CameraRecorder>,
    audio_recorder: Option<AudioRecorder>,
    telemetry_logger: Option<TelemetryLogger>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self {
            session_id: None,
            session_dir: None,
            screen_recorder: None,
            camera_recorder: None,
            audio_recorder: None,
            telemetry_logger: None,
        }
    }
}

impl SessionManager {
    pub fn is_recording(&self) -> bool {
        self.session_id.is_some()
    }

    pub fn start(&mut self, base_dir: &Path) -> Result<String> {
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let session_id = format!("session_{}", timestamp);
        let session_dir = base_dir.join(&session_id);
        std::fs::create_dir_all(&session_dir)?;

        let screen_path = session_dir.join("screen_clean.mp4");
        let camera_path = session_dir.join("camera_raw.mp4");
        let mic_path = session_dir.join("audio_mic.wav");
        let sys_path = session_dir.join("audio_system.wav");
        let telemetry_path = session_dir.join("telemetry.json");

        // 1. Start Screen Recorder (1080p @ 60 FPS)
        let mut screen_rec = ScreenRecorder::new(screen_path);
        if let Err(e) = screen_rec.start(1920, 1080, 60) {
            eprintln!("[SessionManager] Warning starting screen recorder: {}", e);
        }

        // 2. Start Camera Recorder
        let mut camera_rec = CameraRecorder::new(camera_path);
        if let Err(e) = camera_rec.start(None) {
            eprintln!("[SessionManager] Warning starting camera recorder: {}", e);
        }

        // 3. Start Audio Recorder
        let mut audio_rec = AudioRecorder::new(mic_path, sys_path);
        if let Err(e) = audio_rec.start() {
            eprintln!("[SessionManager] Warning starting audio recorder: {}", e);
        }

        // 4. Start Telemetry Logger
        let mut telemetry_log = TelemetryLogger::new(telemetry_path);
        telemetry_log.start();

        self.session_id = Some(session_id.clone());
        self.session_dir = Some(session_dir);
        self.screen_recorder = Some(screen_rec);
        self.camera_recorder = Some(camera_rec);
        self.audio_recorder = Some(audio_rec);
        self.telemetry_logger = Some(telemetry_log);

        println!("[SessionManager] Started multi-track session: {}", session_id);
        Ok(session_id)
    }

    pub fn stop(&mut self) -> Result<Option<SessionMetadata>> {
        let session_id = match self.session_id.take() {
            Some(id) => id,
            None => return Ok(None),
        };

        let screen_path = if let Some(mut r) = self.screen_recorder.take() {
            r.stop()?.to_string_lossy().to_string()
        } else {
            String::new()
        };

        let camera_path = if let Some(mut r) = self.camera_recorder.take() {
            r.stop()?.to_string_lossy().to_string()
        } else {
            String::new()
        };

        let (mic_path, sys_path) = if let Some(mut r) = self.audio_recorder.take() {
            let (m, s) = r.stop()?;
            (m.to_string_lossy().to_string(), s.to_string_lossy().to_string())
        } else {
            (String::new(), String::new())
        };

        let telemetry_path = if let Some(mut r) = self.telemetry_logger.take() {
            r.stop().to_string_lossy().to_string()
        } else {
            String::new()
        };

        let metadata = SessionMetadata {
            id: session_id,
            created_at: Local::now().to_rfc3339(),
            screen_track: screen_path,
            camera_raw_track: camera_path,
            mic_track: mic_path,
            sys_audio_track: sys_path,
            telemetry_file: telemetry_path,
        };

        if let Some(dir) = &self.session_dir {
            let meta_file = dir.join("session_metadata.json");
            let _ = std::fs::write(meta_file, serde_json::to_string_pretty(&metadata)?);
        }

        println!("[SessionManager] Finalized session metadata for {}", metadata.id);
        Ok(Some(metadata))
    }

    pub fn discard(&mut self) -> Result<()> {
        let _ = self.session_id.take();
        if let Some(mut r) = self.screen_recorder.take() {
            let _ = r.discard();
        }
        if let Some(mut r) = self.camera_recorder.take() {
            let _ = r.discard();
        }
        if let Some(mut r) = self.audio_recorder.take() {
            let _ = r.discard();
        }
        if let Some(mut r) = self.telemetry_logger.take() {
            r.discard();
        }
        if let Some(dir) = self.session_dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
        println!("[SessionManager] Discarded recording buffer completely (Loom instant trash)");
        Ok(())
    }

    pub fn toggle_live_zoom(&self, active: bool) {
        if let Some(logger) = &self.telemetry_logger {
            logger.set_zoom_active(active);
        }
    }
}
