const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Stop any running daemon first
require('./stop-daemon.cjs');

const exeSuffix = process.platform === 'win32' ? '.exe' : '';
const releaseBin = path.join(__dirname, `../src-daemon/target/release/recorder-daemon${exeSuffix}`);
const debugBin = path.join(__dirname, `../src-daemon/target/debug/recorder-daemon${exeSuffix}`);

const binToRun = fs.existsSync(releaseBin) ? releaseBin : fs.existsSync(debugBin) ? debugBin : null;

if (!binToRun) {
  console.error('[Error] No compiled recorder-daemon binary found in src-daemon/target/release or src-daemon/target/debug.');
  console.error('Run "npm run daemon:build" first to compile the daemon.');
  process.exit(1);
}

console.log(`Starting daemon from ${binToRun}...`);
const proc = spawn(binToRun, [], {
  stdio: 'inherit',
  env: { ...process.env, RUST_BACKTRACE: '1' },
});

proc.on('close', (code) => {
  process.exit(code || 0);
});
