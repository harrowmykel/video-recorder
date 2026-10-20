const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Add ~/.cargo/bin to PATH if not already present
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const pathEnvKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
const currentPath = process.env[pathEnvKey] || '';

if (fs.existsSync(cargoBin) && !currentPath.includes(cargoBin)) {
  process.env[pathEnvKey] = `${cargoBin}${path.delimiter}${currentPath}`;
}

const isWindows = process.platform === 'win32';

// Check if cargo is available in PATH
const checkCmd = isWindows ? 'where' : 'which';
const checkCargo = spawnSync(checkCmd, ['cargo'], { shell: true });

if (checkCargo.status !== 0) {
  console.error('\n[Error] Cargo (Rust) is not found in PATH or in ' + cargoBin);
  console.error('To build the native capture daemon (src-daemon), the Rust toolchain is required.\n');
  if (isWindows) {
    console.error('On Windows, you can install Rust by running:');
    console.error('  winget install Rustlang.Rustup');
    console.error('or by downloading the installer from: https://rustup.rs\n');
    console.error('After installing, restart your terminal and run the build again.\n');
  } else {
    console.error('On Linux/macOS, install Rust by running:');
    console.error("  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n");
  }
  process.exit(1);
}

console.log('=== Building native capture daemon (recorder-daemon) ===');
const prepScript = path.join(__dirname, 'prepare-binaries.cjs');
if (fs.existsSync(prepScript)) {
  require(prepScript);
}
const result = spawnSync('cargo', ['build', '--release', '--manifest-path', 'src-daemon/Cargo.toml'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
