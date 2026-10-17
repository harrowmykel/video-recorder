use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::io::Write;
use anyhow::{Result, Context};

pub struct CameraRecorder {
    process: Option<Child>,
    output_path: PathBuf,
}

impl CameraRecorder {
    pub fn new(output_path: PathBuf) -> Self {
        Self {
            process: None,
            output_path,
        }
    }

    pub fn start(&mut self, device_name: Option<&str>) -> Result<()> {
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y");

        #[cfg(target_os = "linux")]
        {
            let dev = device_name.unwrap_or("/dev/video0");
            cmd.args([
                "-f", "v4l2",
                "-framerate", "30",
                "-video_size", "1280x720",
                "-i", dev,
            ]);
        }

        #[cfg(target_os = "windows")]
        {
            let dev = device_name.unwrap_or("video=Integrated Camera");
            cmd.args([
                "-f", "dshow",
                "-i", dev,
            ]);
        }

        #[cfg(target_os = "macos")]
        {
            let dev = device_name.unwrap_or("0");
            cmd.args([
                "-f", "avfoundation",
                "-framerate", "30",
                "-i", &format!("none:{}", dev),
            ]);
        }

        cmd.args([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "19",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ]);

        cmd.arg(&self.output_path);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::piped());

        let child = cmd.spawn().context("Failed to spawn camera recorder process")?;
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
        }
        Ok(self.output_path.clone())
    }

    pub fn discard(&mut self) -> Result<()> {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if self.output_path.exists() {
            let _ = std::fs::remove_file(&self.output_path);
        }
        Ok(())
    }
}
