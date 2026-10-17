#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Building Screen & Camera Studio for macOS ==="
npm run build
cargo build --release --manifest-path src-daemon/Cargo.toml

echo "macOS binaries built in src-daemon/target/release/recorder-daemon"
