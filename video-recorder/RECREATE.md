# How to Recreate & Build the Release Package from Scratch 🛠️📦

This guide provides full, step-by-step instructions to recreate, compile, package, and verify the **Screen & Camera Studio Recorder** on any clean Linux machine.

---

## 1. System Requirements & Prerequisites

### Required Software
- **Operating System**: Linux (Ubuntu 22.04/24.04, Debian 12, Fedora 39+, Arch Linux) with Wayland or X11 compositor.
- **Node.js**: `v20.x` or later (`node -v`)
- **NPM**: `v10.x` or later (`npm -v`)
- **Rust & Cargo**: `1.75` or later (`cargo --version`)
- **Python 3** (with Pillow for icon generation, optional if icon is preserved)
- **FFmpeg**: `v5.0` or later (`ffmpeg -version`)

### Install Dependencies on Ubuntu / Debian:
```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  pkg-config \
  libasound2-dev \
  libpipewire-0.3-dev \
  libclang-dev \
  ffmpeg \
  python3-pil
```

### Install Node.js & Rust (if not installed):
```bash
# Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

---

## 2. Project Setup

1. **Clone the repository and enter the directory**:
   ```bash
   cd video-recorder
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

---

## 3. Step-by-Step Build Pipeline

### Step A: Compile the Rust Core Daemon (`recorder-daemon`)
The backend capture service is written in Rust and utilizes Warp, Tokio, and PipeWire/FFmpeg pipelines:

```bash
npm run daemon:build
# or directly:
cargo build --release --manifest-path src-daemon/Cargo.toml
```

- **Output Binary**: `src-daemon/target/release/recorder-daemon`
- **Features Tested**:
  - Dynamic port range binding (`4820` – `4840`) with automatic collision avoidance.
  - Creation of discovery files at `/tmp/video-recorder-daemon.port` and `~/.config/video-recorder/daemon.port`.

---

### Step B: Build the Vue 3 Frontend Assets
The frontend uses Vue 3 (Composition API), TypeScript, Tailwind CSS, and local `@fontsource` bundles:

```bash
# 1. Typecheck the codebase
npm run typecheck

# 2. Build production assets
npm run build
```

- **Output Directory**: `dist/`
- **Verification**: All fonts (Inter & JetBrains Mono) are bundled locally as static `.woff2` files inside `dist/assets/`, guaranteeing 100% offline functionality.

---

### Step C: Generate High-Resolution App Icon (if modifying)
The application icon is placed in `build/icon.png`:

```bash
python3 -c "
import os
from PIL import Image, ImageDraw

os.makedirs('build', exist_ok=True)
size = (512, 512)
img = Image.new('RGBA', size, (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

draw.rounded_rectangle([(16, 16), (496, 496)], radius=110, fill=(18, 20, 26, 255), outline=(255, 255, 255, 35), width=4)
draw.ellipse([(100, 100), (412, 412)], fill=(24, 27, 36, 255), outline=(99, 102, 241, 160), width=8)
draw.ellipse([(180, 180), (332, 332)], fill=(244, 63, 94, 255), outline=(255, 255, 255, 200), width=6)
draw.ellipse([(226, 226), (286, 286)], fill=(255, 255, 255, 255))

img.save('build/icon.png')
print('Icon generated at build/icon.png')
"
```

---

### Step D: Build the Standalone Packages

To bundle the frontend, Electron runtime, and compiled `recorder-daemon` into distributable Linux packages:

```bash
npm run package:dist
```

This single command:
1. Re-runs `npm run build` and `npm run daemon:build`.
2. Packages the Electron shell and copies `src-daemon/target/release/recorder-daemon` into the app's `resources/bin/` folder.
3. Automatically sets `--no-sandbox` in the `.desktop` launcher and flags to prevent Chromium SUID sandbox panics on Linux.
4. Generates the standalone **`.AppImage`** package.

---

## 4. Resulting Artifacts (`release/`)

After packaging completes, the generated release files are located in `release/`:

| Artifact | Size | Description |
| :--- | :--- | :--- |
| **`Screen Studio Recorder-0.1.0.AppImage`** | ~128 MB | Standalone, double-clickable single-file executable for any Linux distro. |
| **`release/linux-unpacked/`** | ~275 MB | Unpacked binary directory for rapid testing and development. |

---

## 5. How to Run & Verify the Packages

### Running the `.AppImage`:
```bash
chmod +x "release/Screen Studio Recorder-0.1.0.AppImage"
"./release/Screen Studio Recorder-0.1.0.AppImage"
```

### Running the Unpacked Directory:
```bash
./run.sh
# or
npm start
```

---

## 6. Verification Checklist

When the app launches:
1. **Desktop Overlays**: The floating action pill appears at the bottom-center and the camera bubble appears at the bottom-right.
2. **Background Daemon**: Electron automatically executes `resources/bin/recorder-daemon`, probes ports `4820..4840`, and establishes connection.
3. **Themes**: Click the **Settings** gear icon on the toolbar to switch in real-time between:
   - *Obsidian Precision*
   - *Spatial Frosted Glass*
   - *Broadcast Graphite Pro*
   - *Nordic Alabaster & Ink*
4. **Recording Flow**: Click **Record** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>) to trigger the 3-2-1 HUD and start capturing.
