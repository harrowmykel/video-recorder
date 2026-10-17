use std::path::{Path, PathBuf};
use std::process::Command;
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OutputFormat {
    ProRes4444,
    WebmAlpha,
    LumaMatte,
}

pub fn process_video_background(
    input_path: &Path,
    output_format: OutputFormat,
) -> Result<PathBuf> {
    let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    let (output_path, args): (PathBuf, Vec<&str>) = match output_format {
        OutputFormat::ProRes4444 => {
            let out = parent.join(format!("{}_alpha.mov", stem));
            (
                out,
                vec![
                    "-c:v", "prores_ks",
                    "-profile:v", "4444",
                    "-pix_fmt", "yuva444p10le",
                ],
            )
        }
        OutputFormat::WebmAlpha => {
            let out = parent.join(format!("{}_alpha.webm", stem));
            (
                out,
                vec![
                    "-c:v", "libvpx-vp9",
                    "-pix_fmt", "yuva420p",
                    "-auto-alt-ref", "0",
                ],
            )
        }
        OutputFormat::LumaMatte => {
            let out = parent.join(format!("{}_matte.mp4", stem));
            (
                out,
                vec![
                    "-vf", "format=gray",
                    "-c:v", "libx264",
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                ],
            )
        }
    };

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
        .arg("-i")
        .arg(input_path);
    cmd.args(&args);
    cmd.arg(&output_path);

    let status = cmd.status().context("Failed to run background extraction ffmpeg command")?;
    if status.success() {
        Ok(output_path)
    } else {
        anyhow::bail!("FFmpeg background extraction failed with exit status: {}", status);
    }
}
