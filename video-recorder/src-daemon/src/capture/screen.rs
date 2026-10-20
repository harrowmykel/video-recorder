use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::io::Write;
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: String,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct ScreenCaptureConfig {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

impl Default for ScreenCaptureConfig {
    fn default() -> Self {
        let (w, h) = detect_screen_dimensions();
        Self {
            x: 0,
            y: 0,
            width: w,
            height: h,
            fps: 60,
        }
    }
}

pub fn detect_screen_dimensions() -> (u32, u32) {
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("xrandr").arg("--current").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(idx) = line.find("current ") {
                    let after = &line[idx + 8..];
                    let parts: Vec<&str> = after.split(',').next().unwrap_or("").split_whitespace().collect();
                    if parts.len() >= 3 && parts[1] == "x" {
                        if let (Ok(w), Ok(h)) = (parts[0].parse::<u32>(), parts[2].parse::<u32>()) {
                            if w > 0 && h > 0 {
                                return (w & !1, h & !1);
                            }
                        }
                    }
                }
            }
        }
    }
    (1920, 1080)
}

pub fn enumerate_displays() -> Vec<DisplayInfo> {
    let mut displays = Vec::new();
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("xrandr").arg("--current").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains(" connected ") {
                    let tokens: Vec<&str> = line.split_whitespace().collect();
                    if tokens.is_empty() {
                        continue;
                    }
                    let name = tokens[0].to_string();
                    let is_primary = line.contains(" primary ");
                    // Find token like 1920x1080+0+0
                    for tok in &tokens {
                        if tok.contains('x') && tok.contains('+') {
                            let plus_parts: Vec<&str> = tok.split('+').collect();
                            if plus_parts.len() >= 3 {
                                let dim_parts: Vec<&str> = plus_parts[0].split('x').collect();
                                if dim_parts.len() == 2 {
                                    if let (Ok(w), Ok(h), Ok(x), Ok(y)) = (
                                        dim_parts[0].parse::<u32>(),
                                        dim_parts[1].parse::<u32>(),
                                        plus_parts[1].parse::<i32>(),
                                        plus_parts[2].parse::<i32>(),
                                    ) {
                                        displays.push(DisplayInfo {
                                            id: name.clone(),
                                            name: format!("{} ({}×{})", name, w, h),
                                            x,
                                            y,
                                            width: w,
                                            height: h,
                                            is_primary,
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if displays.is_empty() {
        let (w, h) = detect_screen_dimensions();
        displays.push(DisplayInfo {
            id: "primary".to_string(),
            name: format!("Primary Display ({}×{})", w, h),
            x: 0,
            y: 0,
            width: w,
            height: h,
            is_primary: true,
        });
    }
    displays
}

pub fn enumerate_windows() -> Vec<WindowInfo> {
    let mut windows = Vec::new();
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("xwininfo").args(["-root", "-tree"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if !trimmed.starts_with("0x") {
                    continue;
                }
                let first_quote = match trimmed.find('"') {
                    Some(i) => i,
                    None => continue,
                };
                let win_id = trimmed[..first_quote].trim().to_string();
                let rest = &trimmed[first_quote + 1..];
                let end_title = match rest.find("\": (") {
                    Some(i) => i,
                    None => continue,
                };
                let title = rest[..end_title].trim().to_string();
                if title.is_empty()
                    || title.starts_with("Desktop Icons")
                    || title == "Recorder Controls"
                    || title == "Camera Overlay"
                    || title == "Recording Countdown"
                    || title == "Screen Annotations"
                    || title == "org.gnome.Nautilus"
                {
                    continue;
                }

                let after_title = &rest[end_title + 4..];
                let close_paren = match after_title.find(')') {
                    Some(i) => i,
                    None => continue,
                };
                let class_section = &after_title[..close_paren];
                let app_name = class_section
                    .split('"')
                    .filter(|s| !s.trim().is_empty())
                    .last()
                    .unwrap_or("App")
                    .to_string();

                let geom_section = after_title[close_paren + 1..].trim();
                let geom_tokens: Vec<&str> = geom_section.split_whitespace().collect();
                if geom_tokens.is_empty() {
                    continue;
                }
                // Parse e.g. 1870x1048+50+32
                let dim_tok = geom_tokens[0];
                let x_idx = match dim_tok.find('x') {
                    Some(i) => i,
                    None => continue,
                };
                let width: u32 = match dim_tok[..x_idx].parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let after_w = &dim_tok[x_idx + 1..];
                let plus_idx = match after_w.find(['+', '-']) {
                    Some(i) => i,
                    None => continue,
                };
                let height: u32 = match after_w[..plus_idx].parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                if width < 240 || height < 160 {
                    continue;
                }

                // Parse absolute coordinates from last token if available (e.g. +50+32)
                let abs_tok = geom_tokens.last().copied().unwrap_or("+0+0");
                let (x, y) = parse_xy_offset(abs_tok);

                windows.push(WindowInfo {
                    id: win_id,
                    title,
                    app_name,
                    x: x.max(0),
                    y: y.max(0),
                    width,
                    height,
                });
            }
        }
    }
    windows
}

fn parse_xy_offset(tok: &str) -> (i32, i32) {
    let mut indices = Vec::new();
    for (i, ch) in tok.char_indices() {
        if ch == '+' || ch == '-' {
            indices.push(i);
        }
    }
    if indices.len() >= 2 {
        let x_str = &tok[indices[0]..indices[1]];
        let y_str = &tok[indices[1]..];
        let x = x_str.parse::<i32>().unwrap_or(0);
        let y = y_str.parse::<i32>().unwrap_or(0);
        return (x, y);
    }
    (0, 0)
}

pub struct ScreenRecorder {
    process: Option<Child>,
    output_path: PathBuf,
    temp_path: PathBuf,
    chunks_dir: Option<PathBuf>,
    manifest_path: Option<PathBuf>,
    source_mode: String,
    source_id: String,
    screen_w: u32,
    screen_h: u32,
    screen_fps: u32,
    chunk_duration_sec: u32,
}

impl ScreenRecorder {
    pub fn new(output_path: PathBuf) -> Self {
        let temp_path = output_path.with_extension("temp.mp4");
        Self {
            process: None,
            output_path,
            temp_path,
            chunks_dir: None,
            manifest_path: None,
            source_mode: "display".to_string(),
            source_id: "primary".to_string(),
            screen_w: 1920,
            screen_h: 1080,
            screen_fps: 60,
            chunk_duration_sec: 15,
        }
    }

    pub fn new_chunked(
        output_path: PathBuf,
        chunks_dir: PathBuf,
        manifest_path: PathBuf,
        source_mode: Option<String>,
        source_id: Option<String>,
        chunk_duration_sec: Option<u32>,
    ) -> Self {
        let temp_path = output_path.with_extension("temp.mp4");
        Self {
            process: None,
            output_path,
            temp_path,
            chunks_dir: Some(chunks_dir),
            manifest_path: Some(manifest_path),
            source_mode: source_mode.unwrap_or_else(|| "display".to_string()),
            source_id: source_id.unwrap_or_else(|| "primary".to_string()),
            screen_w: 1920,
            screen_h: 1080,
            screen_fps: 60,
            chunk_duration_sec: chunk_duration_sec.unwrap_or(15).max(1),
        }
    }

    pub fn start(&mut self, width: u32, height: u32, fps: u32) -> Result<()> {
        self.start_with_config(ScreenCaptureConfig {
            x: 0,
            y: 0,
            width,
            height,
            fps,
        })
    }

    pub fn start_with_config(&mut self, config: ScreenCaptureConfig) -> Result<()> {
        let (max_w, max_h) = detect_screen_dimensions();
        let x = config.x.min(max_w.saturating_sub(64));
        let y = config.y.min(max_h.saturating_sub(64));
        let raw_w = if config.width == 0 { max_w } else { config.width };
        let raw_h = if config.height == 0 { max_h } else { config.height };
        let clamped_w = raw_w.min(max_w.saturating_sub(x)).max(64) & !1;
        let clamped_h = raw_h.min(max_h.saturating_sub(y)).max(64) & !1;
        let fps = config.fps.clamp(15, 60);

        self.screen_w = clamped_w;
        self.screen_h = clamped_h;
        self.screen_fps = fps;

        let mut cmd = crate::ffmpeg::ffmpeg_cmd();
        cmd.arg("-y");

        #[cfg(target_os = "linux")]
        {
            let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0.0".to_string());
            let input_spec = if x > 0 || y > 0 {
                format!("{}+{},{}", display, x, y)
            } else {
                display
            };
            cmd.args([
                "-f", "x11grab",
                "-draw_mouse", "1",
                "-framerate", &fps.to_string(),
                "-video_size", &format!("{}x{}", clamped_w, clamped_h),
                "-i", &input_spec,
            ]);
        }

        #[cfg(target_os = "windows")]
        {
            cmd.args([
                "-f", "gdigrab",
                "-draw_mouse", "1",
                "-framerate", &fps.to_string(),
                "-offset_x", &x.to_string(),
                "-offset_y", &y.to_string(),
                "-video_size", &format!("{}x{}", clamped_w, clamped_h),
                "-i", "desktop",
            ]);
        }

        #[cfg(target_os = "macos")]
        {
            cmd.args([
                "-f", "avfoundation",
                "-framerate", &fps.to_string(),
                "-capture_cursor", "1",
                "-i", "1:none",
            ]);
        }

        if let Some(chunks_dir) = &self.chunks_dir {
            let _ = std::fs::create_dir_all(chunks_dir);
            let start_num = if let Ok(entries) = std::fs::read_dir(chunks_dir) {
                entries.flatten().filter(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.starts_with("screen_chunk_") && n.ends_with(".mp4")
                }).count()
            } else {
                0
            };

            cmd.args([
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "18",
                "-pix_fmt", "yuv420p",
                "-g", "60",
                "-keyint_min", "60",
                "-sc_threshold", "0",
                "-f", "segment",
                "-segment_time", &self.chunk_duration_sec.to_string(),
                "-segment_format", "mp4",
                "-segment_start_number", &start_num.to_string(),
                "-reset_timestamps", "1",
                "-movflags", "+faststart",
            ]);
            let chunk_pattern = chunks_dir.join("screen_chunk_%04d.mp4");
            cmd.arg(&chunk_pattern);
        } else {
            cmd.args([
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "18",
                "-pix_fmt", "yuv420p",
                "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
            ]);
            cmd.arg(&self.temp_path);
        }

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        let child = cmd.spawn().context("Failed to spawn screen capture ffmpeg process")?;
        self.process = Some(child);
        Ok(())
    }

    pub fn pause(&mut self) {
        #[cfg(unix)]
        if let Some(child) = &self.process {
            let _ = Command::new("kill")
                .args(["-STOP", &child.id().to_string()])
                .status();
        }
    }

    pub fn resume(&mut self) {
        #[cfg(unix)]
        if let Some(child) = &self.process {
            let _ = Command::new("kill")
                .args(["-CONT", &child.id().to_string()])
                .status();
        }
    }

    pub fn stop_current_chunk(&mut self) {
        self.resume();
        if let Some(mut child) = self.process.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q\n");
                let _ = stdin.flush();
            }
            #[cfg(unix)]
            {
                let _ = Command::new("kill")
                    .args(["-INT", &child.id().to_string()])
                    .status();
            }

            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1500);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => {
                        if std::time::Instant::now() >= deadline {
                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(30));
                    }
                    Err(_) => break,
                }
            }
        }
    }

    pub fn switch_source(
        &mut self,
        source_mode: String,
        source_id: String,
        config: ScreenCaptureConfig,
    ) -> Result<()> {
        self.stop_current_chunk();
        self.source_mode = source_mode;
        self.source_id = source_id;
        self.start_with_config(config)
    }

    pub fn stop(&mut self) -> Result<PathBuf> {
        self.resume();
        if let Some(mut child) = self.process.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q\n");
                let _ = stdin.flush();
            }
            #[cfg(unix)]
            {
                let _ = Command::new("kill")
                    .args(["-INT", &child.id().to_string()])
                    .status();
            }

            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1800);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => {
                        if std::time::Instant::now() >= deadline {
                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(40));
                    }
                    Err(_) => break,
                }
            }

            if let Some(chunks_dir) = &self.chunks_dir {
                let mut chunk_files = Vec::new();
                if let Ok(entries) = std::fs::read_dir(chunks_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name.starts_with("screen_chunk_") && name.ends_with(".mp4") {
                                chunk_files.push(path);
                            }
                        }
                    }
                }
                chunk_files.sort();

                if let Some(manifest_path) = &self.manifest_path {
                    for (idx, chunk_file) in chunk_files.iter().enumerate() {
                        let file_size = std::fs::metadata(chunk_file).map(|m| m.len()).unwrap_or(0);
                        let duration_ms = self.chunk_duration_sec as u64 * 1000;
                        let start_ms = (idx as u64) * duration_ms;
                        let entry = crate::session::ScreenChunkEntry {
                            chunk_id: format!("screen_chunk_{:04}", idx + 1),
                            start_ms,
                            end_ms: start_ms + duration_ms,
                            duration_ms,
                            chunk_type: "screen".to_string(),
                            file: format!("chunks/{}", chunk_file.file_name().unwrap().to_string_lossy()),
                            source_mode: self.source_mode.clone(),
                            source_id: self.source_id.clone(),
                            resolution: crate::session::ScreenResolution {
                                width: self.screen_w,
                                height: self.screen_h,
                            },
                            fps: self.screen_fps,
                            byte_size: file_size,
                        };
                        let _ = crate::session::NdjsonWriter::append_record(manifest_path, &entry);
                    }
                }

                if !chunk_files.is_empty() {
                    let concat_list_path = chunks_dir.join("screen_concat.txt");
                    let mut concat_content = String::new();
                    for f in &chunk_files {
                        let rel = f.file_name().unwrap_or(f.as_os_str()).to_string_lossy().replace('\'', "'\\''");
                        concat_content.push_str(&format!("file '{}'\n", rel));
                    }
                    let _ = std::fs::write(&concat_list_path, concat_content);

                    let status = crate::ffmpeg::ffmpeg_cmd()
                        .arg("-y")
                        .arg("-f")
                        .arg("concat")
                        .arg("-safe")
                        .arg("0")
                        .arg("-i")
                        .arg(&concat_list_path)
                        .args(["-c", "copy", "-movflags", "+faststart"])
                        .arg(&self.output_path)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();

                    if status.is_err() || !status.unwrap().success() {
                        let _ = crate::ffmpeg::ffmpeg_cmd()
                            .arg("-y")
                            .arg("-f")
                            .arg("concat")
                            .arg("-safe")
                            .arg("0")
                            .arg("-i")
                            .arg(&concat_list_path)
                            .args([
                                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
                                "-c:v", "libx264",
                                "-preset", "veryfast",
                                "-crf", "18",
                                "-pix_fmt", "yuv420p",
                                "-movflags", "+faststart"
                            ])
                            .arg(&self.output_path)
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .status();
                    }

                    let _ = std::fs::remove_file(&concat_list_path);
                }
            } else if self.temp_path.exists() {
                let _ = crate::ffmpeg::ffmpeg_cmd()
                    .arg("-y")
                    .arg("-i")
                    .arg(&self.temp_path)
                    .args(["-c", "copy", "-movflags", "+faststart"])
                    .arg(&self.output_path)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();

                let _ = std::fs::remove_file(&self.temp_path);
            }
        }
        Ok(self.output_path.clone())
    }

    pub fn discard(&mut self) -> Result<()> {
        self.resume();
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(chunks_dir) = &self.chunks_dir {
            if chunks_dir.exists() {
                let _ = std::fs::remove_dir_all(chunks_dir);
            }
        }
        if let Some(manifest_path) = &self.manifest_path {
            if manifest_path.exists() {
                let _ = std::fs::remove_file(manifest_path);
            }
        }
        if self.temp_path.exists() {
            let _ = std::fs::remove_file(&self.temp_path);
        }
        if self.output_path.exists() {
            let _ = std::fs::remove_file(&self.output_path);
        }
        Ok(())
    }

}

impl Drop for ScreenRecorder {
    fn drop(&mut self) {
        self.resume();
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
