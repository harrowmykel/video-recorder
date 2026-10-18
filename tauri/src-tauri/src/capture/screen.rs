use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::io::Write;
use anyhow::{Result, Context};

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
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y");

        #[cfg(target_os = "linux")]
        {
            let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0.0".to_string());
            cmd.args([
                "-f", "x11grab",
                "-draw_mouse", "1",
                "-framerate", &fps.to_string(),
                "-video_size", &format!("{}x{}", width, height),
                "-i", &display,
            ]);
        }

        #[cfg(target_os = "windows")]
        {
            cmd.args([
                "-f", "gdigrab",
                "-draw_mouse", "1",
                "-framerate", &fps.to_string(),
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

        // Crash-resilient fragmented MP4 flags
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

    pub fn stop(&mut self) -> Result<PathBuf> {
        if let Some(mut child) = self.process.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q\n");
                let _ = stdin.flush();
            }

            let _ = child.wait();

            // Fast remux from fragmented MP4 to standard faststart MP4
            if self.temp_path.exists() {
                let _ = Command::new("ffmpeg")
                    .arg("-y")
                    .arg("-i")
                    .arg(&self.temp_path)
                    .args(["-c", "copy", "-movflags", "+faststart"])
                    .arg(&self.output_path)
                    .status();

                let _ = std::fs::remove_file(&self.temp_path);
            }
        }
        Ok(self.output_path.clone())
    }

    pub fn discard(&mut self) -> Result<()> {
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
