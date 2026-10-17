const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const appOutDir = context.appOutDir;
  const execName = context.packager.executableName || 'video-recorder-studio';
  const execPath = path.join(appOutDir, execName);
  const binPath = path.join(appOutDir, `${execName}.bin`);

  if (fs.existsSync(execPath) && !fs.existsSync(binPath)) {
    fs.renameSync(execPath, binPath);

    const wrapperScript = [
      '#!/usr/bin/env bash',
      'SOURCE="${BASH_SOURCE[0]}"',
      'while [ -h "$SOURCE" ]; do',
      '  DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"',
      '  SOURCE="$(readlink "$SOURCE")"',
      '  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"',
      'done',
      'DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"',
      `exec "$DIR/${execName}.bin" --no-sandbox "$@"`,
      '',
    ].join('\n');

    fs.writeFileSync(execPath, wrapperScript, { mode: 0o755 });
    fs.chmodSync(execPath, 0o755);
    console.log(`  • wrapped ${execName} with automatic --no-sandbox launcher`);
  }
};
