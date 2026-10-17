# Project Roadmap: Multi-Platform Screen & Camera Studio Recorder

A modern, high-performance, 100% offline screen and camera recording studio built with **Tauri v2 (Rust + Vue 3 / TypeScript)**. Features isolated multi-track recording (clean screen + separate raw/transparent camera), real-time & post-recording AI background removal, mouse telemetry for Screen-Studio-style zoom, and floating overlays.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                       TAURI MULTI-WINDOW UI LAYER                       │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │ Floating Toolbar     │  │ Camera Bubble       │  │ Annotation    │  │
│  │ (Transparent Pill)   │  │ (Draggable/Shaped)  │  │ Screen Canvas │  │
│  └──────────────────────┘  └─────────────────────┘  └───────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Studio Review, Export & Drag-and-Drop AI Removal Window          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC Commands / Events
┌───────────────────────────────────▼────────────────────────────────────┐
│                         RUST CORE BACKEND                              │
│  ┌────────────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Multi-Platform Capture │  │ Video & Audio   │  │ AI Inference    │  │
│  │ Screen (PipeWire/DXGI) │  │ Encoding Engine │  │ Engine (ort)    │  │
│  │ Camera (V4L2/UVC)      │  │ (FFmpeg/H.264/  │  │ MediaPipe /     │  │
│  │ Mic + Sys Audio (CPAL) │  │  ProRes/WebM)   │  │ BiRefNet/RMBG   │  │
│  └────────────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌────────────────────────┐  ┌─────────────────┐                       │
│  │ Mouse Telemetry Engine │  │ Global Hotkeys  │                       │
│  │ (Position & Clicks)    │  │ & Window Excl.  │                       │
│  └────────────────────────┘  └─────────────────┘                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Project Setup & Tauri Multi-Window Foundation
- [x] **Task 1.1: Tauri v2 Workspace Setup**
  - Initialize Tauri v2 with Rust backend and Vue 3 / Vite / Tailwind frontend.
  - Configure multi-window capability in `tauri.conf.json`:
    - `main` / `studio`: Main dashboard & review window.
    - `toolbar`: Always-on-top, frameless, transparent floating pill window.
    - `camera_bubble`: Always-on-top, frameless, draggable camera preview window.
    - `annotations`: Click-through transparent canvas window across active monitors.
  - Verify window exclusion properties (ensure toolbar and camera bubble windows have the OS flag `WDA_EXCLUDEFROMCAPTURE` on Windows, native exclusion on macOS, and coordinate region clipping or clean desktop capture on Linux/X11/Wayland).
- [x] **Task 1.2: Global Shortcuts & State Management**
  - Implement universal global hotkeys:
    - `Super/Ctrl + Shift + R`: Start / Stop Recording.
    - `Super/Ctrl + Shift + Space`: Pause / Resume.
    - `Super/Ctrl + Shift + H`: Toggle Camera Bubble Visibility (without stopping camera recording).
    - `Super/Ctrl + Shift + Z`: Trigger Live Zoom onto cursor.
    - `Super/Ctrl + Shift + A`: Toggle Annotation Pen.

---

## Phase 2: Multi-Platform Audio & Screen Capture Engine
- [x] **Task 2.1: Native Screen Capture Subsystem**
  - Linux: Implement PipeWire / XDG Desktop Portal screencast stream + fallback X11 XSHM.
  - Windows: Implement Desktop Duplication API (DXGI) / Windows.Graphics.Capture.
  - macOS: Implement ScreenCaptureKit (SCK) for 60 FPS zero-copy desktop capture.
  - Ensure capture isolates desktop content cleanly without capturing app overlays.
- [x] **Task 2.2: Dual-Track Audio Capture (Mic & System Audio)**
  - Integrate low-latency microphone audio input.
  - Implement system audio loopback capture (WASAPI loopback on Windows, PipeWire monitor on Linux, CoreAudio aggregate on macOS).
  - Implement real-time audio peak calculation for the UI VU-meter.
  - Add optional RNNoise DSP filter in Rust for mic background noise suppression.
- [x] **Task 2.3: Mouse Telemetry & Click Tracker**
  - Capture cursor coordinates (X, Y), active display scale factor, and click events at 60 Hz.
  - Stream events to sidecar `recording_telemetry.json` with microsecond timestamps synchronized with video start.

---

## Phase 3: Camera Capture & Live Overlay Pipeline
- [x] **Task 3.1: Hardware Camera Capture**
  - Native webcam access via UVC/V4L2/DirectShow/AVFoundation.
  - Resolution & FPS negotiation (1080p @ 30/60 FPS, 720p fallback).
  - Mirror/Flip toggle support.
- [x] **Task 3.2: Decoupled Preview & Background Recording**
  - Split camera frames into two queues:
    - Queue A: Uninterrupted raw camera video encoder (writes to `camera_raw.mp4`).
    - Queue B: IPC / Shared memory texture to the floating camera bubble window for user preview.
  - Ensure hiding the preview window has zero impact on Queue A.
- [x] **Task 3.3: Live Dynamic Screen Zoom Engine**
  - Implement smooth digital zoom interpolation towards current cursor position when live zoom hotkey is held or toggled.

---

## Phase 4: Real-time & Post-Recording AI Background Removal
- [x] **Task 4.1: ONNX Runtime (`ort`) Integration in Rust**
  - Configure `ort` with execution providers (CPU AVX2/AVX-512, CUDA, DirectML, CoreML).
  - Build model manager to handle downloading and caching `.onnx` models:
    - Lightweight: `selfie_segmentation.onnx` (~1.5 MB, bundled).
    - Video Matting: `rvm_mobilenetv3.onnx` (~15 MB).
    - Studio HQ: `birefnet_general.onnx` or `rmbg-1.4.onnx` (~160 MB).
- [x] **Task 4.2: Real-time Matting Worker**
  - Preprocessing pipeline: resize frame, normalize tensor, run inference, generate alpha mask.
  - Postprocessing: soft alpha edge blending / bilateral filter, replace background with transparency or custom virtual blur.
  - Stream keyed frames to preview bubble and transparent video recorder.
- [x] **Task 4.3: Studio HQ Batch Drag-and-Drop Background Removal**
  - Build headless batch processing command:
    - Reads any video file (`.mp4`, `.mov`, `.mkv`).
    - Extracts frames sequentially, runs BiRefNet / RMBG-1.4.
    - Encodes transparent output video with alpha channel (`ProRes 4444` or `WebM VP9 Alpha`).
    - Emits progress events (`progress_pct`, `fps`, `eta_seconds`) to the UI.

---

## Phase 5: Video Encoding, Containers & Multi-Track Assembly
- [x] **Task 5.1: Crash-Resilient Recording Pipeline**
  - Write ongoing streams into Fragmented MP4 (`fMP4`) or Matroska (`.mkv`) chunks to prevent file corruption in case of unexpected power cut or app exit.
  - Automatically remux to standard `.mp4` on clean recording stop.
- [x] **Task 5.2: Synchronized Multi-File Session Output**
  - On stop, package session into dedicated folder:
    - `session_YYYYMMDD_HHMMSS/`
      - `screen_clean.mp4` (Isolated screen recording)
      - `camera_raw.mp4` (Raw camera stream)
      - `camera_transparent.mov` / `.webm` (If live AI removal was active)
      - `audio_mic.wav` (Isolated microphone track)
      - `audio_system.wav` (Isolated desktop audio track)
      - `telemetry.json` (Cursor & zoom metadata)
      - `session_metadata.json` (Timestamps, duration, resolution, tracks)

---

## Phase 6: UI Implementation & Micro-Interactions (from UI Design Prompt)
- [x] **Task 6.1: Floating Toolbar Pill & Satellite Bar (`toolbar`)**
  - Implement draggable, glassmorphism floating pill with dual modes:
    - Mode A: Independent floating pill anywhere on screen.
    - Mode B: Satellite docking (magnetically docked adjacent to the Camera Bubble).
  - Record / Pause / Stop states, animated timer, audio VU-meter bar.
  - **Loom-style Instant Actions:**
    - Instant Discard / Trash button (`🗑`): Scraps the current buffer in 1 click and resets to ready state.
    - Quick Restart button (`↺`): Discards current take and triggers fresh 3-2-1 countdown immediately.
  - Popovers for audio/cam device selection and screen region picker.
  - **Idle Opacity Fading:** Auto-dims to 20% opacity during active recording when cursor is idle, restoring on mouse hover.
  - Auto-collapse to mini status dot when idle or recording.
- [x] **Task 6.2: Floating Camera Bubble (`camera_bubble`)**
  - Shape morphing: Circle (Loom-style), Squircle, and 16:9 widescreen.
  - Preset size toggles (S, M, L, and Fullscreen Cam toggle) + free edge resizing.
  - **Speaking Pulse Ring:** Audio-reactive glowing border ring that pulses dynamically with microphone input volume.
  - **Avatar Fallback:** Seamlessly displays user profile photo / initials with active speaking wave if camera is turned off or occluded.
  - Hover action menu: Hide preview, flip camera, toggle background cutout.
- [x] **Task 6.3: Annotation Screen Canvas (`annotations`)**
  - Interactive overlay for drawing arrows, freehand pen, rounded boxes, step numbers (1, 2, 3), and spotlight highlighter.
  - Auto-fade mode (drawings fade away after 3 seconds) vs persistent mode.
- [x] **Task 6.4: 3-2-1 Countdown Overlay with Audio Metronome**
  - Sleek large typographic counter: 3 -> 2 -> 1 -> ACTION with smooth scale-down and blur-out animation.
  - Audio metronome sync: Crisp audio beeps (`beep... beep... BOOP!`) so users can look away from the screen and know the exact second recording goes live.
  - Full-screen or localized transparent countdown with click-to-cancel.

---

## Phase 7: Studio Review & Export Window
- [x] **Task 7.1: Synchronized Dual-Track Video Player**
  - Side-by-side or picture-in-picture preview of `screen_clean.mp4` and `camera_raw.mp4`.
  - Scrub bar that keeps both tracks perfectly aligned to the exact millisecond.
  - Interactive In/Out trim markers to cut beginning and ending dead time.
- [x] **Task 7.2: Post-Recording One-Click AI Matting**
  - "Remove Background" button with model selector (Fast vs Studio HQ BiRefNet).
- [x] **Task 7.3: Drag-and-Drop Batch Processing Utility Tab**
  - Standalone tab to drop any external video file to extract background.
  - Real-time preview of processing speed, frame counter, and output format selector (`ProRes 4444`, `WebM VP9`, `Luma Matte Mask`).
  - Preview before-and-after split-slider on camera footage.
  - Background options: Transparent (Alpha), Blur, Solid Color, or Custom Studio Image/Gradient.
- [x] **Task 7.4: Telemetry Auto-Zoom Preview (Screen-Studio Style)**
  - Toggle to preview smooth dynamic auto-zooming onto mouse clicks.
  - Export composite video with auto-zoom baked in, or export project package for Premiere / DaVinci.

---

## Phase 8: Cross-Platform Verification & Packaging
- [x] **Task 8.1: Linux Packaging & Startup Scripts**
  - Created `scripts/start.sh` and `scripts/build-linux.sh`.
- [x] **Task 8.2: Windows Packaging Scripts**
  - Created `scripts/build-windows.bat`.
- [x] **Task 8.3: macOS Packaging Scripts**
  - Created `scripts/build-macos.sh`.
