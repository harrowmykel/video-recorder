const { execSync } = require('child_process');

try {
  if (process.platform === 'win32') {
    execSync('taskkill /F /IM recorder-daemon.exe', { stdio: 'ignore' });
  } else {
    execSync('pkill -f recorder-daemon', { stdio: 'ignore' });
  }
} catch {
  // Ignored if process was not running
}
