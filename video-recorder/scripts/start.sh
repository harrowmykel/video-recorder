#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Screen & Camera Studio Launcher ==="

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

# 3. Start daemon in background
echo "Starting native capture daemon on http://127.0.0.1:4820..."
"$DIR/src-daemon/target/debug/recorder-daemon" &
DAEMON_PID=$!

# 4. Start frontend
echo "Starting Vue 3 Studio interface..."
npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo "Stopping services..."
    kill $DAEMON_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "App running!"
echo "UI: http://localhost:1420"
echo "Daemon: http://127.0.0.1:4820"
wait
