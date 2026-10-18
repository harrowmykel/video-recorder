use std::path::Path;
use anyhow::{Context, Result};
use image::{imageops::FilterType, DynamicImage, ImageBuffer, RgbImage};
use tract_onnx::prelude::*;

type RunnableModel = std::sync::Arc<TypedRunnableModel>;

pub struct SegmentationEngine {
    model: RunnableModel,
    input_shape: (usize, usize), // (width, height)
    is_nchw: bool,
}

impl SegmentationEngine {
    pub fn new(model_path: &Path) -> Result<Self> {
        let mut raw_model = tract_onnx::onnx()
            .model_for_path(model_path)
            .context("Failed to load ONNX model from disk")?;

        let batch = raw_model.sym("batch_size");
        let mut subs = std::collections::HashMap::new();
        subs.insert(batch, 1.to_dim());
        raw_model.set_symbols(&subs).context("Failed to substitute symbols")?;

        let optimized = raw_model
            .with_input_fact(0, f32::fact([1, 3, 256, 256]).into())
            .context("Failed to set input fact")?
            .into_optimized()
            .context("Failed to optimize ONNX model")?;

        let in_w = 256;
        let in_h = 256;
        let is_nchw = true;

        let runnable = optimized
            .into_runnable()
            .context("Failed to make ONNX model runnable")?;

        Ok(Self {
            model: runnable,
            input_shape: (in_w, in_h),
            is_nchw,
        })
    }

    /// Takes an RGB8 raw frame buffer of size width x height,
    /// returns an 8-bit alpha mask of size width x height (0 = background, 255 = foreground).
    pub fn process_frame_alpha(
        &self,
        rgb_raw: &[u8],
        src_w: u32,
        src_h: u32,
    ) -> Result<Vec<u8>> {
        let (model_w, model_h) = self.input_shape;

        // 1. Wrap raw buffer in DynamicImage
        let rgb_img = RgbImage::from_raw(src_w, src_h, rgb_raw.to_vec())
            .context("Invalid raw RGB frame buffer")?;
        let dyn_img = DynamicImage::ImageRgb8(rgb_img);

        // 2. Resize to model input shape
        let resized = dyn_img.resize_exact(model_w as u32, model_h as u32, FilterType::Triangle);
        let rgb_resized = resized.to_rgb8();

        // 3. Build Tract Tensor
        let tensor: Tensor = if self.is_nchw {
            let mut data = vec![0.0f32; 1 * 3 * model_h * model_w];
            for y in 0..model_h {
                for x in 0..model_w {
                    let p = rgb_resized.get_pixel(x as u32, y as u32);
                    let offset = y * model_w + x;
                    data[0 * (model_h * model_w) + offset] = p[0] as f32 / 255.0;
                    data[1 * (model_h * model_w) + offset] = p[1] as f32 / 255.0;
                    data[2 * (model_h * model_w) + offset] = p[2] as f32 / 255.0;
                }
            }
            tract_ndarray::Array4::from_shape_vec((1, 3, model_h, model_w), data)?.into()
        } else {
            let mut data = vec![0.0f32; 1 * model_h * model_w * 3];
            for y in 0..model_h {
                for x in 0..model_w {
                    let p = rgb_resized.get_pixel(x as u32, y as u32);
                    let idx = (y * model_w + x) * 3;
                    data[idx] = p[0] as f32 / 255.0;
                    data[idx + 1] = p[1] as f32 / 255.0;
                    data[idx + 2] = p[2] as f32 / 255.0;
                }
            }
            tract_ndarray::Array4::from_shape_vec((1, model_h, model_w, 3), data)?.into()
        };

        // 4. Run Inference
        let result = self.model.run(tvec!(tensor.into()))?;
        let out_tensor = &result[0];
        let out_view = out_tensor.to_plain_array_view::<f32>()?;

        // 5. Extract 2D probability mask
        let mut mask_256 = vec![0u8; model_w * model_h];
        let slice = out_view.as_slice().unwrap_or(&[]);
        for i in 0..(model_w * model_h) {
            let prob = if i < slice.len() { slice[i] } else { 0.0 };
            // Clamp and convert probability to 0..255
            mask_256[i] = (prob.clamp(0.0, 1.0) * 255.0) as u8;
        }

        // 6. Upscale mask to original frame resolution (src_w x src_h)
        let mask_img = ImageBuffer::<image::Luma<u8>, Vec<u8>>::from_raw(
            model_w as u32,
            model_h as u32,
            mask_256,
        ).context("Failed to build mask buffer")?;
        
        let dyn_mask = DynamicImage::ImageLuma8(mask_img);
        let upscaled = dyn_mask.resize_exact(src_w, src_h, FilterType::Triangle);
        
        Ok(upscaled.into_luma8().into_raw())
    }

    /// Produces a composited RGBA frame based on the alpha mask and requested background mode:
    /// - "blur": Background is blurred, subject remains sharp
    /// - "transparent": Background has alpha = 0
    /// - "gradient": Insets a dark studio gradient behind subject
    /// - "off": Returns original RGB as RGBA (alpha = 255)
    pub fn composite_frame(
        &self,
        rgb_raw: &[u8],
        src_w: u32,
        src_h: u32,
        bg_mode: &str,
    ) -> Result<Vec<u8>> {
        let total_pixels = (src_w * src_h) as usize;
        let mut rgba = vec![255u8; total_pixels * 4];

        if bg_mode == "off" {
            for i in 0..total_pixels {
                let s = i * 3;
                let d = i * 4;
                rgba[d] = rgb_raw[s];
                rgba[d + 1] = rgb_raw[s + 1];
                rgba[d + 2] = rgb_raw[s + 2];
                rgba[d + 3] = 255;
            }
            return Ok(rgba);
        }

        let alpha_mask = self.process_frame_alpha(rgb_raw, src_w, src_h)?;

        match bg_mode {
            "blur" => {
                // Build a fast downscale-upscale box blur for the background
                let rgb_img = RgbImage::from_raw(src_w, src_h, rgb_raw.to_vec())
                    .context("Invalid rgb frame")?;
                let dyn_img = DynamicImage::ImageRgb8(rgb_img);
                let small = dyn_img.resize_exact(src_w / 8, src_h / 8, FilterType::Nearest);
                let blurred = small.resize_exact(src_w, src_h, FilterType::Triangle).to_rgb8();
                let blur_raw = blurred.as_raw();

                for i in 0..total_pixels {
                    let s = i * 3;
                    let d = i * 4;
                    let a = alpha_mask[i] as f32 / 255.0;
                    let inv_a = 1.0 - a;

                    let fg_r = rgb_raw[s] as f32;
                    let fg_g = rgb_raw[s + 1] as f32;
                    let fg_b = rgb_raw[s + 2] as f32;

                    let bg_r = blur_raw[s] as f32 * 0.9;
                    let bg_g = blur_raw[s + 1] as f32 * 0.9;
                    let bg_b = blur_raw[s + 2] as f32 * 0.9;

                    rgba[d] = (fg_r * a + bg_r * inv_a).clamp(0.0, 255.0) as u8;
                    rgba[d + 1] = (fg_g * a + bg_g * inv_a).clamp(0.0, 255.0) as u8;
                    rgba[d + 2] = (fg_b * a + bg_b * inv_a).clamp(0.0, 255.0) as u8;
                    rgba[d + 3] = 255;
                }
            }
            "gradient" => {
                // Dark obsidian studio gradient background
                for y in 0..src_h {
                    let ny = y as f32 / src_h as f32;
                    let bg_r = 15.0 + ny * 25.0;
                    let bg_g = 18.0 + ny * 20.0;
                    let bg_b = 32.0 + ny * 45.0;

                    for x in 0..src_w {
                        let i = (y * src_w + x) as usize;
                        let s = i * 3;
                        let d = i * 4;
                        let a = alpha_mask[i] as f32 / 255.0;
                        let inv_a = 1.0 - a;

                        let fg_r = rgb_raw[s] as f32;
                        let fg_g = rgb_raw[s + 1] as f32;
                        let fg_b = rgb_raw[s + 2] as f32;

                        rgba[d] = (fg_r * a + bg_r * inv_a).clamp(0.0, 255.0) as u8;
                        rgba[d + 1] = (fg_g * a + bg_g * inv_a).clamp(0.0, 255.0) as u8;
                        rgba[d + 2] = (fg_b * a + bg_b * inv_a).clamp(0.0, 255.0) as u8;
                        rgba[d + 3] = 255;
                    }
                }
            }
            _ => {
                // "transparent" or fallback: Subject with clean alpha
                for i in 0..total_pixels {
                    let s = i * 3;
                    let d = i * 4;
                    let a = alpha_mask[i];
                    rgba[d] = rgb_raw[s];
                    rgba[d + 1] = rgb_raw[s + 1];
                    rgba[d + 2] = rgb_raw[s + 2];
                    rgba[d + 3] = a;
                }
            }
        }

        Ok(rgba)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segmentation_engine_inference() {
        let home = std::env::var("HOME").unwrap();
        let model_path = std::path::PathBuf::from(home)
            .join("Videos")
            .join("studio")
            .join(".cache")
            .join("models")
            .join("selfie_segmentation.onnx");

        if !model_path.exists() {
            println!("Model file not downloaded, skipping test");
            return;
        }

        let engine = SegmentationEngine::new(&model_path).expect("Failed to init SegmentationEngine");
        
        // 640x480 test image (red/green test pattern)
        let w = 640;
        let h = 480;
        let mut test_frame = vec![0u8; (w * h * 3) as usize];
        for i in 0..(w * h) as usize {
            test_frame[i * 3] = (i % 255) as u8;
            test_frame[i * 3 + 1] = ((i / 2) % 255) as u8;
            test_frame[i * 3 + 2] = 200;
        }

        let alpha = engine.process_frame_alpha(&test_frame, w, h).expect("Inference failed");
        assert_eq!(alpha.len(), (w * h) as usize);

        let composite = engine.composite_frame(&test_frame, w, h, "blur").expect("Compositing failed");
        assert_eq!(composite.len(), (w * h * 4) as usize);
    }
}
