import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./Composition";
import { sessionData } from "./sessionData";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={MainVideo}
        durationInFrames={sessionData.durationInFrames || 900}
        fps={sessionData.fps || 60}
        width={sessionData.width || 1920}
        height={sessionData.height || 1080}
        defaultProps={{
          config: sessionData,
        }}
      />
    </>
  );
};
