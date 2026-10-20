const fs = require('fs');
const path = require('path');

function prepareFfmpeg() {
  const binDir = path.join(__dirname, '../bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  const targetPath = path.join(binDir, exeName);

  let sourcePath = null;
  try {
    sourcePath = require('ffmpeg-static');
  } catch (err) {
    console.warn('[prepare-binaries] ffmpeg-static package not resolved:', err.message);
  }

  if (sourcePath && fs.existsSync(sourcePath)) {
    console.log(`[prepare-binaries] Copying FFmpeg binary from ${sourcePath} -> ${targetPath}`);
    fs.copyFileSync(sourcePath, targetPath);
    if (!isWin) {
      fs.chmodSync(targetPath, 0o755);
    }
    console.log('[prepare-binaries] Bundled FFmpeg successfully placed in bin/');
    return true;
  }

  if (fs.existsSync(targetPath)) {
    console.log(`[prepare-binaries] Existing FFmpeg binary found at ${targetPath}`);
    return true;
  }

  console.warn('[prepare-binaries] Warning: Could not locate static FFmpeg binary to copy to bin/');
  return false;
}

prepareFfmpeg();
