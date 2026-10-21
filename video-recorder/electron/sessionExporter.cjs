const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Exports a session package into the specified target directory with the given preset.
 * Supported presets: 'premiere_xml', 'capcut_draft', 'mp4_bundle'.
 *
 * @param {Object} params
 * @param {string} params.targetDir
 * @param {Object} [params.sessionMetadata]
 * @param {string} [params.preset='premiere_xml']
 * @param {Object} [options]
 * @param {string} [options.homeDir]
 * @param {Function} [options.getRecordedCameraTelemetry]
 * @param {Array} [options.recordedCameraTelemetry]
 */
async function exportSessionPackage({ targetDir, sessionMetadata, preset = 'premiere_xml' }, options = {}) {
  try {
    const homeDir = options.homeDir || (app ? app.getPath('home') : require('os').homedir());
    const resolvedTargetDir = targetDir.startsWith('~/')
      ? path.join(homeDir, targetDir.slice(2))
      : targetDir;
    fs.mkdirSync(resolvedTargetDir, { recursive: true });

    // Determine source directory
    const rawSourceDir =
      sessionMetadata && sessionMetadata.sessionDir
        ? sessionMetadata.sessionDir
        : sessionMetadata && sessionMetadata.outputDir
          ? sessionMetadata.outputDir
          : sessionMetadata && sessionMetadata.screenPath
            ? path.dirname(sessionMetadata.screenPath)
            : null;

    const sourceDir = rawSourceDir && rawSourceDir.startsWith('~/')
      ? path.join(homeDir, rawSourceDir.slice(2))
      : rawSourceDir;

    // Only copy clean finalized media files (do not copy internal chunks/ or daemon manifests)
    const mediaTracks = [
      { name: 'screen_clean.mp4', explicit: sessionMetadata?.screenPath },
      { name: 'camera_raw.mp4', explicit: sessionMetadata?.cameraRawPath },
      { name: 'camera_alpha.webm', explicit: sessionMetadata?.cameraAlphaPath },
      { name: 'audio_mic.wav', explicit: sessionMetadata?.micAudioPath },
      { name: 'audio_system.wav', explicit: sessionMetadata?.sysAudioPath },
      { name: 'notes.md', explicit: sessionMetadata?.notesPath || sessionMetadata?.notes_file },
    ];

    for (const track of mediaTracks) {
      const destFile = path.join(resolvedTargetDir, track.name);
      if (fs.existsSync(destFile)) continue;

      let src = null;
      if (track.explicit && fs.existsSync(track.explicit)) {
        src = track.explicit;
      } else if (sourceDir) {
        const candidate = path.join(sourceDir, track.name);
        if (fs.existsSync(candidate)) {
          src = candidate;
        }
      }

      if (src && path.resolve(src) !== path.resolve(destFile)) {
        try {
          fs.copyFileSync(src, destFile);
        } catch (copyErr) {
          console.warn(`[Export] Could not copy ${track.name}:`, copyErr);
        }
      }
    }

    const hasScreenFile = fs.existsSync(path.join(resolvedTargetDir, 'screen_clean.mp4'));
    const hasCameraAlpha = fs.existsSync(path.join(resolvedTargetDir, 'camera_alpha.webm'));
    const hasCameraRaw = fs.existsSync(path.join(resolvedTargetDir, 'camera_raw.mp4'));
    const hasCameraFile = hasCameraAlpha || hasCameraRaw;
    const hasMicFile = fs.existsSync(path.join(resolvedTargetDir, 'audio_mic.wav'));
    const hasSysAudioFile = fs.existsSync(path.join(resolvedTargetDir, 'audio_system.wav'));

    const durMs = sessionMetadata?.durationMs || sessionMetadata?.duration_ms || 15000;
    const durSec = durMs / 1000;
    const durFrames = Math.max(1, Math.round(durSec * 60));
    const durUs = Math.round(durSec * 1000000);

    const fallbackTelemetry = typeof options.getRecordedCameraTelemetry === 'function'
      ? options.getRecordedCameraTelemetry()
      : (options.recordedCameraTelemetry || []);

    const telemetry = (sessionMetadata && sessionMetadata.cameraTelemetry && sessionMetadata.cameraTelemetry.length)
      ? sessionMetadata.cameraTelemetry
      : fallbackTelemetry;

    const initialPoint = telemetry[0] || {
      normX: 0.82,
      normY: 0.72,
      width: 288,
      height: 288,
      shape: 'circle',
      hidden: false,
    };

    // 1. Write package_manifest.json with summary of included tracks
    const manifestPath = path.join(resolvedTargetDir, 'package_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      preset,
      exportedAt: new Date().toISOString(),
      session: {
        id: sessionMetadata?.sessionId || sessionMetadata?.id || 'session',
        durationMs: durMs,
      },
      tracks: {
        screen: hasScreenFile ? 'screen_clean.mp4' : null,
        camera: hasCameraAlpha ? 'camera_alpha.webm' : (hasCameraRaw ? 'camera_raw.mp4' : null),
        mic: hasMicFile ? 'audio_mic.wav' : null,
        sysAudio: hasSysAudioFile ? 'audio_system.wav' : null,
      },
      cameraInitialPosition: hasCameraFile ? initialPoint : null,
      telemetrySampleCount: hasCameraFile ? telemetry.length : 0,
    }, null, 2));

    // 2. Preset-specific project files
    if (preset === 'premiere_xml') {
      // unimplemented: export Premiere Pro XML project file
    } else if (preset === 'capcut_draft') {
      // unimplemented: export CapCut Studio project file
      const capcutReadme = `CapCut Studio Project Instructions:
1. To open in CapCut Desktop:
   - You can copy this folder into your CapCut Drafts folder:
     • Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\
     • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/
   - Or drag the media files directly into CapCut.
2. The project contains synchronized multi-track segments for Screen, Camera PiP, and Audio Stems.
`;
    } else if (preset === 'mp4_bundle') {
      if (hasCameraFile && telemetry.length > 0) {
        fs.writeFileSync(path.join(resolvedTargetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
      }
    }

    return { success: true, targetDir: resolvedTargetDir };
  } catch (err) {
    console.error('Failed to export package:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registers the 'export_session_package' IPC handler on the given ipcMain instance.
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {Object} [options]
 */
function registerSessionExportHandler(ipcMain, options = {}) {
  ipcMain.handle('export_session_package', async (_event, params) => {
    return exportSessionPackage(params, options);
  });
}

module.exports = {
  exportSessionPackage,
  registerSessionExportHandler,
};
