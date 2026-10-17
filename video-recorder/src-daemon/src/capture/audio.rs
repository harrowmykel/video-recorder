use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::io::Write;
use anyhow::Result;

pub struct AudioRecorder {
    mic_process: Option<Child>,
    sys_process: Option<Child>,
    mic_path: PathBuf,
    sys_path: PathBuf,
}

impl AudioRecorder {
    pub fn new(mic_path: PathBuf, sys_path: PathBuf) -> Self {
        Self {
            mic_process: None,
            sys_process: None,
            mic_path,
            sys_path,
        }
    }

    pub fn start(&mut self) -> Result<()> {
        self.start_with_options(false, false, None)
    }

    pub fn start_with_options(
        &mut self,
        mic_muted: bool,
        sys_audio_muted: bool,
        mic_device: Option<&str>,
    ) -> Result<()> {
        if !mic_muted {
            let mut mic_cmd = Command::new("ffmpeg");
            mic_cmd.arg("-y");

            #[cfg(target_os = "linux")]
            {
                let dev = mic_device.filter(|d| !d.is_empty()).unwrap_or("default");
                mic_cmd.args(["-f", "pulse", "-i", dev]);
            }

            #[cfg(target_os = "windows")]
            {
                mic_cmd.args(["-f", "dshow", "-i", "audio=Microphone"]);
            }

            #[cfg(target_os = "macos")]
            {
                mic_cmd.args(["-f", "avfoundation", "-i", ":0"]);
            }

            mic_cmd.args(["-c:a", "pcm_s16le", "-ar", "48000"]);
            mic_cmd.arg(&self.mic_path);
            mic_cmd.stdin(Stdio::piped());
            mic_cmd.stdout(Stdio::null());
            mic_cmd.stderr(Stdio::null());

            if let Ok(child) = mic_cmd.spawn() {
                self.mic_process = Some(child);
            }
        }

        if !sys_audio_muted {
            let mut sys_cmd = Command::new("ffmpeg");
            sys_cmd.arg("-y");

            #[cfg(target_os = "linux")]
            {
                sys_cmd.args(["-f", "pulse", "-i", "default.monitor"]);
            }

            #[cfg(target_os = "windows")]
            {
                sys_cmd.args(["-f", "dshow", "-i", "audio=Stereo Mix"]);
            }

            #[cfg(target_os = "macos")]
            {
                sys_cmd.args(["-f", "avfoundation", "-i", ":1"]);
            }

            sys_cmd.args(["-c:a", "pcm_s16le", "-ar", "48000"]);
            sys_cmd.arg(&self.sys_path);
            sys_cmd.stdin(Stdio::piped());
            sys_cmd.stdout(Stdio::null());
            sys_cmd.stderr(Stdio::null());

            if let Ok(child) = sys_cmd.spawn() {
                self.sys_process = Some(child);
            }
        }

        Ok(())
    }

    pub fn pause(&mut self) {
        #[cfg(unix)]
        {
            if let Some(child) = &self.mic_process {
                let _ = Command::new("kill").args(["-STOP", &child.id().to_string()]).status();
            }
            if let Some(child) = &self.sys_process {
                let _ = Command::new("kill").args(["-STOP", &child.id().to_string()]).status();
            }
        }
    }

    pub fn resume(&mut self) {
        #[cfg(unix)]
        {
            if let Some(child) = &self.mic_process {
                let _ = Command::new("kill").args(["-CONT", &child.id().to_string()]).status();
            }
            if let Some(child) = &self.sys_process {
                let _ = Command::new("kill").args(["-CONT", &child.id().to_string()]).status();
            }
        }
    }

    fn stop_child_gracefully(mut child: Child) {
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

    pub fn stop(&mut self) -> Result<(PathBuf, PathBuf)> {
        self.resume();
        if let Some(child) = self.mic_process.take() {
            Self::stop_child_gracefully(child);
        }
        if let Some(child) = self.sys_process.take() {
            Self::stop_child_gracefully(child);
        }
        Ok((self.mic_path.clone(), self.sys_path.clone()))
    }

    pub fn discard(&mut self) -> Result<()> {
        self.resume();
        if let Some(mut child) = self.mic_process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(mut child) = self.sys_process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if self.mic_path.exists() {
            let _ = std::fs::remove_file(&self.mic_path);
        }
        if self.sys_path.exists() {
            let _ = std::fs::remove_file(&self.sys_path);
        }
        Ok(())
    }
}

impl Drop for AudioRecorder {
    fn drop(&mut self) {
        self.resume();
        if let Some(mut child) = self.mic_process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(mut child) = self.sys_process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
