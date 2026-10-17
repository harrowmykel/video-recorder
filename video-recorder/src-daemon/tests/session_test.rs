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
}
