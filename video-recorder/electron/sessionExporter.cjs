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
      if (hasCameraFile && telemetry.length > 0) {
        fs.writeFileSync(path.join(resolvedTargetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
      }

      const screenXmlTrack = hasScreenFile ? `
            <track>
              <!-- Video Track 1: Clean Screen Recording -->
              <clipitem id="clipitem-screen">
                <name>screen_clean.mp4</name>
                <duration>${durFrames}</duration>
                <rate><timebase>60</timebase></rate>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-screen">
                  <name>screen_clean.mp4</name>
                  <pathurl>file://screen_clean.mp4</pathurl>
                </file>
              </clipitem>
            </track>` : '';

      let cameraXmlTrack = '';
      if (hasCameraFile) {
        const camFile = hasCameraAlpha ? 'camera_alpha.webm' : 'camera_raw.mp4';
        const pScale = Number((((initialPoint.width || 288) / 1920) * 100).toFixed(2));
        const pCenterX = Number(((initialPoint.normX || 0.8) - 0.5 + ((initialPoint.width || 288) / (1920 * 2))).toFixed(4));
        const pCenterY = Number(((initialPoint.normY || 0.7) - 0.5 + ((initialPoint.height || 288) / (1080 * 2))).toFixed(4));
        cameraXmlTrack = `
            <track>
              <!-- Video Track 2: Camera PIP -->
              <clipitem id="clipitem-camera">
                <name>${camFile}</name>
                <duration>${durFrames}</duration>
                <rate><timebase>60</timebase></rate>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-camera">
                  <name>${camFile}</name>
                  <pathurl>file://${camFile}</pathurl>
                </file>
                <filter>
                  <effect>
                    <name>Basic Motion</name>
                    <effectid>basic</effectid>
                    <effectcategory>motion</effectcategory>
                    <parameter><parameterid>scale</parameterid><name>Scale</name><value>${pScale}</value></parameter>
                    <parameter><parameterid>center</parameterid><name>Center</name><value><horiz>${pCenterX}</horiz><vert>${pCenterY}</vert></value></parameter>
                  </effect>
                </filter>
              </clipitem>
            </track>`;
      }

      const micXmlTrack = hasMicFile ? `
            <track>
              <!-- Audio Track 1: Microphone Stem -->
              <clipitem id="clipitem-mic">
                <name>audio_mic.wav</name>
                <duration>${durFrames}</duration>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-mic"><pathurl>file://audio_mic.wav</pathurl></file>
              </clipitem>
            </track>` : '';

      const sysXmlTrack = hasSysAudioFile ? `
            <track>
              <!-- Audio Track 2: System Audio Stem -->
              <clipitem id="clipitem-sys">
                <name>audio_system.wav</name>
                <duration>${durFrames}</duration>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-sys"><pathurl>file://audio_system.wav</pathurl></file>
              </clipitem>
            </track>` : '';

      const xmlPath = path.join(resolvedTargetDir, 'project_sync.xml');
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <project>
    <name>Studio Sync Package</name>
    <children>
      <sequence id="sequence-1">
        <name>Synchronized Recording</name>
        <rate><timebase>60</timebase></rate>
        <media>
          <video>${screenXmlTrack}${cameraXmlTrack}
          </video>
          <audio>${micXmlTrack}${sysXmlTrack}
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;
      fs.writeFileSync(xmlPath, xmlContent);
    } else if (preset === 'capcut_draft') {
      const capcutVideos = [];
      const capcutAudios = [];
      const capcutScreenSegments = [];
      const capcutCameraSegments = [];
      const capcutMicSegments = [];
      const capcutSysSegments = [];

      if (hasScreenFile) {
        capcutVideos.push({
          id: 'mat_screen_0',
          path: 'screen_clean.mp4',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: durUs,
        });
        capcutScreenSegments.push({
          id: 'seg_screen',
          material_id: 'mat_screen_0',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
        });
      }

      if (hasCameraFile) {
        const camFile = hasCameraAlpha ? 'camera_alpha.webm' : 'camera_raw.mp4';
        const cX = Number((((initialPoint.normX || 0.8) - 0.5) * 2).toFixed(4));
        const cY = Number((-((initialPoint.normY || 0.7) - 0.5) * 2).toFixed(4));
        const cScale = Number(((initialPoint.width || 288) / 1920).toFixed(4));
        capcutVideos.push({
          id: 'mat_camera_1',
          path: camFile,
          type: 'video',
          width: 1280,
          height: 720,
          duration: durUs,
        });
        capcutCameraSegments.push({
          id: 'seg_camera',
          material_id: 'mat_camera_1',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
          clip: {
            transform: { x: cX, y: cY },
            scale: { x: cScale, y: cScale },
          },
        });
      }

      if (hasMicFile) {
        capcutAudios.push({ id: 'mat_mic_audio', path: 'audio_mic.wav', type: 'audio', duration: durUs });
        capcutMicSegments.push({
          id: 'seg_mic',
          material_id: 'mat_mic_audio',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
        });
      }

      if (hasSysAudioFile) {
        capcutAudios.push({ id: 'mat_sys_audio', path: 'audio_system.wav', type: 'audio', duration: durUs });
        capcutSysSegments.push({
          id: 'seg_sys',
          material_id: 'mat_sys_audio',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
        });
      }

      const capcutTracks = [];
      if (capcutScreenSegments.length > 0) {
        capcutTracks.push({ id: 'track_screen_main', type: 'video', segments: capcutScreenSegments });
      }
      if (capcutCameraSegments.length > 0) {
        capcutTracks.push({ id: 'track_camera_pip', type: 'video', segments: capcutCameraSegments });
      }
      if (capcutMicSegments.length > 0) {
        capcutTracks.push({ id: 'track_mic_audio', type: 'audio', segments: capcutMicSegments });
      }
      if (capcutSysSegments.length > 0) {
        capcutTracks.push({ id: 'track_sys_audio', type: 'audio', segments: capcutSysSegments });
      }

      const capcutDraftContent = {
        canvas_config: { height: 1080, ratio: 'original', width: 1920 },
        color_space: 0,
        duration: durUs,
        fps: 60.0,
        materials: {
          videos: capcutVideos,
          audios: capcutAudios,
        },
        tracks: capcutTracks,
      };

      const capcutDraftMeta = {
        draft_id: sessionMetadata?.sessionId || sessionMetadata?.id || `draft_${Date.now()}`,
        draft_name: `ScreenStudio_${sessionMetadata?.sessionId || sessionMetadata?.id || 'Session'}`,
        draft_root_path: resolvedTargetDir,
        tm_draft_create: Date.now() * 1000,
        tm_draft_modified: Date.now() * 1000,
        draft_timeline_materials_size: capcutVideos.length + capcutAudios.length,
      };

      fs.writeFileSync(path.join(resolvedTargetDir, 'draft_content.json'), JSON.stringify(capcutDraftContent, null, 2));
      fs.writeFileSync(path.join(resolvedTargetDir, 'draft_meta_info.json'), JSON.stringify(capcutDraftMeta, null, 2));

      const capcutReadme = `CapCut Studio Project Instructions:
1. To open in CapCut Desktop:
   - You can copy this folder into your CapCut Drafts folder:
     • Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\
     • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/
   - Or drag the media files directly into CapCut.
2. The project contains synchronized multi-track segments for Screen, Camera PiP, and Audio Stems.
`;
      fs.writeFileSync(path.join(resolvedTargetDir, 'CAPCUT_README.txt'), capcutReadme);
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
