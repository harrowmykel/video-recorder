use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelType {
    SelfieSegmentationFast,
    RobustVideoMatting,
    BriaRmbg14,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub model_type: ModelType,
    pub file_name: String,
    pub size_mb: f32,
    pub download_url: String,
    pub is_downloaded: bool,
}

pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new() -> Result<Self> {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let models_dir = PathBuf::from(home).join(".cache").join("studio_recorder").join("models");
        fs::create_dir_all(&models_dir)?;
        Ok(Self { models_dir })
    }

    pub fn list_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                name: "MediaPipe Selfie (Ultra-Fast)".to_string(),
                model_type: ModelType::SelfieSegmentationFast,
                file_name: "selfie_segmentation.onnx".to_string(),
                size_mb: 1.5,
                download_url: "https://huggingface.co/onnx-community/selfie-segmentation/resolve/main/selfie_segmentation.onnx".to_string(),
                is_downloaded: self.models_dir.join("selfie_segmentation.onnx").exists(),
            },
            ModelInfo {
                name: "Robust Video Matting (Temporal Sync)".to_string(),
                model_type: ModelType::RobustVideoMatting,
                file_name: "rvm_mobilenetv3.onnx".to_string(),
                size_mb: 15.2,
                download_url: "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx".to_string(),
                is_downloaded: self.models_dir.join("rvm_mobilenetv3.onnx").exists(),
            },
            ModelInfo {
                name: "RMBG-1.4 Studio HQ (Hair-level)".to_string(),
                model_type: ModelType::BriaRmbg14,
                file_name: "rmbg_1_4.onnx".to_string(),
                size_mb: 172.0,
                download_url: "https://huggingface.co/briaai/RMBG-1.4/resolve/main/model.onnx".to_string(),
                is_downloaded: self.models_dir.join("rmbg_1_4.onnx").exists(),
            },
        ]
    }

    #[allow(dead_code)]
    pub fn get_model_path(&self, file_name: &str) -> PathBuf {
        self.models_dir.join(file_name)
    }

    #[allow(dead_code)]
    pub fn is_model_ready(&self, file_name: &str) -> bool {
        self.models_dir.join(file_name).exists()
    }
}
