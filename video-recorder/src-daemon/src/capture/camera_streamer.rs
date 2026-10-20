use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use anyhow::{Context, Result};
use tokio::sync::broadcast;
use crate::ai::SegmentationEngine;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CameraStreamerConfig {
    pub bg_mode: String, // "blur", "transparent", "gradient", "off"
    pub bg_model: Option<String>,
    pub device_name: Option<String>,
}

impl Default for CameraStreamerConfig {
    fn default() -> Self {
        Self {
            bg_mode: "blur".to_string(),
            bg_model: Some("mediapipe_fast".to_string()),
            device_name: None,
        }
    }
}

struct RecordingSinks {
    raw_child: Option<Child>,
    alpha_child: Option<Child>,
    raw_path: PathBuf,
    alpha_path: PathBuf,
}

pub struct CameraStreamer {
    config: Arc<RwLock<CameraStreamerConfig>>,
    segmentation: Option<Arc<SegmentationEngine>>,
    frame_tx: broadcast::Sender<bytes::Bytes>,
    running: Arc<AtomicBool>,
    recording_sinks: Arc<Mutex<Option<RecordingSinks>>>,
    active_subscribers: Arc<std::sync::atomic::AtomicUsize>,
}

impl CameraStreamer {
    pub fn new(segmentation: Option<Arc<SegmentationEngine>>) -> Self {
        let (frame_tx, _) = broadcast::channel(16);
        Self {
            config: Arc::new(RwLock::new(CameraStreamerConfig::default())),
            segmentation,
            frame_tx,
            running: Arc::new(AtomicBool::new(false)),
            recording_sinks: Arc::new(Mutex::new(None)),
            active_subscribers: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<bytes::Bytes> {
        self.active_subscribers.fetch_add(1, Ordering::SeqCst);
        self.frame_tx.subscribe()
    }

    pub fn unsubscribe(&self) {
        let prev = self.active_subscribers.fetch_sub(1, Ordering::SeqCst);
        if prev == 0 {
            self.active_subscribers.store(0, Ordering::SeqCst);
        }
    }

    pub fn set_bg_mode(&self, mode: &str) {
        if let Ok(mut cfg) = self.config.write() {
            cfg.bg_mode = mode.to_string();
        }
    }

    pub fn get_bg_mode(&self) -> String {
        self.config
            .read()
            .map(|c| c.bg_mode.clone())
            .unwrap_or_else(|_| "blur".to_string())
    }

    pub fn set_bg_model(&self, model: &str) {
        if let Ok(mut cfg) = self.config.write() {
            cfg.bg_model = Some(model.to_string());
        }
    }

    pub fn get_bg_model(&self) -> String {
        self.config
            .read()
            .ok()
            .and_then(|c| c.bg_model.clone())
            .unwrap_or_else(|| "mediapipe_fast".to_string())
    }

    pub fn is_recording(&self) -> bool {
        self.recording_sinks.lock().unwrap().is_some()
    }

    pub fn start_recording(&self, session_dir: &Path) -> Result<()> {
        let mut sinks_guard = self.recording_sinks.lock().unwrap();
        if sinks_guard.is_some() {
            return Ok(());
        }

        let raw_path = session_dir.join("camera_raw.mp4");
        let alpha_path = session_dir.join("camera_alpha.webm");

        // 1. Raw FFmpeg recorder (H.264 MP4 from raw RGB24 frames)
        let mut raw_cmd = crate::ffmpeg::ffmpeg_cmd();
        raw_cmd.args([
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-s", "640x480",
            "-r", "30",
            "-i", "-",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ]);
        raw_cmd.arg(&raw_path);
        raw_cmd.stdin(Stdio::piped());
        raw_cmd.stdout(Stdio::null());
        raw_cmd.stderr(Stdio::null());

        let raw_child = raw_cmd.spawn().context("Failed to spawn camera raw recorder")?;

        // 2. Alpha/Cutout FFmpeg recorder (VP9 WebM with yuva420p transparency from RGBA frames)
        let mut alpha_cmd = crate::ffmpeg::ffmpeg_cmd();
        alpha_cmd.args([
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", "640x480",
            "-r", "30",
            "-i", "-",
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-b:v", "2M",
            "-deadline", "realtime",
            "-cpu-used", "5",
        ]);
        alpha_cmd.arg(&alpha_path);
        alpha_cmd.stdin(Stdio::piped());
        alpha_cmd.stdout(Stdio::null());
        alpha_cmd.stderr(Stdio::null());

        let alpha_child = alpha_cmd.spawn().context("Failed to spawn camera alpha recorder")?;

        *sinks_guard = Some(RecordingSinks {
            raw_child: Some(raw_child),
            alpha_child: Some(alpha_child),
            raw_path,
            alpha_path,
        });

        Ok(())
    }

    pub fn stop_recording(&self) -> Result<Option<(PathBuf, PathBuf)>> {
        let mut sinks_guard = self.recording_sinks.lock().unwrap();
        if let Some(mut sinks) = sinks_guard.take() {
            if let Some(mut raw_child) = sinks.raw_child.take() {
                if let Some(mut stdin) = raw_child.stdin.take() {
                    let _ = stdin.write_all(b"q\n");
                    let _ = stdin.flush();
                }
                let _ = raw_child.wait();
            }

            if let Some(mut alpha_child) = sinks.alpha_child.take() {
                if let Some(mut stdin) = alpha_child.stdin.take() {
                    let _ = stdin.write_all(b"q\n");
                    let _ = stdin.flush();
                }
                let _ = alpha_child.wait();
            }

            return Ok(Some((sinks.raw_path, sinks.alpha_path)));
        }
        Ok(None)
    }

    pub fn start_loop(&self) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // Already running
        }

        let running = self.running.clone();
        let config = self.config.clone();
        let segmentation = self.segmentation.clone();
        let frame_tx = self.frame_tx.clone();
        let recording_sinks = self.recording_sinks.clone();
        let active_subscribers = self.active_subscribers.clone();

        std::thread::spawn(move || {
            let width = 640u32;
            let height = 480u32;
            let frame_size = (width * height * 3) as usize;

            while running.load(Ordering::SeqCst) {
                let subs = active_subscribers.load(Ordering::SeqCst);
                let rec = recording_sinks.lock().unwrap().is_some();

                // If no subscribers and not recording, throttle idle loop
                if subs == 0 && !rec {
                    std::thread::sleep(Duration::from_millis(200));
                    continue;
                }

                let device = {
                    let cfg = config.read().unwrap();
                    cfg.device_name.clone().unwrap_or_else(|| "/dev/video0".to_string())
                };

                // Spawn camera capture process (v4l2 on Linux, test pattern fallback if camera busy/absent)
                let mut cmd = crate::ffmpeg::ffmpeg_cmd();
                cmd.args(["-loglevel", "error", "-y"]);

                if std::path::Path::new(&device).exists() {
                    cmd.args([
                        "-f", "v4l2",
                        "-input_format", "mjpeg",
                        "-video_size", "640x480",
                        "-framerate", "30",
                        "-i", &device,
                        "-f", "rawvideo",
                        "-pix_fmt", "rgb24",
                        "-",
                    ]);
                } else {
                    // Fallback test card so preview stream never breaks even if webcam unplugged
                    cmd.args([
                        "-f", "lavfi",
                        "-i", "testsrc=size=640x480:rate=30",
                        "-f", "rawvideo",
                        "-pix_fmt", "rgb24",
                        "-",
                    ]);
                }

                cmd.stdin(Stdio::null());
                cmd.stdout(Stdio::piped());
                cmd.stderr(Stdio::null());

                let mut child = match cmd.spawn() {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("[CameraStreamer] Failed to spawn FFmpeg capture: {}", e);
                        std::thread::sleep(Duration::from_secs(1));
                        continue;
                    }
                };

                let mut stdout = match child.stdout.take() {
                    Some(s) => s,
                    None => {
                        let _ = child.kill();
                        continue;
                    }
                };

                let mut raw_buf = vec![0u8; frame_size];

                while running.load(Ordering::SeqCst) {
                    if let Err(_) = stdout.read_exact(&mut raw_buf) {
                        break; // EOF or camera disconnected
                    }

                    let bg_mode = {
                        config.read().map(|c| c.bg_mode.clone()).unwrap_or_else(|_| "blur".to_string())
                    };

                    // Process segmentation if engine is available
                    let composited_rgba = if let Some(ref engine) = segmentation {
                        engine.composite_frame(&raw_buf, width, height, &bg_mode).unwrap_or_else(|_| {
                            let mut fallback = vec![255u8; (width * height * 4) as usize];
                            for i in 0..(width * height) as usize {
                                fallback[i * 4] = raw_buf[i * 3];
                                fallback[i * 4 + 1] = raw_buf[i * 3 + 1];
                                fallback[i * 4 + 2] = raw_buf[i * 3 + 2];
                            }
                            fallback
                        })
                    } else {
                        let mut fallback = vec![255u8; (width * height * 4) as usize];
                        for i in 0..(width * height) as usize {
                            fallback[i * 4] = raw_buf[i * 3];
                            fallback[i * 4 + 1] = raw_buf[i * 3 + 1];
                            fallback[i * 4 + 2] = raw_buf[i * 3 + 2];
                        }
                        fallback
                    };

                    // Pipe to recording sinks if active
                    {
                        let mut sinks_guard = recording_sinks.lock().unwrap();
                        if let Some(ref mut sinks) = *sinks_guard {
                            if let Some(ref mut raw_child) = sinks.raw_child {
                                if let Some(ref mut stdin) = raw_child.stdin {
                                    let _ = stdin.write_all(&raw_buf);
                                }
                            }
                            if let Some(ref mut alpha_child) = sinks.alpha_child {
                                if let Some(ref mut stdin) = alpha_child.stdin {
                                    let _ = stdin.write_all(&composited_rgba);
                                }
                            }
                        }
                    }

                    // Prepare RGB preview buffer for MJPEG
                    let mut preview_rgb = vec![0u8; (width * height * 3) as usize];
                    for i in 0..(width * height) as usize {
                        let a = composited_rgba[i * 4 + 3] as f32 / 255.0;
                        let inv_a = 1.0 - a;
                        let fg_r = composited_rgba[i * 4] as f32;
                        let fg_g = composited_rgba[i * 4 + 1] as f32;
                        let fg_b = composited_rgba[i * 4 + 2] as f32;

                        // Slate background for transparent mode: #10121b
                        let bg_r = 16.0;
                        let bg_g = 18.0;
                        let bg_b = 27.0;

                        preview_rgb[i * 3] = (fg_r * a + bg_r * inv_a).clamp(0.0, 255.0) as u8;
                        preview_rgb[i * 3 + 1] = (fg_g * a + bg_g * inv_a).clamp(0.0, 255.0) as u8;
                        preview_rgb[i * 3 + 2] = (fg_b * a + bg_b * inv_a).clamp(0.0, 255.0) as u8;
                    }

                    // JPEG encode
                    let mut jpeg_buf = Vec::new();
                    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_buf, 75);
                    if encoder.encode(&preview_rgb, width, height, image::ExtendedColorType::Rgb8).is_ok() {
                        let _ = frame_tx.send(bytes::Bytes::from(jpeg_buf));
                    }
                }

                let _ = child.kill();
                let _ = child.wait();
                std::thread::sleep(Duration::from_millis(500));
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}
