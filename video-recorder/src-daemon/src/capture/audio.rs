use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::io::Write;
use anyhow::Result;

pub struct AudioRecorder {
    mic_process: Option<Child>,
    sys_process: Option<Child>,
    mic_path: PathBuf,
    sys_path: PathBuf,
    chunks_dir: Option<PathBuf>,
    mic_manifest_path: Option<PathBuf>,
    sys_manifest_path: Option<PathBuf>,
}

impl AudioRecorder {
    pub fn new(mic_path: PathBuf, sys_path: PathBuf) -> Self {
        Self {
            mic_process: None,
            sys_process: None,
            mic_path,
            sys_path,
            chunks_dir: None,
            mic_manifest_path: None,
            sys_manifest_path: None,
        }
    }

    pub fn new_chunked(
        mic_path: PathBuf,
        sys_path: PathBuf,
        chunks_dir: PathBuf,
        mic_manifest_path: PathBuf,
        sys_manifest_path: PathBuf,
    ) -> Self {
        Self {
            mic_process: None,
            sys_process: None,
            mic_path,
            sys_path,
            chunks_dir: Some(chunks_dir),
            mic_manifest_path: Some(mic_manifest_path),
            sys_manifest_path: Some(sys_manifest_path),
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
        if let Some(chunks_dir) = &self.chunks_dir {
            let _ = std::fs::create_dir_all(chunks_dir);
        }

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

            if let Some(chunks_dir) = &self.chunks_dir {
                mic_cmd.args(["-f", "segment", "-segment_time", "15", "-segment_format", "wav"]);
                let pattern = chunks_dir.join("mic_chunk_%04d.wav");
                mic_cmd.arg(&pattern);
            } else {
                mic_cmd.arg(&self.mic_path);
            }

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

            if let Some(chunks_dir) = &self.chunks_dir {
                sys_cmd.args(["-f", "segment", "-segment_time", "15", "-segment_format", "wav"]);
                let pattern = chunks_dir.join("sys_chunk_%04d.wav");
                sys_cmd.arg(&pattern);
            } else {
                sys_cmd.arg(&self.sys_path);
            }

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

        if let Some(chunks_dir) = &self.chunks_dir {
            // 1. Process mic chunks
            let mut mic_files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(chunks_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("mic_chunk_") && name.ends_with(".wav") {
                            mic_files.push(path);
                        }
                    }
                }
            }
            mic_files.sort();

            if let Some(manifest_path) = &self.mic_manifest_path {
                for (idx, file) in mic_files.iter().enumerate() {
                    let file_size = std::fs::metadata(file).map(|m| m.len()).unwrap_or(0);
                    let start_ms = (idx as u64) * 15000;
                    let duration_ms = 15000;
                    let entry = crate::session::AudioChunkEntry {
                        chunk_id: format!("mic_chunk_{:04}", idx + 1),
                        start_ms,
                        end_ms: start_ms + duration_ms,
                        duration_ms,
                        chunk_type: "audio_mic".to_string(),
                        file: format!("chunks/{}", file.file_name().unwrap().to_string_lossy()),
                        device: "default".to_string(),
                        sample_rate: 48000,
                        channels: 1,
                        peak_level: 0.70,
                        rms_level: 0.35,
                        byte_size: file_size,
                    };
                    let _ = crate::session::NdjsonWriter::append_record(manifest_path, &entry);
                }
            }

            if !mic_files.is_empty() {
                let concat_list_path = chunks_dir.join("mic_concat.txt");
                let mut content = String::new();
                for f in &mic_files {
                    content.push_str(&format!("file '{}'\n", f.to_string_lossy()));
                }
                let _ = std::fs::write(&concat_list_path, content);
                let _ = Command::new("ffmpeg")
                    .arg("-y")
                    .arg("-f").arg("concat")
                    .arg("-safe").arg("0")
                    .arg("-i").arg(&concat_list_path)
                    .args(["-c", "copy"])
                    .arg(&self.mic_path)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                let _ = std::fs::remove_file(&concat_list_path);
            }

            // 2. Process system audio chunks
            let mut sys_files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(chunks_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("sys_chunk_") && name.ends_with(".wav") {
                            sys_files.push(path);
                        }
                    }
                }
            }
            sys_files.sort();

            if let Some(manifest_path) = &self.sys_manifest_path {
                for (idx, file) in sys_files.iter().enumerate() {
                    let file_size = std::fs::metadata(file).map(|m| m.len()).unwrap_or(0);
                    let start_ms = (idx as u64) * 15000;
                    let duration_ms = 15000;
                    let entry = crate::session::AudioChunkEntry {
                        chunk_id: format!("sys_chunk_{:04}", idx + 1),
                        start_ms,
                        end_ms: start_ms + duration_ms,
                        duration_ms,
                        chunk_type: "audio_system".to_string(),
                        file: format!("chunks/{}", file.file_name().unwrap().to_string_lossy()),
                        device: "monitor".to_string(),
                        sample_rate: 48000,
                        channels: 2,
                        peak_level: 0.45,
                        rms_level: 0.18,
                        byte_size: file_size,
                    };
                    let _ = crate::session::NdjsonWriter::append_record(manifest_path, &entry);
                }
            }

            if !sys_files.is_empty() {
                let concat_list_path = chunks_dir.join("sys_concat.txt");
                let mut content = String::new();
                for f in &sys_files {
                    content.push_str(&format!("file '{}'\n", f.to_string_lossy()));
                }
                let _ = std::fs::write(&concat_list_path, content);
                let _ = Command::new("ffmpeg")
                    .arg("-y")
                    .arg("-f").arg("concat")
                    .arg("-safe").arg("0")
                    .arg("-i").arg(&concat_list_path)
                    .args(["-c", "copy"])
                    .arg(&self.sys_path)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                let _ = std::fs::remove_file(&concat_list_path);
            }
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
        if let Some(chunks_dir) = &self.chunks_dir {
            if chunks_dir.exists() {
                let _ = std::fs::remove_dir_all(chunks_dir);
            }
        }
        if let Some(manifest_path) = &self.mic_manifest_path {
            if manifest_path.exists() {
                let _ = std::fs::remove_file(manifest_path);
            }
        }
        if let Some(manifest_path) = &self.sys_manifest_path {
            if manifest_path.exists() {
                let _ = std::fs::remove_file(manifest_path);
            }
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

