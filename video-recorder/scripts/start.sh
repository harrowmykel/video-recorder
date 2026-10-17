#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Screen & Camera Studio Overlay Launcher ==="

# 1. Check if Rust is available
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/bin/cargo" ]; then
        export PATH="$HOME/.cargo/bin:$PATH"
    fi
fi

# 2. Build daemon if not already built
if [ ! -f "$DIR/src-daemon/target/debug/recorder-daemon" ]; then
    echo "Compiling native capture daemon..."
    cargo build --manifest-path "$DIR/src-daemon/Cargo.toml"
fi

# 3. Start daemon in background if not already listening on 4820
if ! ss -ltn | grep -q ":4820 "; then
    echo "Starting native capture daemon on http://127.0.0.1:4820..."
    "$DIR/src-daemon/target/debug/recorder-daemon" &
    DAEMON_PID=$!
fi

# 4. Start Vite dev server if not already listening on 1420
if ! ss -ltn | grep -q ":1420 "; then
    echo "Starting Vue 3 Studio dev server on http://localhost:1420..."
    npm run dev &
    FRONTEND_PID=$!
    sleep 1.5
fi

# 5. Launch native frameless always-on-top OS Desktop Overlays
echo "Launching True OS Desktop Overlays (Toolbar & Camera Bubble)..."
npm run overlay &
OVERLAY_PID=$!

cleanup() {
    echo "Stopping overlay services..."
    [ -n "$OVERLAY_PID" ] && kill $OVERLAY_PID 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
    [ -n "$DAEMON_PID" ] && kill $DAEMON_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Desktop Overlay Active!"
wait $OVERLAY_PID
cleanup
