import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video, Audio } from "@remotion/media";
import {
  sessionData,
  SessionConfig,
  CameraTelemetryPoint,
} from "./sessionData";

interface CameraPipProps {
  src: string;
  telemetry: CameraTelemetryPoint[];
}

export const CameraPipVideo: React.FC<CameraPipProps> = ({ src, telemetry }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  const activePos = useMemo(() => {
    if (!telemetry || telemetry.length === 0) {
      return {
        normX: 0.82,
        normY: 0.72,
        width: 288,
        height: 288,
        shape: "circle",
        hidden: false,
      };
    }

    if (telemetry.length === 1 || currentTimeMs <= telemetry[0].timeMs) {
      return telemetry[0];
    }

    if (currentTimeMs >= telemetry[telemetry.length - 1].timeMs) {
      return telemetry[telemetry.length - 1];
    }

    let p0 = telemetry[0];
    let p1 = telemetry[telemetry.length - 1];

    for (let i = 0; i < telemetry.length - 1; i++) {
      if (
        currentTimeMs >= telemetry[i].timeMs &&
        currentTimeMs <= telemetry[i + 1].timeMs
      ) {
        p0 = telemetry[i];
        p1 = telemetry[i + 1];
        break;
      }
    }

    const span = p1.timeMs - p0.timeMs;
    const progress = span > 0 ? (currentTimeMs - p0.timeMs) / span : 0;

    return {
      normX: p0.normX + (p1.normX - p0.normX) * progress,
      normY: p0.normY + (p1.normY - p0.normY) * progress,
      width: p0.width + (p1.width - p0.width) * progress,
      height: p0.height + (p1.height - p0.height) * progress,
      shape: progress < 0.5 ? p0.shape : p1.shape,
      hidden: p0.hidden || p1.hidden,
    };
  }, [telemetry, currentTimeMs]);

  if (activePos.hidden) {
    return null;
  }

  const getBorderRadius = (shape?: string) => {
    switch (shape) {
      case "circle":
        return "50%";
      case "squircle":
        return "24px";
      case "rect16_9":
        return "12px";
      default:
        return "50%";
    }
  };

  const pipX = activePos.normX * width;
  const pipY = activePos.normY * height;

  return (
    <div
      style={{
        position: "absolute",
        left: `${pipX}px`,
        top: `${pipY}px`,
        width: `${activePos.width}px`,
        height: `${activePos.height}px`,
        borderRadius: getBorderRadius(activePos.shape),
        overflow: "hidden",
        boxShadow: "0 20px 48px rgba(0, 0, 0, 0.45)",
        border: "2px solid rgba(255, 255, 255, 0.2)",
        zIndex: 10,
      }}
    >
      <Video
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
};

export const MainVideo: React.FC<{ config?: SessionConfig }> = ({
  config = sessionData,
}) => {
  const { fps } = useVideoConfig();
  const toFrames = (ms: number) => Math.max(1, Math.round((ms / 1000) * fps));

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d14", overflow: "hidden" }}>
      {/* 1. Screen Tracks */}
      {config.screenTakes.map((take, idx) => (
        <Sequence
          key={`screen_${idx}_${take.file}`}
          from={toFrames(take.startMs)}
          durationInFrames={toFrames(take.durationMs)}
        >
          <Video
            src={staticFile(take.file)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </Sequence>
      ))}

      {/* 2. Camera PiP Tracks */}
      {config.cameraTakes.map((take, idx) => (
        <Sequence
          key={`camera_${idx}_${take.file}`}
          from={toFrames(take.startMs)}
          durationInFrames={toFrames(take.durationMs)}
        >
          <CameraPipVideo
            src={staticFile(take.file)}
            telemetry={config.telemetry}
          />
        </Sequence>
      ))}

      {/* 3. Microphone Audio Tracks */}
      {config.micTakes.map((take, idx) => (
        <Sequence
          key={`mic_${idx}_${take.file}`}
          from={toFrames(take.startMs)}
          durationInFrames={toFrames(take.durationMs)}
        >
          <Audio src={staticFile(take.file)} />
        </Sequence>
      ))}

      {/* 4. System Loopback Audio Tracks */}
      {config.sysAudioTakes.map((take, idx) => (
        <Sequence
          key={`sys_${idx}_${take.file}`}
          from={toFrames(take.startMs)}
          durationInFrames={toFrames(take.durationMs)}
        >
          <Audio src={staticFile(take.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
