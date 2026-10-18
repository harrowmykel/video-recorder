pub mod manager;
pub mod manifest;

pub use manager::{
    SessionManager, SessionMetadata, StartRecordingRequest,
    default_recordings_base_dir, list_recorded_sessions,
};
pub use manifest::*;

