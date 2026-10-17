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
}

impl ScreenRecorder {
    pub fn new(output_path: PathBuf) -> Self {
        let temp_path = output_path.with_extension("temp.mp4");
        Self {
            process: None,
            output_path,
            temp_path,
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

        let mut cmd = Command::new("ffmpeg");
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

        cmd.args([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
        ]);

        cmd.arg(&self.temp_path);
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

            if self.temp_path.exists() {
                let _ = Command::new("ffmpeg")
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
