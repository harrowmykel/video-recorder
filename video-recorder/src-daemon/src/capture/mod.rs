pub mod screen;
pub mod camera;
pub mod camera_streamer;
pub mod audio;
pub mod telemetry;

pub use screen::{ScreenRecorder, ScreenCaptureConfig, DisplayInfo, WindowInfo, enumerate_displays, enumerate_windows, detect_screen_dimensions};
pub use camera::CameraRecorder;
pub use camera_streamer::{CameraStreamer, CameraStreamerConfig};
pub use audio::AudioRecorder;
pub use telemetry::TelemetryLogger;
