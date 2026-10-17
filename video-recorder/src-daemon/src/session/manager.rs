use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;
use anyhow::Result;
use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::capture::{
    AudioRecorder, CameraRecorder, ScreenRecorder, ScreenCaptureConfig, TelemetryLogger,
    detect_screen_dimensions, enumerate_windows,
};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StartRecordingRequest {
    pub source_mode: Option<String>,
    pub x: Option<u32>,
    pub y: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub window_id: Option<String>,
    pub fps: Option<u32>,
    pub mic_muted: Option<bool>,
    pub sys_audio_muted: Option<bool>,
    pub camera_device: Option<String>,
    pub mic_device: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub id: String,
    pub created_at: String,
    pub duration_ms: u64,
    pub session_dir: String,
    pub screen_track: String,
    pub camera_raw_track: String,
    pub mic_track: String,
    pub sys_audio_track: String,
    pub telemetry_file: String,
}

pub struct SessionManager {
    session_id: Option<String>,
    session_dir: Option<PathBuf>,
    last_session_dir: Option<PathBuf>,
    last_metadata: Option<SessionMetadata>,
    started_at: Option<Instant>,
    is_paused: bool,
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
            last_session_dir: None,
            last_metadata: None,
            started_at: None,
            is_paused: false,
            screen_recorder: None,
            camera_recorder: None,
            audio_recorder: None,
            telemetry_logger: None,
        }
    }
}

pub fn default_recordings_base_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        let dir = PathBuf::from(home).join("Videos").join("record_studio").join("sessions");
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir;
        }
    }
    let fallback = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("recordings");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

impl SessionManager {
    pub fn is_recording(&self) -> bool {
        self.session_id.is_some()
    }

    pub fn is_paused(&self) -> bool {
        self.is_paused
    }

    pub fn current_session_id(&self) -> Option<String> {
        self.session_id.clone()
    }

    pub fn start(&mut self, base_dir: &Path) -> Result<String> {
        self.start_with_options(base_dir, StartRecordingRequest::default())
    }

    pub fn start_with_options(&mut self, base_dir: &Path, req: StartRecordingRequest) -> Result<String> {
        // Prevent duplicate/orphaned processes if already recording
        if self.is_recording() {
            let _ = self.stop();
        }

        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let session_id = format!("session_{}", timestamp);
        let session_dir = base_dir.join(&session_id);
        std::fs::create_dir_all(&session_dir)?;

        let screen_path = session_dir.join("screen_clean.mp4");
        let camera_path = session_dir.join("camera_raw.mp4");
        let mic_path = session_dir.join("audio_mic.wav");
        let sys_path = session_dir.join("audio_system.wav");
        let telemetry_path = session_dir.join("telemetry.json");

        let (default_w, default_h) = detect_screen_dimensions();
        let mut x = req.x.unwrap_or(0);
        let mut y = req.y.unwrap_or(0);
        let mut width = req.width.unwrap_or(default_w);
        let mut height = req.height.unwrap_or(default_h);
        let fps = req.fps.unwrap_or(60);

        // If source_mode == "window" and window_id is provided, look up its current geometry
        if req.source_mode.as_deref() == Some("window") {
            if let Some(target_win_id) = &req.window_id {
                if let Some(win) = enumerate_windows().into_iter().find(|w| &w.id == target_win_id) {
                    x = win.x.max(0) as u32;
                    y = win.y.max(0) as u32;
                    width = win.width;
                    height = win.height;
                }
            }
        }

        // 1. Start Screen Recorder
        let mut screen_rec = ScreenRecorder::new(screen_path);
        if let Err(e) = screen_rec.start_with_config(ScreenCaptureConfig {
            x,
            y,
            width,
            height,
            fps,
        }) {
            eprintln!("[SessionManager] Warning starting screen recorder: {}", e);
        }

        // 2. Start Camera Recorder (skipped if user selected 'none' or no camera)
        let is_camera_disabled = match req.camera_device.as_deref() {
            Some("none") | Some("") => true,
            _ => false,
        };

        let camera_rec = if !is_camera_disabled {
            let mut rec = CameraRecorder::new(camera_path);
            if let Err(e) = rec.start(req.camera_device.as_deref()) {
                eprintln!("[SessionManager] Warning starting camera recorder: {}", e);
            }
            Some(rec)
        } else {
            println!("[SessionManager] Camera recording disabled by user ('none')");
            None
        };

        // 3. Start Audio Recorder
        let mut audio_rec = AudioRecorder::new(mic_path, sys_path);
        let mic_muted = req.mic_muted.unwrap_or(false);
        let sys_muted = req.sys_audio_muted.unwrap_or(false);
        if let Err(e) = audio_rec.start_with_options(mic_muted, sys_muted, req.mic_device.as_deref()) {
            eprintln!("[SessionManager] Warning starting audio recorder: {}", e);
        }

        // 4. Start Telemetry Logger
        let mut telemetry_log = TelemetryLogger::new(telemetry_path);
        telemetry_log.start();

        self.session_id = Some(session_id.clone());
        self.session_dir = Some(session_dir.clone());
        self.last_session_dir = Some(session_dir);
        self.started_at = Some(Instant::now());
        self.is_paused = false;
        self.screen_recorder = Some(screen_rec);
        self.camera_recorder = camera_rec;
        self.audio_recorder = Some(audio_rec);
        self.telemetry_logger = Some(telemetry_log);

        println!("[SessionManager] Started multi-track session: {}", session_id);
        Ok(session_id)
    }

    pub fn pause(&mut self) {
        if !self.is_recording() || self.is_paused {
            return;
        }
        if let Some(r) = &mut self.screen_recorder {
            r.pause();
        }
        if let Some(r) = &mut self.camera_recorder {
            r.pause();
        }
        if let Some(r) = &mut self.audio_recorder {
            r.pause();
        }
        self.is_paused = true;
        println!("[SessionManager] Paused active session");
    }

    pub fn resume(&mut self) {
        if !self.is_recording() || !self.is_paused {
            return;
        }
        if let Some(r) = &mut self.screen_recorder {
            r.resume();
        }
        if let Some(r) = &mut self.camera_recorder {
            r.resume();
        }
        if let Some(r) = &mut self.audio_recorder {
            r.resume();
        }
        self.is_paused = false;
        println!("[SessionManager] Resumed active session");
    }

    pub fn stop(&mut self) -> Result<Option<SessionMetadata>> {
        let session_id = match self.session_id.take() {
            Some(id) => id,
            None => return Ok(self.last_metadata.clone()),
        };

        self.is_paused = false;
        let duration_ms = self
            .started_at
            .take()
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(1000);

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

        let dir_str = self
            .session_dir
            .as_ref()
            .map(|d| d.to_string_lossy().to_string())
            .unwrap_or_default();

        let metadata = SessionMetadata {
            id: session_id,
            created_at: Local::now().to_rfc3339(),
            duration_ms,
            session_dir: dir_str,
            screen_track: screen_path,
            camera_raw_track: camera_path,
            mic_track: mic_path,
            sys_audio_track: sys_path,
            telemetry_file: telemetry_path,
        };

        if let Some(dir) = &self.session_dir {
            self.last_session_dir = Some(dir.clone());
            let meta_file = dir.join("session_metadata.json");
            let _ = std::fs::write(meta_file, serde_json::to_string_pretty(&metadata)?);
        }

        self.last_metadata = Some(metadata.clone());
        println!("[SessionManager] Finalized session metadata for {}", metadata.id);
        Ok(Some(metadata))
    }

    pub fn save_uploaded_camera_track(&self, bytes: &[u8]) -> Result<PathBuf> {
        if bytes.is_empty() {
            return Ok(PathBuf::new());
        }
        let target_dir = self
            .session_dir
            .as_ref()
            .or(self.last_session_dir.as_ref())
            .cloned()
            .unwrap_or_else(default_recordings_base_dir);
        std::fs::create_dir_all(&target_dir)?;

        let webm_path = target_dir.join("camera_alpha.webm");
        std::fs::write(&webm_path, bytes)?;

        let mp4_path = target_dir.join("camera_raw.mp4");
        let tmp_mp4_path = target_dir.join("camera_raw_uploaded.mp4");
        let status = Command::new("ffmpeg")
            .arg("-y")
            .arg("-i")
            .arg(&webm_path)
            .args([
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
            ])
            .arg(&tmp_mp4_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if status.map(|s| s.success()).unwrap_or(false) && tmp_mp4_path.exists() {
            let _ = std::fs::rename(&tmp_mp4_path, &mp4_path);
        }

        Ok(webm_path)
    }

    pub fn discard(&mut self) -> Result<()> {
        let _ = self.session_id.take();
        self.is_paused = false;
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

pub fn list_recorded_sessions(base_dir: &Path) -> Vec<SessionMetadata> {
    let mut list = Vec::new();
    if let Ok(entries) = std::fs::read_dir(base_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let meta_path = path.join("session_metadata.json");
                if let Ok(raw) = std::fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<SessionMetadata>(&raw) {
                        list.push(meta);
                        continue;
                    }
                }
                // Fallback if session_metadata.json wasn't written yet
                let screen_path = path.join("screen_clean.mp4");
                if screen_path.exists() {
                    let id = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("session")
                        .to_string();
                    let cam_track = path.join("camera_raw.mp4");
                    let camera_raw_track = if cam_track.exists() {
                        cam_track.to_string_lossy().to_string()
                    } else {
                        String::new()
                    };

                    list.push(SessionMetadata {
                        id,
                        created_at: Local::now().to_rfc3339(),
                        duration_ms: 15000,
                        session_dir: path.to_string_lossy().to_string(),
                        screen_track: screen_path.to_string_lossy().to_string(),
                        camera_raw_track,
                        mic_track: path.join("audio_mic.wav").to_string_lossy().to_string(),
                        sys_audio_track: path.join("audio_system.wav").to_string_lossy().to_string(),
                        telemetry_file: path.join("telemetry.json").to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    list.sort_by(|a, b| b.id.cmp(&a.id));
    list
}
