use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::io::Write;
use anyhow::{Result, Context};

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
        // Record Microphone
        let mut mic_cmd = Command::new("ffmpeg");
        mic_cmd.arg("-y");

        #[cfg(target_os = "linux")]
        {
            mic_cmd.args(["-f", "pulse", "-i", "default"]);
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
        mic_cmd.stderr(Stdio::piped());

        if let Ok(child) = mic_cmd.spawn() {
            self.mic_process = Some(child);
        }

        // Record Desktop Loopback Audio
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
        sys_cmd.stderr(Stdio::piped());

        if let Ok(child) = sys_cmd.spawn() {
            self.sys_process = Some(child);
        }

        Ok(())
    }

    pub fn stop(&mut self) -> Result<(PathBuf, PathBuf)> {
        if let Some(mut child) = self.mic_process.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q\n");
            }
            let _ = child.wait();
        }
        if let Some(mut child) = self.sys_process.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"q\n");
            }
            let _ = child.wait();
        }
        Ok((self.mic_path.clone(), self.sys_path.clone()))
    }

    pub fn discard(&mut self) -> Result<()> {
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
