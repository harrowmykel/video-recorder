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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateAudioRequest {
    pub mic_device: Option<String>,
    pub mic_muted: Option<bool>,
    pub sys_audio_muted: Option<bool>,
}

fn default_status_completed() -> String {
    "completed".to_string()
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
    #[serde(default)]
    pub screen_manifest: String,
    #[serde(default)]
    pub camera_manifest: String,
    #[serde(default)]
    pub mic_manifest: String,
    #[serde(default)]
    pub sys_audio_manifest: String,
    #[serde(default)]
    pub chunk_count: u32,
    #[serde(default = "default_status_completed")]
    pub status: String,
}

pub struct SessionManager {
    session_id: Option<String>,
    session_dir: Option<PathBuf>,
    last_session_dir: Option<PathBuf>,
    last_metadata: Option<SessionMetadata>,
    started_at: Option<Instant>,
    created_at_rfc3339: Option<String>,
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
            created_at_rfc3339: None,
            is_paused: false,
            screen_recorder: None,
            camera_recorder: None,
            audio_recorder: None,
            telemetry_logger: None,
        }
    }
}

pub fn default_recordings_base_dir() -> PathBuf {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"));
    if let Ok(home) = home {
        let dir = PathBuf::from(home).join("Videos").join("studio").join("projects");
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir;
        }
    }
    let fallback = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("studio")
        .join("projects");
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

        let session_id = format!("session_{}", uuid::Uuid::new_v4());
        let session_dir = base_dir.join(&session_id);
        std::fs::create_dir_all(&session_dir)?;

        let chunks_dir = session_dir.join("chunks");
        std::fs::create_dir_all(&chunks_dir)?;

        let screen_path = session_dir.join("screen_clean.mp4");
        let camera_path = session_dir.join("camera_raw.mp4");
        let mic_path = session_dir.join("audio_mic.wav");
        let sys_path = session_dir.join("audio_system.wav");
        let telemetry_path = session_dir.join("telemetry.json");

        let screen_manifest = session_dir.join("screen_manifest.ndjson");
        let camera_manifest = session_dir.join("camera_manifest.ndjson");
        let mic_manifest = session_dir.join("mic_manifest.ndjson");
        let sys_manifest = session_dir.join("sys_audio_manifest.ndjson");

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

        // 1. Start Screen Recorder (Chunked)
        let mut screen_rec = ScreenRecorder::new_chunked(
            screen_path.clone(),
            chunks_dir.clone(),
            screen_manifest.clone(),
            req.source_mode.clone(),
            req.window_id.clone(),
        );
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
            let mut rec = CameraRecorder::new(camera_path.clone());
            if let Err(e) = rec.start(req.camera_device.as_deref()) {
                eprintln!("[SessionManager] Warning starting camera recorder: {}", e);
            }
            Some(rec)
        } else {
            println!("[SessionManager] Camera recording disabled by user ('none')");
            None
        };

        // 3. Start Audio Recorder (Chunked)
        let mut audio_rec = AudioRecorder::new_chunked(
            mic_path.clone(),
            sys_path.clone(),
            chunks_dir.clone(),
            mic_manifest.clone(),
            sys_manifest.clone(),
        );
        let mic_muted = req.mic_muted.unwrap_or(false);
        let sys_muted = req.sys_audio_muted.unwrap_or(false);
        if let Err(e) = audio_rec.start_with_options(mic_muted, sys_muted, req.mic_device.as_deref()) {
            eprintln!("[SessionManager] Warning starting audio recorder: {}", e);
        }

        // 4. Start Telemetry Logger
        let mut telemetry_log = TelemetryLogger::new(telemetry_path.clone());
        telemetry_log.start();

        let created_at = Local::now().to_rfc3339();
        let initial_meta = SessionMetadata {
            id: session_id.clone(),
            created_at: created_at.clone(),
            duration_ms: 0,
            session_dir: session_dir.to_string_lossy().to_string(),
            screen_track: screen_path.to_string_lossy().to_string(),
            camera_raw_track: if camera_rec.is_some() {
                camera_path.to_string_lossy().to_string()
            } else {
                String::new()
            },
            mic_track: mic_path.to_string_lossy().to_string(),
            sys_audio_track: sys_path.to_string_lossy().to_string(),
            telemetry_file: telemetry_path.to_string_lossy().to_string(),
            screen_manifest: screen_manifest.to_string_lossy().to_string(),
            camera_manifest: camera_manifest.to_string_lossy().to_string(),
            mic_manifest: mic_manifest.to_string_lossy().to_string(),
            sys_audio_manifest: sys_manifest.to_string_lossy().to_string(),
            chunk_count: 0,
            status: "recording".to_string(),
        };

        if let Ok(meta_json) = serde_json::to_string_pretty(&initial_meta) {
            let _ = std::fs::write(session_dir.join("metadata.json"), &meta_json);
        }

        self.session_id = Some(session_id.clone());
        self.session_dir = Some(session_dir.clone());
        self.last_session_dir = Some(session_dir);
        self.started_at = Some(Instant::now());
        self.created_at_rfc3339 = Some(created_at);
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

    pub fn update_audio(&mut self, req: UpdateAudioRequest) -> Result<()> {
        if let Some(r) = &mut self.audio_recorder {
            r.update_audio(
                req.mic_device.as_deref(),
                req.mic_muted,
                req.sys_audio_muted,
            )?;
        }
        Ok(())
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

        let chunk_count = if let Some(dir) = &self.session_dir {
            let chunks_d = dir.join("chunks");
            std::fs::read_dir(&chunks_d).map(|entries| entries.count() as u32).unwrap_or(0)
        } else {
            0
        };

        // If camera chunks were uploaded directly to chunks/, stitch camera_alpha.webm for unified review
        if let Some(dir) = &self.session_dir {
            let chunks_d = dir.join("chunks");
            let mut cam_chunks = Vec::new();
            if let Ok(entries) = std::fs::read_dir(&chunks_d) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("camera_chunk_") && name.ends_with(".webm") {
                            cam_chunks.push(path);
                        }
                    }
                }
            }
            cam_chunks.sort();
            if !cam_chunks.is_empty() {
                let concat_list_path = chunks_d.join("camera_concat.txt");
                let mut content = String::new();
                for f in &cam_chunks {
                    content.push_str(&format!("file '{}'\n", f.to_string_lossy()));
                }
                let _ = std::fs::write(&concat_list_path, content);
                let unified_webm = dir.join("camera_alpha.webm");
                let unified_mp4 = dir.join("camera_raw.mp4");
                let _ = Command::new("ffmpeg")
                    .arg("-y")
                    .arg("-f").arg("concat")
                    .arg("-safe").arg("0")
                    .arg("-i").arg(&concat_list_path)
                    .args(["-c", "copy"])
                    .arg(&unified_webm)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();

                let _ = Command::new("ffmpeg")
                    .arg("-y")
                    .arg("-i").arg(&unified_webm)
                    .args([
                        "-c:v", "libx264",
                        "-preset", "veryfast",
                        "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart",
                    ])
                    .arg(&unified_mp4)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();

                let _ = std::fs::remove_file(&concat_list_path);
            }
        }

        let created_at = self
            .created_at_rfc3339
            .take()
            .unwrap_or_else(|| Local::now().to_rfc3339());

        let metadata = SessionMetadata {
            id: session_id,
            created_at,
            duration_ms,
            session_dir: dir_str.clone(),
            screen_track: screen_path,
            camera_raw_track: camera_path,
            mic_track: mic_path,
            sys_audio_track: sys_path,
            telemetry_file: telemetry_path,
            screen_manifest: format!("{}/screen_manifest.ndjson", dir_str),
            camera_manifest: format!("{}/camera_manifest.ndjson", dir_str),
            mic_manifest: format!("{}/mic_manifest.ndjson", dir_str),
            sys_audio_manifest: format!("{}/sys_audio_manifest.ndjson", dir_str),
            chunk_count,
            status: "completed".to_string(),
        };

        if let Some(dir) = &self.session_dir {
            self.last_session_dir = Some(dir.clone());
            let meta_json = serde_json::to_string_pretty(&metadata)?;
            let _ = std::fs::write(dir.join("metadata.json"), &meta_json);
        }

        self.last_metadata = Some(metadata.clone());
        println!("[SessionManager] Finalized session metadata for {}", metadata.id);
        Ok(Some(metadata))
    }

    pub fn save_uploaded_camera_chunk(
        &self,
        chunk_idx: u32,
        bytes: &[u8],
        metadata_json: Option<&str>,
    ) -> Result<PathBuf> {
        if bytes.is_empty() {
            return Ok(PathBuf::new());
        }
        let target_dir = self
            .session_dir
            .as_ref()
            .or(self.last_session_dir.as_ref())
            .cloned()
            .unwrap_or_else(default_recordings_base_dir);
        let chunks_dir = target_dir.join("chunks");
        std::fs::create_dir_all(&chunks_dir)?;

        let filename = format!("camera_chunk_{:04}.webm", chunk_idx);
        let chunk_path = chunks_dir.join(&filename);
        std::fs::write(&chunk_path, bytes)?;

        let manifest_path = target_dir.join("camera_manifest.ndjson");
        if let Some(meta_str) = metadata_json {
            if let Ok(mut entry) = serde_json::from_str::<serde_json::Value>(meta_str) {
                if let Some(obj) = entry.as_object_mut() {
                    obj.insert("file".to_string(), serde_json::json!(format!("chunks/{}", filename)));
                    obj.insert("byte_size".to_string(), serde_json::json!(bytes.len()));
                    let _ = crate::session::NdjsonWriter::append_record(&manifest_path, &obj);
                }
            }
        }

        Ok(chunk_path)
    }

    pub fn delete_session(&mut self, session_id: &str) -> Result<bool> {
        let base_dir = default_recordings_base_dir();
        let target_dir = base_dir.join(session_id);
        if target_dir.exists() {
            std::fs::remove_dir_all(&target_dir)?;
            println!("[SessionManager] Deleted session directory: {:?}", target_dir);
            if self.session_id.as_deref() == Some(session_id) {
                self.session_id = None;
                self.session_dir = None;
            }
            if self.last_metadata.as_ref().map(|m| m.id == session_id).unwrap_or(false) {
                self.last_metadata = None;
            }
            return Ok(true);
        }
        Ok(false)
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
    let mut seen_ids = std::collections::HashSet::new();

    if let Ok(entries) = std::fs::read_dir(base_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("session")
                    .to_string();

                // 1. Read metadata.json
                let meta_file = path.join("metadata.json");
                if let Ok(raw) = std::fs::read_to_string(&meta_file) {
                    if let Ok(meta) = serde_json::from_str::<SessionMetadata>(&raw) {
                        if !seen_ids.contains(&meta.id) {
                            seen_ids.insert(meta.id.clone());
                            list.push(meta);
                        }
                        continue;
                    }
                }

                // 2. Fallback: use folder name as session id, creation/modification time as created_at
                if !seen_ids.contains(&folder_name) {
                    let screen_path = path.join("screen_clean.mp4");
                    let cam_track = path.join("camera_raw.mp4");
                    let chunks_d = path.join("chunks");

                    // Consider valid if either screen_clean.mp4 or chunks/ exists
                    if screen_path.exists() || chunks_d.exists() {
                        let created_at = entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                            .map(|sys_time| {
                                let dt: chrono::DateTime<Local> = sys_time.into();
                                dt.to_rfc3339()
                            })
                            .unwrap_or_else(|| Local::now().to_rfc3339());

                        let camera_raw_track = if cam_track.exists() {
                            cam_track.to_string_lossy().to_string()
                        } else {
                            String::new()
                        };

                        let screen_manifest = path.join("screen_manifest.ndjson");
                        let camera_manifest = path.join("camera_manifest.ndjson");
                        let mic_manifest = path.join("mic_manifest.ndjson");
                        let sys_manifest = path.join("sys_audio_manifest.ndjson");
                        let chunk_count = std::fs::read_dir(&chunks_d).map(|e| e.count() as u32).unwrap_or(0);

                        let fallback_meta = SessionMetadata {
                            id: folder_name.clone(),
                            created_at,
                            duration_ms: 15000,
                            session_dir: path.to_string_lossy().to_string(),
                            screen_track: if screen_path.exists() { screen_path.to_string_lossy().to_string() } else { String::new() },
                            camera_raw_track,
                            mic_track: path.join("audio_mic.wav").to_string_lossy().to_string(),
                            sys_audio_track: path.join("audio_system.wav").to_string_lossy().to_string(),
                            telemetry_file: path.join("telemetry.json").to_string_lossy().to_string(),
                            screen_manifest: screen_manifest.to_string_lossy().to_string(),
                            camera_manifest: camera_manifest.to_string_lossy().to_string(),
                            mic_manifest: mic_manifest.to_string_lossy().to_string(),
                            sys_audio_manifest: sys_manifest.to_string_lossy().to_string(),
                            chunk_count,
                            status: "completed".to_string(),
                        };

                        seen_ids.insert(folder_name);
                        list.push(fallback_meta);
                    }
                }
            }
        }
    }
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_audio_request_struct() {
        let json_payload = r#"{"mic_device":"pulse_usb_card","mic_muted":true,"sys_audio_muted":false}"#;
        let req: UpdateAudioRequest = serde_json::from_str(json_payload).unwrap();
        assert_eq!(req.mic_device.as_deref(), Some("pulse_usb_card"));
        assert_eq!(req.mic_muted, Some(true));
        assert_eq!(req.sys_audio_muted, Some(false));
    }

    #[test]
    fn test_update_audio_on_idle_manager() {
        let mut mgr = SessionManager::default();
        let req = UpdateAudioRequest {
            mic_device: Some("mic_1".to_string()),
            mic_muted: Some(false),
            sys_audio_muted: Some(true),
        };
        let res = mgr.update_audio(req);
        assert!(res.is_ok());
    }
}
