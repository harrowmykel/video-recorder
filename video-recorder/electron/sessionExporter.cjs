const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

/**
 * Resolves the path to the ffmpeg executable across development and packaged environments.
 */
function getFfmpegExecutablePath(options = {}) {
  if (options.ffmpegPath && fs.existsSync(options.ffmpegPath)) {
    return options.ffmpegPath;
  }
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const possiblePaths = [
    path.join(process.resourcesPath || '', `bin/ffmpeg${exeExt}`),
    path.join(__dirname, `../bin/ffmpeg${exeExt}`),
    path.join(__dirname, `../node_modules/ffmpeg-static/ffmpeg${exeExt}`),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

/**
 * Resolves the path to the Remotion template folder.
 */
function getRemotionTemplateDir() {
  const candidatePaths = [
    path.join(__dirname, '../resources/remotion-video'),
    path.join(process.resourcesPath || '', 'resources/remotion-video'),
    path.join(process.resourcesPath || '', 'remotion-video'),
    path.join(app ? app.getAppPath() : '', 'resources/remotion-video'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return candidatePaths[0];
}

/**
 * Parses an NDJSON file line-by-line into an array of objects.
 */
function parseNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`[Export] Failed to parse ndjson at ${filePath}:`, err);
    return [];
  }
}

/**
 * Runs FFmpeg to concatenate multiple video or audio files via the concat demuxer.
 */
function runFfmpegConcat(inputFiles, outputFile, ffmpegPath) {
  if (inputFiles.length === 0) return false;
  if (inputFiles.length === 1) {
    try {
      fs.copyFileSync(inputFiles[0], outputFile);
      return true;
    } catch (err) {
      console.warn(`[Export] Failed to copy single chunk to ${outputFile}:`, err);
      return false;
    }
  }

  const tmpConcatTxt = path.join(path.dirname(outputFile), `concat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.txt`);
  try {
    const concatContent = inputFiles
      .map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(tmpConcatTxt, concatContent, 'utf-8');

    const res = spawnSync(ffmpegPath, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', tmpConcatTxt,
      '-c', 'copy',
      outputFile,
    ], { encoding: 'utf-8' });

    if (res.status !== 0) {
      console.warn(`[Export] FFmpeg concat exited with status ${res.status}:`, res.stderr);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[Export] FFmpeg concat error:`, err);
    return false;
  } finally {
    if (fs.existsSync(tmpConcatTxt)) {
      try { fs.unlinkSync(tmpConcatTxt); } catch {}
    }
  }
}

/**
 * Consolidates contiguous raw chunks into logical take files for each track.
 * Writes take files into `outputTakesDir` and returns structured metadata.
 */
function consolidateTakes({ sourceDir, outputTakesDir, sessionMetadata, ffmpegPath, relativePrefix = 'takes' }) {
  fs.mkdirSync(outputTakesDir, { recursive: true });

  const totalDurationMs = sessionMetadata?.durationMs || sessionMetadata?.duration_ms || 15000;
  const pad = (n) => String(n).padStart(2, '0');

  const screenTakes = [];
  const cameraTakes = [];
  const micTakes = [];
  const sysAudioTakes = [];

  // 1. Screen Takes
  const screenManifestPath = path.join(sourceDir || '', 'screen_manifest.ndjson');
  const screenChunks = parseNdjson(screenManifestPath);

  if (screenChunks.length > 0) {
    screenChunks.sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    const groups = [];
    let currentGroup = [];

    for (const chunk of screenChunks) {
      const fullPath = path.isAbsolute(chunk.file) ? chunk.file : path.join(sourceDir, chunk.file);
      if (!fs.existsSync(fullPath)) continue;

      if (currentGroup.length === 0) {
        currentGroup.push({ ...chunk, fullPath });
      } else {
        const prev = currentGroup[currentGroup.length - 1];
        const gap = (chunk.start_ms || 0) - (prev.end_ms || 0);
        const modeMatches = chunk.source_mode === prev.source_mode;
        const resMatches = chunk.resolution?.width === prev.resolution?.width && chunk.resolution?.height === prev.resolution?.height;

        if (gap <= 500 && modeMatches && resMatches) {
          currentGroup.push({ ...chunk, fullPath });
        } else {
          groups.push(currentGroup);
          currentGroup = [{ ...chunk, fullPath }];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    groups.forEach((group, idx) => {
      const takeFileName = `screen_take_${pad(idx + 1)}.mp4`;
      const takeDest = path.join(outputTakesDir, takeFileName);
      const inputs = group.map((c) => c.fullPath);
      const ok = runFfmpegConcat(inputs, takeDest, ffmpegPath);
      if (ok) {
        screenTakes.push({
          file: `${relativePrefix}/${takeFileName}`,
          absolutePath: takeDest,
          startMs: group[0].start_ms || 0,
          endMs: group[group.length - 1].end_ms || totalDurationMs,
          durationMs: (group[group.length - 1].end_ms || totalDurationMs) - (group[0].start_ms || 0),
          sourceMode: group[0].source_mode || 'display',
          width: group[0].resolution?.width,
          height: group[0].resolution?.height,
        });
      }
    });
  }

  // Fallback if no screen takes were created from chunks
  if (screenTakes.length === 0) {
    const fallbackScreen = sessionMetadata?.screenPath || (sourceDir ? path.join(sourceDir, 'screen_clean.mp4') : null);
    if (fallbackScreen && fs.existsSync(fallbackScreen)) {
      const takeFileName = 'screen_take_01.mp4';
      const takeDest = path.join(outputTakesDir, takeFileName);
      fs.copyFileSync(fallbackScreen, takeDest);
      screenTakes.push({
        file: `${relativePrefix}/${takeFileName}`,
        absolutePath: takeDest,
        startMs: 0,
        endMs: totalDurationMs,
        durationMs: totalDurationMs,
        sourceMode: 'display',
      });
    }
  }

  // 2. Camera Takes
  const cameraManifestPath = path.join(sourceDir || '', 'camera_manifest.ndjson');
  const cameraChunks = parseNdjson(cameraManifestPath);

  if (cameraChunks.length > 0) {
    cameraChunks.sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    const activeChunks = cameraChunks.filter((c) => !c.is_hidden);
    const groups = [];
    let currentGroup = [];

    for (const chunk of activeChunks) {
      const fullPath = path.isAbsolute(chunk.file) ? chunk.file : path.join(sourceDir, chunk.file);
      if (!fs.existsSync(fullPath)) continue;

      if (currentGroup.length === 0) {
        currentGroup.push({ ...chunk, fullPath });
      } else {
        const prev = currentGroup[currentGroup.length - 1];
        const gap = (chunk.start_ms || 0) - (prev.end_ms || 0);

        if (gap <= 500) {
          currentGroup.push({ ...chunk, fullPath });
        } else {
          groups.push(currentGroup);
          currentGroup = [{ ...chunk, fullPath }];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    groups.forEach((group, idx) => {
      const isWebm = group[0].file.endsWith('.webm');
      const ext = isWebm ? '.webm' : '.mp4';
      const takeFileName = `camera_take_${pad(idx + 1)}${ext}`;
      const takeDest = path.join(outputTakesDir, takeFileName);
      const inputs = group.map((c) => c.fullPath);
      const ok = runFfmpegConcat(inputs, takeDest, ffmpegPath);
      if (ok) {
        cameraTakes.push({
          file: `${relativePrefix}/${takeFileName}`,
          absolutePath: takeDest,
          startMs: group[0].start_ms || 0,
          endMs: group[group.length - 1].end_ms || totalDurationMs,
          durationMs: (group[group.length - 1].end_ms || totalDurationMs) - (group[0].start_ms || 0),
          shape: group[0].bubble?.shape || 'circle',
          width: group[0].bubble?.width || 288,
          height: group[0].bubble?.height || 288,
        });
      }
    });
  }

  // Fallback if no camera takes were created from chunks
  if (cameraTakes.length === 0) {
    const fallbackCam = sessionMetadata?.cameraAlphaPath || sessionMetadata?.cameraRawPath ||
      (sourceDir && fs.existsSync(path.join(sourceDir, 'camera_alpha.webm')) ? path.join(sourceDir, 'camera_alpha.webm') :
        (sourceDir && fs.existsSync(path.join(sourceDir, 'camera_raw.mp4')) ? path.join(sourceDir, 'camera_raw.mp4') : null));
    if (fallbackCam && fs.existsSync(fallbackCam)) {
      const ext = fallbackCam.endsWith('.webm') ? '.webm' : '.mp4';
      const takeFileName = `camera_take_01${ext}`;
      const takeDest = path.join(outputTakesDir, takeFileName);
      fs.copyFileSync(fallbackCam, takeDest);
      cameraTakes.push({
        file: `${relativePrefix}/${takeFileName}`,
        absolutePath: takeDest,
        startMs: 0,
        endMs: totalDurationMs,
        durationMs: totalDurationMs,
        shape: 'circle',
        width: 288,
        height: 288,
      });
    }
  }

  // 3. Audio Mic Takes
  const micManifestPath = path.join(sourceDir || '', 'mic_manifest.ndjson');
  const micChunks = parseNdjson(micManifestPath);

  if (micChunks.length > 0) {
    micChunks.sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    const groups = [];
    let currentGroup = [];

    for (const chunk of micChunks) {
      const fullPath = path.isAbsolute(chunk.file) ? chunk.file : path.join(sourceDir, chunk.file);
      if (!fs.existsSync(fullPath)) continue;

      if (currentGroup.length === 0) {
        currentGroup.push({ ...chunk, fullPath });
      } else {
        const prev = currentGroup[currentGroup.length - 1];
        const gap = (chunk.start_ms || 0) - (prev.end_ms || 0);

        if (gap <= 500) {
          currentGroup.push({ ...chunk, fullPath });
        } else {
          groups.push(currentGroup);
          currentGroup = [{ ...chunk, fullPath }];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    groups.forEach((group, idx) => {
      const takeFileName = `audio_mic_take_${pad(idx + 1)}.wav`;
      const takeDest = path.join(outputTakesDir, takeFileName);
      const inputs = group.map((c) => c.fullPath);
      const ok = runFfmpegConcat(inputs, takeDest, ffmpegPath);
      if (ok) {
        micTakes.push({
          file: `${relativePrefix}/${takeFileName}`,
          absolutePath: takeDest,
          startMs: group[0].start_ms || 0,
          endMs: group[group.length - 1].end_ms || totalDurationMs,
          durationMs: (group[group.length - 1].end_ms || totalDurationMs) - (group[0].start_ms || 0),
        });
      }
    });
  }

  if (micTakes.length === 0) {
    const fallbackMic = sessionMetadata?.micAudioPath || (sourceDir ? path.join(sourceDir, 'audio_mic.wav') : null);
    if (fallbackMic && fs.existsSync(fallbackMic)) {
      const takeFileName = 'audio_mic_take_01.wav';
      const takeDest = path.join(outputTakesDir, takeFileName);
      fs.copyFileSync(fallbackMic, takeDest);
      micTakes.push({
        file: `${relativePrefix}/${takeFileName}`,
        absolutePath: takeDest,
        startMs: 0,
        endMs: totalDurationMs,
        durationMs: totalDurationMs,
      });
    }
  }

  // 4. System Audio Takes
  const sysManifestPath = path.join(sourceDir || '', 'sys_audio_manifest.ndjson');
  const sysChunks = parseNdjson(sysManifestPath);

  if (sysChunks.length > 0) {
    sysChunks.sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0));
    const groups = [];
    let currentGroup = [];

    for (const chunk of sysChunks) {
      const fullPath = path.isAbsolute(chunk.file) ? chunk.file : path.join(sourceDir, chunk.file);
      if (!fs.existsSync(fullPath)) continue;

      if (currentGroup.length === 0) {
        currentGroup.push({ ...chunk, fullPath });
      } else {
        const prev = currentGroup[currentGroup.length - 1];
        const gap = (chunk.start_ms || 0) - (prev.end_ms || 0);

        if (gap <= 500) {
          currentGroup.push({ ...chunk, fullPath });
        } else {
          groups.push(currentGroup);
          currentGroup = [{ ...chunk, fullPath }];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    groups.forEach((group, idx) => {
      const takeFileName = `audio_sys_take_${pad(idx + 1)}.wav`;
      const takeDest = path.join(outputTakesDir, takeFileName);
      const inputs = group.map((c) => c.fullPath);
      const ok = runFfmpegConcat(inputs, takeDest, ffmpegPath);
      if (ok) {
        sysAudioTakes.push({
          file: `${relativePrefix}/${takeFileName}`,
          absolutePath: takeDest,
          startMs: group[0].start_ms || 0,
          endMs: group[group.length - 1].end_ms || totalDurationMs,
          durationMs: (group[group.length - 1].end_ms || totalDurationMs) - (group[0].start_ms || 0),
        });
      }
    });
  }

  if (sysAudioTakes.length === 0) {
    const fallbackSys = sessionMetadata?.sysAudioPath || (sourceDir ? path.join(sourceDir, 'audio_system.wav') : null);
    if (fallbackSys && fs.existsSync(fallbackSys)) {
      const takeFileName = 'audio_sys_take_01.wav';
      const takeDest = path.join(outputTakesDir, takeFileName);
      fs.copyFileSync(fallbackSys, takeDest);
      sysAudioTakes.push({
        file: `${relativePrefix}/${takeFileName}`,
        absolutePath: takeDest,
        startMs: 0,
        endMs: totalDurationMs,
        durationMs: totalDurationMs,
      });
    }
  }

  return {
    screenTakes,
    cameraTakes,
    micTakes,
    sysAudioTakes,
    totalDurationMs,
  };
}

/**
 * Builds and executes an FFmpeg -filter_complex command to composite all takes into a single MP4.
 */
function renderSingleMp4({ takesData, targetFile, telemetry, ffmpegPath, includeCameraPip = true }) {
  const durSec = Math.max(1, Number((takesData.totalDurationMs / 1000).toFixed(3)));
  const args = ['-y'];
  const filterParts = [];
  const inputs = [];

  // Register all input takes with indices
  const registerInput = (take) => {
    take.inputIndex = inputs.length;
    inputs.push(take.absolutePath);
    args.push('-i', take.absolutePath);
  };

  takesData.screenTakes.forEach(registerInput);
  if (includeCameraPip) {
    takesData.cameraTakes.forEach(registerInput);
  }
  takesData.micTakes.forEach(registerInput);
  takesData.sysAudioTakes.forEach(registerInput);

  // 1. Base Canvas
  filterParts.push(`color=c=black:s=1920x1080:r=60:d=${durSec} [base_canvas]`);
  let currentVideo = '[base_canvas]';

  // 2. Overlay Screen Takes
  takesData.screenTakes.forEach((take, idx) => {
    const startSec = (take.startMs / 1000).toFixed(3);
    const endSec = (take.endMs / 1000).toFixed(3);
    const nextVideo = `[v_screen_${idx}]`;
    filterParts.push(`${currentVideo}[${take.inputIndex}:v] overlay=0:0:enable='between(t,${startSec},${endSec})' ${nextVideo}`);
    currentVideo = nextVideo;
  });

  // 3. Overlay Camera Takes (optional based on includeCameraPip)
  if (includeCameraPip && takesData.cameraTakes.length > 0) {
    const initialPoint = telemetry?.[0] || {
      normX: 0.82,
      normY: 0.72,
      width: 288,
      height: 288,
      shape: 'circle',
      hidden: false,
    };

    takesData.cameraTakes.forEach((take, idx) => {
      const startSec = (take.startMs / 1000).toFixed(3);
      const endSec = (take.endMs / 1000).toFixed(3);
      const camW = take.width || initialPoint.width || 288;
      const camH = take.height || initialPoint.height || 288;
      const camX = Math.round((initialPoint.normX || 0.82) * 1920);
      const camY = Math.round((initialPoint.normY || 0.72) * 1080);

      const scaledCam = `[v_cam_scaled_${idx}]`;
      const nextVideo = `[v_cam_${idx}]`;
      filterParts.push(`[${take.inputIndex}:v] scale=${camW}:${camH} ${scaledCam}`);
      filterParts.push(`${currentVideo}${scaledCam} overlay=x=${camX}:y=${camY}:enable='between(t,${startSec},${endSec})' ${nextVideo}`);
      currentVideo = nextVideo;
    });
  }

  // 4. Audio Mixing
  const audioOutputs = [];
  [...takesData.micTakes, ...takesData.sysAudioTakes].forEach((take, idx) => {
    const delayMs = take.startMs;
    const delayedLabel = `[a_delayed_${idx}]`;
    if (delayMs > 0) {
      filterParts.push(`[${take.inputIndex}:a] adelay=${delayMs}|${delayMs} ${delayedLabel}`);
    } else {
      filterParts.push(`[${take.inputIndex}:a] anull ${delayedLabel}`);
    }
    audioOutputs.push(delayedLabel);
  });

  let audioMap = '[aout]';
  if (audioOutputs.length === 0) {
    filterParts.push(`aevalsrc=0:d=${durSec} [aout]`);
  } else if (audioOutputs.length === 1) {
    filterParts.push(`${audioOutputs[0]} anull [aout]`);
  } else {
    filterParts.push(`${audioOutputs.join('')} amix=inputs=${audioOutputs.length}:dropout_transition=0:normalize=0 [aout]`);
  }

  args.push(
    '-filter_complex', filterParts.join('; '),
    '-map', currentVideo,
    '-map', audioMap,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    targetFile
  );

  const res = spawnSync(ffmpegPath, args, { encoding: 'utf-8' });
  if (res.status !== 0) {
    console.warn(`[Export] FFmpeg single_mp4 render exited with status ${res.status}:`, res.stderr);
    return false;
  }
  return true;
}

/**
 * Main export handler function.
 * Supported presets: 'single_mp4', 'remotion_video', 'mp4_bundle'.
 */
async function exportSessionPackage({ targetDir, sessionMetadata, preset = 'single_mp4', includeCameraPip }, options = {}) {
  try {
    const homeDir = options.homeDir || (app ? app.getPath('home') : require('os').homedir());
    const resolvedTargetDir = targetDir.startsWith('~/')
      ? path.join(homeDir, targetDir.slice(2))
      : targetDir;
    fs.mkdirSync(resolvedTargetDir, { recursive: true });

    const ffmpegPath = getFfmpegExecutablePath(options);
    const shouldIncludeCameraPip = includeCameraPip !== undefined
      ? Boolean(includeCameraPip)
      : (sessionMetadata?.includeCameraPip !== false);

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

    const durMs = sessionMetadata?.durationMs || sessionMetadata?.duration_ms || 15000;
    const durSec = durMs / 1000;
    const durFrames = Math.max(1, Math.round(durSec * 60));

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

    // Copy notes.md if present
    const notesSrc = sessionMetadata?.notesPath || sessionMetadata?.notes_file ||
      (sourceDir && fs.existsSync(path.join(sourceDir, 'notes.md')) ? path.join(sourceDir, 'notes.md') : null);
    if (notesSrc && fs.existsSync(notesSrc)) {
      try {
        fs.copyFileSync(notesSrc, path.join(resolvedTargetDir, 'notes.md'));
      } catch {}
    }

    if (preset === 'single_mp4') {
      // 1. Single MP4: Consolidate takes and render assembled MP4
      const tmpTakesDir = path.join(resolvedTargetDir, '.tmp_takes');
      const takesData = consolidateTakes({
        sourceDir,
        outputTakesDir: tmpTakesDir,
        sessionMetadata,
        ffmpegPath,
        relativePrefix: '.tmp_takes',
      });

      const singleMp4File = path.join(resolvedTargetDir, 'single_recording.mp4');
      const renderOk = renderSingleMp4({
        takesData,
        targetFile: singleMp4File,
        telemetry,
        ffmpegPath,
        includeCameraPip: shouldIncludeCameraPip,
      });

      // Cleanup tmp takes after single_mp4 render
      if (fs.existsSync(tmpTakesDir)) {
        try { fs.rmSync(tmpTakesDir, { recursive: true, force: true }); } catch {}
      }

      if (!renderOk) {
        throw new Error('FFmpeg failed to composite single_mp4');
      }

      // Write manifest
      fs.writeFileSync(path.join(resolvedTargetDir, 'package_manifest.json'), JSON.stringify({
        preset: 'single_mp4',
        exportedAt: new Date().toISOString(),
        session: {
          id: sessionMetadata?.sessionId || sessionMetadata?.id || 'session',
          durationMs: durMs,
        },
        file: 'single_recording.mp4',
        includeCameraPip: shouldIncludeCameraPip,
        telemetrySampleCount: telemetry.length,
      }, null, 2));

      return { success: true, targetDir: resolvedTargetDir, file: singleMp4File };

    } else if (preset === 'remotion_video') {
      // 2. Remotion Video: Instantiate Remotion project with takes in public/takes/
      const templateDir = getRemotionTemplateDir();
      if (!fs.existsSync(templateDir)) {
        throw new Error(`Remotion template directory not found at: ${templateDir}`);
      }

      // Copy template files (excluding node_modules and .git)
      fs.cpSync(templateDir, resolvedTargetDir, {
        recursive: true,
        filter: (src) => {
          const base = path.basename(src);
          return base !== 'node_modules' && base !== '.git';
        },
      });

      const publicTakesDir = path.join(resolvedTargetDir, 'public/takes');
      const takesData = consolidateTakes({
        sourceDir,
        outputTakesDir: publicTakesDir,
        sessionMetadata,
        ffmpegPath,
        relativePrefix: 'takes',
      });

      // Generate customized src/sessionData.ts
      const sessionConfigObj = {
        sessionId: sessionMetadata?.sessionId || sessionMetadata?.id || 'session',
        fps: 60,
        width: 1920,
        height: 1080,
        totalDurationMs: durMs,
        durationInFrames: durFrames,
        screenTakes: takesData.screenTakes.map(({ absolutePath, ...rest }) => rest),
        cameraTakes: takesData.cameraTakes.map(({ absolutePath, ...rest }) => rest),
        micTakes: takesData.micTakes.map(({ absolutePath, ...rest }) => rest),
        sysAudioTakes: takesData.sysAudioTakes.map(({ absolutePath, ...rest }) => rest),
        telemetry,
      };

      const sessionDataTsContent = `export interface TakeSegment {
  file: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  width?: number;
  height?: number;
  sourceMode?: string;
  shape?: string;
}

export interface CameraTelemetryPoint {
  timeMs: number;
  x: number;
  y: number;
  normX: number;
  normY: number;
  width: number;
  height: number;
  shape: 'circle' | 'squircle' | 'rect16_9' | string;
  hidden: boolean;
}

export interface SessionConfig {
  sessionId: string;
  fps: number;
  width: number;
  height: number;
  totalDurationMs: number;
  durationInFrames: number;
  screenTakes: TakeSegment[];
  cameraTakes: TakeSegment[];
  micTakes: TakeSegment[];
  sysAudioTakes: TakeSegment[];
  telemetry: CameraTelemetryPoint[];
}

export const sessionData: SessionConfig = ${JSON.stringify(sessionConfigObj, null, 2)};
`;

      fs.writeFileSync(path.join(resolvedTargetDir, 'src/sessionData.ts'), sessionDataTsContent, 'utf-8');

      // Write telemetry and manifest in root and public
      const manifestJson = JSON.stringify({
        preset: 'remotion_video',
        exportedAt: new Date().toISOString(),
        session: {
          id: sessionMetadata?.sessionId || sessionMetadata?.id || 'session',
          durationMs: durMs,
          durationInFrames: durFrames,
          fps: 60,
        },
        takes: {
          screenCount: takesData.screenTakes.length,
          cameraCount: takesData.cameraTakes.length,
          micCount: takesData.micTakes.length,
          sysAudioCount: takesData.sysAudioTakes.length,
        },
        cameraInitialPosition: initialPoint,
        telemetrySampleCount: telemetry.length,
      }, null, 2);

      fs.writeFileSync(path.join(resolvedTargetDir, 'package_manifest.json'), manifestJson);
      fs.writeFileSync(path.join(resolvedTargetDir, 'public/package_manifest.json'), manifestJson);

      if (telemetry.length > 0) {
        const telemetryJson = JSON.stringify(telemetry, null, 2);
        fs.writeFileSync(path.join(resolvedTargetDir, 'telemetry_camera.json'), telemetryJson);
        fs.writeFileSync(path.join(resolvedTargetDir, 'public/telemetry_camera.json'), telemetryJson);
      }

      return { success: true, targetDir: resolvedTargetDir };

    } else if (preset === 'mp4_bundle') {
      // 3. Raw Asset Archive: Output takes directly into takes/
      const takesDir = path.join(resolvedTargetDir, 'takes');
      const takesData = consolidateTakes({
        sourceDir,
        outputTakesDir: takesDir,
        sessionMetadata,
        ffmpegPath,
        relativePrefix: 'takes',
      });

      if (telemetry.length > 0) {
        fs.writeFileSync(path.join(resolvedTargetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
      }

      fs.writeFileSync(path.join(resolvedTargetDir, 'package_manifest.json'), JSON.stringify({
        preset: 'mp4_bundle',
        exportedAt: new Date().toISOString(),
        session: {
          id: sessionMetadata?.sessionId || sessionMetadata?.id || 'session',
          durationMs: durMs,
        },
        takes: {
          screen: takesData.screenTakes.map(({ absolutePath, ...rest }) => rest),
          camera: takesData.cameraTakes.map(({ absolutePath, ...rest }) => rest),
          mic: takesData.micTakes.map(({ absolutePath, ...rest }) => rest),
          sysAudio: takesData.sysAudioTakes.map(({ absolutePath, ...rest }) => rest),
        },
        cameraInitialPosition: initialPoint,
        telemetrySampleCount: telemetry.length,
      }, null, 2));

      return { success: true, targetDir: resolvedTargetDir };
    }

    throw new Error(`Unsupported export preset: "${preset}"`);
  } catch (err) {
    console.error('[Export] Failed to export session package:', err);
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
  getFfmpegExecutablePath,
  getRemotionTemplateDir,
  consolidateTakes,
};
