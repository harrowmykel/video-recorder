pub mod manager;
pub mod manifest;

pub use manager::{
    SessionManager, SessionMetadata, StartRecordingRequest, UpdateAudioRequest,
    UpdateCaptureSourceRequest, default_recordings_base_dir, default_studio_base_dir,
    default_exports_base_dir, default_bg_remover_dir, list_recorded_sessions,
};
pub use manifest::*;

