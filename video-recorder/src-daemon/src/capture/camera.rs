use std::path::PathBuf;
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
        let mut cmd = crate::ffmpeg::ffmpeg_cmd();
        cmd.arg("-y");

        #[cfg(target_os = "linux")]
        {
            let dev = device_name
                .filter(|d| d.starts_with("/dev/video"))
                .unwrap_or("/dev/video0");
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
        cmd.stderr(Stdio::null());

        let child = cmd.spawn().context("Failed to spawn camera recorder process")?;
        self.process = Some(child);
        Ok(())
    }

    pub fn pause(&mut self) {
        #[cfg(unix)]
        if let Some(child) = &self.process {
            let _ = Command::new("kill").args(["-STOP", &child.id().to_string()]).status();
        }
    }

    pub fn resume(&mut self) {
        #[cfg(unix)]
        if let Some(child) = &self.process {
            let _ = Command::new("kill").args(["-CONT", &child.id().to_string()]).status();
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
            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1200);
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
        }
        Ok(self.output_path.clone())
    }

    pub fn discard(&mut self) -> Result<()> {
        self.resume();
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

impl Drop for CameraRecorder {
    fn drop(&mut self) {
        self.resume();
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
