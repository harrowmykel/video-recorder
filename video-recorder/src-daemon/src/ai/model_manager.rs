use std::path::PathBuf;
use std::fs;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelType {
    SelfieSegmentationFast,
    RobustVideoMatting,
    BriaRmbg14,
    BiRefNet,
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
        let models_dir = crate::session::default_studio_base_dir()
            .join(".cache")
            .join("models");
        fs::create_dir_all(&models_dir)?;
        Ok(Self { models_dir })
    }

    pub fn list_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                name: "MediaPipe Selfie (Ultra-Fast)".to_string(),
                model_type: ModelType::SelfieSegmentationFast,
                file_name: "selfie_segmentation.onnx".to_string(),
                size_mb: 0.45,
                download_url: "https://huggingface.co/onnx-community/mediapipe_selfie_segmentation/resolve/main/onnx/model.onnx".to_string(),
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
                size_mb: 176.0,
                download_url: "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx".to_string(),
                is_downloaded: self.models_dir.join("rmbg_1_4.onnx").exists(),
            },
            ModelInfo {
                name: "BiRefNet Ultra (Cinema Quality)".to_string(),
                model_type: ModelType::BiRefNet,
                file_name: "birefnet_general.onnx".to_string(),
                size_mb: 224.0,
                download_url: "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx".to_string(),
                is_downloaded: self.models_dir.join("birefnet_general.onnx").exists(),
            },
        ]
    }

    pub fn get_model_path(&self, file_name: &str) -> PathBuf {
        self.models_dir.join(file_name)
    }

    pub fn is_model_ready(&self, file_name: &str) -> bool {
        self.models_dir.join(file_name).exists()
    }

    /// Ensures that the specified model is present locally; downloads if missing.
    pub fn ensure_model_downloaded(&self, file_name: &str) -> Result<PathBuf> {
        let dest = self.get_model_path(file_name);
        if dest.exists() {
            return Ok(dest);
        }

        let models = self.list_models();
        let info = models
            .into_iter()
            .find(|m| m.file_name == file_name)
            .context(format!("Model '{}' not found in catalog", file_name))?;

        println!("[ModelManager] Downloading {} from {}...", info.name, info.download_url);
        
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .user_agent("VideoRecorderStudio/0.1.0 (Linux; x86_64)")
            .build()?;
            
        let mut response = client.get(&info.download_url).send()
            .context("Failed to send model download HTTP request")?;
            
        if !response.status().is_success() {
            anyhow::bail!("Failed to download model: HTTP {}", response.status());
        }

        let temp_file = dest.with_extension("download");
        let mut file = fs::File::create(&temp_file)?;
        response.copy_to(&mut file)?;
        fs::rename(temp_file, &dest)?;

        println!("[ModelManager] Model {} successfully downloaded to {:?}", info.name, dest);
        Ok(dest)
    }

    /// Ensures the default fast MediaPipe model is present.
    pub fn ensure_default_model(&self) -> Result<PathBuf> {
        self.ensure_model_downloaded("selfie_segmentation.onnx")
    }
}
