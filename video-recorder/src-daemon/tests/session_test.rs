#[cfg(test)]
mod tests {
    #[test]
    fn test_session_folder_naming() {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let session_id = format!("session_{}", timestamp);
        assert!(session_id.starts_with("session_"));
        assert_eq!(session_id.len(), 23);
    }

    #[test]
    fn test_transparent_format_extensions() {
        let stem = "test_video";
        let prores_out = format!("{}_alpha.mov", stem);
        let webm_out = format!("{}_alpha.webm", stem);
        let matte_out = format!("{}_matte.mp4", stem);

        assert_eq!(prores_out, "test_video_alpha.mov");
        assert_eq!(webm_out, "test_video_alpha.webm");
        assert_eq!(matte_out, "test_video_matte.mp4");
    }

    #[test]
    fn test_no_camera_request_flag() {
        let json_payload = r#"{"camera_device":"none","fps":60,"mic_muted":false}"#;
        let parsed: serde_json::Value = serde_json::from_str(json_payload).unwrap();
        let cam_device = parsed.get("camera_device").and_then(|v| v.as_str());
        assert_eq!(cam_device, Some("none"));

        let is_camera_disabled = match cam_device {
            Some("none") | Some("") => true,
            _ => false,
        };
        assert!(is_camera_disabled);
    }

    #[test]
    fn test_uuid_session_naming() {
        let u = uuid::Uuid::new_v4();
        let session_id = format!("session_{}", u);
        assert!(session_id.starts_with("session_"));
        assert_eq!(session_id.len(), 8 + 36);
    }

    #[test]
    fn test_manifest_ndjson_serialization() {
        let screen_entry = serde_json::json!({
            "chunk_id": "screen_chunk_0001",
            "start_ms": 0,
            "end_ms": 15000,
            "duration_ms": 15000,
            "type": "screen",
            "file": "chunks/screen_chunk_0001.mp4",
            "source_mode": "display",
            "source_id": "primary",
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 60,
            "byte_size": 1024000
        });

        let line = serde_json::to_string(&screen_entry).unwrap();
        assert!(line.contains("\"chunk_id\":\"screen_chunk_0001\""));
        assert!(line.contains("\"start_ms\":0"));
        assert!(line.contains("\"end_ms\":15000"));

        let camera_entry = serde_json::json!({
            "chunk_id": "camera_chunk_0001",
            "start_ms": 0,
            "end_ms": 15000,
            "duration_ms": 15000,
            "type": "camera",
            "file": "chunks/camera_chunk_0001.webm",
            "is_hidden": false,
            "is_mirrored": false,
            "position": { "x": 1520, "y": 780, "norm_x": 0.7917, "norm_y": 0.7222 },
            "bubble": { "shape": "circle", "size_preset": "M", "width": 240, "height": 240, "custom_diameter": null },
            "segmentation": { "bg_mode": "blur", "model": "mediapipe_fast", "custom_image": null },
            "telemetry_keyframes": [],
            "byte_size": 512000
        });

        let cam_line = serde_json::to_string(&camera_entry).unwrap();
        assert!(cam_line.contains("\"bubble\":{\"custom_diameter\":null"));
        assert!(cam_line.contains("\"shape\":\"circle\""));
    }

    #[test]
    fn test_update_audio_request_deserialization() {
        let json_payload = r#"{"mic_device":"usb_mic_card","mic_muted":true,"sys_audio_muted":false}"#;
        let parsed: serde_json::Value = serde_json::from_str(json_payload).unwrap();
        assert_eq!(parsed.get("mic_device").and_then(|v| v.as_str()), Some("usb_mic_card"));
        assert_eq!(parsed.get("mic_muted").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(parsed.get("sys_audio_muted").and_then(|v| v.as_bool()), Some(false));
    }
}

