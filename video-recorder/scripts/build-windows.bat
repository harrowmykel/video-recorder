@echo off
echo === Building Screen & Camera Studio for Windows ===
call npm run build
cargo build --release --manifest-path src-daemon\Cargo.toml
echo Windows binaries built in src-daemon\target\release\recorder-daemon.exe
