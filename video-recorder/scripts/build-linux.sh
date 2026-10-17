#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Building Screen & Camera Studio for Linux ==="
npm run build
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --release --manifest-path src-daemon/Cargo.toml

echo "Linux binaries built successfully in src-daemon/target/release/recorder-daemon"
