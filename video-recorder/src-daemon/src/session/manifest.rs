use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenResolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenChunkEntry {
    pub chunk_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub duration_ms: u64,
    #[serde(rename = "type")]
    pub chunk_type: String,
    pub file: String,
    pub source_mode: String,
    pub source_id: String,
    pub resolution: ScreenResolution,
    pub fps: u32,
    pub byte_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraPosition {
    pub x: i32,
    pub y: i32,
    pub norm_x: f32,
    pub norm_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraBubbleShape {
    pub shape: String,
    pub size_preset: String,
    pub width: u32,
    pub height: u32,
    pub custom_diameter: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraSegmentation {
    pub bg_mode: String,
    pub model: String,
    pub custom_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraTelemetryKeyframe {
    pub offset_ms: u64,
    pub x: i32,
    pub y: i32,
    pub norm_x: Option<f32>,
    pub norm_y: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraChunkEntry {
    pub chunk_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub duration_ms: u64,
    #[serde(rename = "type")]
    pub chunk_type: String,
    pub file: String,
    pub is_hidden: bool,
    pub is_mirrored: bool,
    pub position: CameraPosition,
    pub bubble: CameraBubbleShape,
    pub segmentation: CameraSegmentation,
    pub telemetry_keyframes: Vec<CameraTelemetryKeyframe>,
    pub byte_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioChunkEntry {
    pub chunk_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub duration_ms: u64,
    #[serde(rename = "type")]
    pub chunk_type: String,
    pub file: String,
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub peak_level: f32,
    pub rms_level: f32,
    pub byte_size: u64,
}

pub struct NdjsonWriter;

impl NdjsonWriter {
    pub fn append_record<T: Serialize>(file_path: &Path, record: &T) -> Result<()> {
        let mut line = serde_json::to_string(record)?;
        line.push('\n');
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)?;
        file.write_all(line.as_bytes())?;
        file.flush()?;
        Ok(())
    }

    pub fn read_records<T: for<'de> Deserialize<'de>>(file_path: &Path) -> Result<Vec<T>> {
        if !file_path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(file_path)?;
        let mut records = Vec::new();
        for line in content.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                if let Ok(item) = serde_json::from_str::<T>(trimmed) {
                    records.push(item);
                }
            }
        }
        Ok(records)
    }
}
