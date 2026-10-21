pub mod screen;
pub mod audio;
pub mod telemetry;

pub use screen::{ScreenRecorder, ScreenCaptureConfig, DisplayInfo, WindowInfo, enumerate_displays, enumerate_windows, detect_screen_dimensions};
pub use audio::AudioRecorder;
pub use telemetry::TelemetryLogger;

