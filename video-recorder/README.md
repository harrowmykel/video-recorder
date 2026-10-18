# Screen & Camera Studio Recorder 🎬⚡

A high-performance, studio-grade screen and camera desktop overlay recorder for Linux (Wayland & X11), built with **Vue 3**, **Tailwind CSS**, **Electron**, and a dedicated **Rust** capture daemon.

Inspired by *CleanShot X*, *Screen Studio*, *Raycast*, and *DaVinci Resolve*.

---

## ✨ Features

- **🎨 Multi-Theme Design System**:
  - **Obsidian Precision**: Smoked glass, 1px specular hairlines, and crimson accents (*Raycast / Linear style*).
  - **Spatial Frosted Glass**: Rounded-full capsules, circular tactile icon wells, and dynamic rim lighting (*Apple VisionOS style*).
  - **Broadcast Graphite Pro**: Anodized slate chassis, recessed OLED timecode, and safety orange tally lights (*DaVinci / Teenage Engineering style*).
  - **Nordic Alabaster & Ink**: High-contrast ceramic daylight surfaces with deep slate-ink pills (*Figma UI3 / Craft style*).
  - *Instant 1-click theme switching synchronized across all overlay windows in real-time.*

- **🪟 True OS Desktop Overlays**:
  - Independent transparent floating windows with native pointer dragging and click-through capability.
  - **Floating Action Pill**: Sleek transport dock with live audio wave meters, segment controls, and mini-pill collapse mode.
  - **Floating Camera Bubble**: Voice-reactive glow halo ring with unclipped safe-chord controls (Circle/Squircle, S/M/L, Mirror, and AI Cutout).
  - **3-2-1 Countdown HUD**: Pre-roll sync indicator (VisionOS radial progress, SMPTE leader crosshairs, or ceramic medallion).
  - **Screen Annotation Telestrator**: Draw arrows, rectangles, freehand pen, and numbered step badges directly onto your screen.

- **🔌 Dynamic Port Range Binding (`4820` – `4840`)**:
  - The Rust daemon automatically probes and binds to the first available port in the range, preventing `Address already in use` panics.
  - Automatically writes port discovery files to `/tmp/video-recorder-daemon.port` and `~/.config/video-recorder/daemon.port`.

- **🚀 100% Offline-First & Self-Hosted**:
  - Bundles local `@fontsource/inter` and `@fontsource/jetbrains-mono` fonts. Zero external network requests to Google Fonts.

- **🎥 Dual-Track Studio Review & Compositor**:
  - Decoupled screen and camera recording tracks for non-destructive post-production editing, camera resizing, wallpaper padding, and auto-zoom.

---

## 🚀 Quick Start

### 1. Run the Packaged Application (Fastest)

The application is pre-packaged and ready to run:

```bash
./run.sh
# or
npm start
# or directly:
./release/linux-unpacked/video-recorder-studio --no-sandbox
```

---

### 2. Run in Development Mode

To run with live hot-reloading:

```bash
# Terminal 1: Start the Rust Capture Daemon
npm run daemon:start

# Terminal 2: Start Vite Dev Server
npm run dev

# Terminal 3: Launch Electron Desktop Overlays
npm run overlay
```

> **Web Browser Preview**: You can also open [http://localhost:1420](http://localhost:1420) in any browser to test the full interactive studio workspace harness.

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> | **Start / Stop** recording |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> | **Pause / Resume** recording |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd> | Toggle **Screen Annotation** drawing canvas |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd> | Toggle **Camera Bubble** visibility |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Toggle **Live Zoom** tracking |
| <kbd>Esc</kbd> | Cancel countdown or dismiss annotation canvas |

---

## 📦 Packaging & Building for Production

### Package Unpacked Directory
```bash
npm run package:dir
```
* Generates `./release/linux-unpacked/` containing the `video-recorder-studio` executable and bundled `resources/bin/recorder-daemon`.

### Package Distributable (.AppImage)
```bash
npm run package:dist
```
* Generates standalone `.AppImage` inside `./release/`.
* 📖 **For full recreation instructions on a clean machine, see [RECREATE.md](RECREATE.md).**

---

## 📁 Project Architecture

```text
video-recorder/
├── designs/                      # Standalone HTML + Tailwind prototypes for each design
│   ├── index.html                # Gallery & interactive switcher
│   ├── 01-obsidian-raycast.html  # Obsidian Precision concept
│   ├── 02-macos-frosted-spatial.html # Spatial Frosted Glass concept
│   ├── 03-graphite-davinci-pro.html  # Broadcast Graphite Pro concept
│   └── 04-nordic-minimal-light-dark.html # Nordic Alabaster concept
├── electron/                     # Multi-window overlay coordinator
│   ├── main.cjs                  # Window creation, daemon spawning, IPC & global shortcuts
│   └── preload.cjs               # Secure context isolation bridge
├── src/                          # Vue 3 Composition API frontend
│   ├── components/
│   │   ├── toolbar/              # Floating Toolbar master controller & variants
│   │   │   └── variants/         # Obsidian, Spatial, Graphite, Nordic toolbars
│   │   ├── camera/               # Floating Camera Bubble master controller & variants
│   │   │   └── variants/         # Obsidian, Spatial, Graphite, Nordic cameras
│   │   ├── countdown/            # 3-2-1 Countdown HUD overlay
│   │   ├── annotations/          # Live screen markup & telestrator canvas
│   │   ├── studio/               # Review modal, timeline editor & batch AI matting
│   │   └── settings/             # Theme selector modal with live swatches
│   ├── composables/              # useTheme.ts (reactive state & cross-window sync)
│   ├── lib/                      # tauriBridge.ts (dynamic port discovery & daemon IPC)
│   ├── themes/                   # Theme registry, metadata & design tokens
│   ├── styles/                   # theme.css & Tailwind stylesheets
│   ├── App.vue                   # Window routing & workspace harness
│   └── main.ts                   # Vue root & offline local font bundles
├── src-daemon/                   # High-performance Rust capture daemon
│   ├── src/
│   │   ├── main.rs               # Warp HTTP server with dynamic port range binding (4820..4840)
│   │   ├── session.rs            # Multi-track recording session coordinator
│   │   ├── capture.rs            # PipeWire & FFmpeg hardware encoder pipes
│   │   └── ai.rs                 # Local GPU ONNX background segmentation
│   └── Cargo.toml                # Rust dependencies
├── run.sh                        # One-click Linux desktop launcher
└── package.json                  # NPM scripts & electron-builder packaging config
```

---

## 🛠️ Tech Stack

- **Frontend**: Vue 3.5 (Composition API, `<script setup>`), TypeScript, Tailwind CSS, Lucide Icons, `@fontsource`
- **Desktop Shell**: Electron 44 / Tauri v2, multi-window transparent compositor
- **Capture Core**: Rust (Tokio, Warp, PipeWire, FFmpeg NVENC/VAAPI, ONNX Runtime)
- **Packaging**: Electron Builder, Cargo
