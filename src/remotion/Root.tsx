import React from "react";
import { Composition, getInputProps } from "remotion";
import { CaptionedVideo } from "./Video";

type CompositionProps = {
  videoSrc: string;
  position: { x: number; y: number };
  emphasisIndices: number[];
  showControls: boolean;
  captionDataJson: string;
};

const inputProps = getInputProps() as Partial<CompositionProps>;

export const RemotionRoot: React.FC = () => {
  // Parse caption data from JSON string if provided
  let captionData = null;
  let durationInFrames = 300;
  let fps = 30;

  if (inputProps?.captionDataJson) {
    try {
      captionData = JSON.parse(inputProps.captionDataJson);
      durationInFrames = captionData?.totalFrames || 300;
      fps = captionData?.fps || 30;
    } catch (e) {
      console.error("Failed to parse captionDataJson");
    }
  }

  // Apply position and emphasis overrides from props panel
  if (captionData && inputProps?.position) {
    captionData = {
      ...captionData,
      position: inputProps.position,
    };
  }

  // Apply emphasis overrides
  const emphasisSet = new Set(inputProps?.emphasisIndices || []);
  if (captionData && emphasisSet.size > 0) {
    captionData = {
      ...captionData,
      allWords: captionData.allWords.map((w: any) => ({
        ...w,
        isEmphasis: emphasisSet.has(w.originalIndex),
      })),
      pages: captionData.pages.map((p: any) => ({
        ...p,
        words: p.words.map((w: any) => ({
          ...w,
          isEmphasis: emphasisSet.has(w.originalIndex),
        })),
      })),
    };
  }

  return (
    <>
      <Composition
        id="CaptionedVideo"
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        component={CaptionedVideo as any}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{
          videoSrc: inputProps?.videoSrc || "video.mp4",
          position: inputProps?.position || { x: 50, y: 80 },
          emphasisIndices: inputProps?.emphasisIndices || [],
          showControls: inputProps?.showControls ?? false,
          captionDataJson: inputProps?.captionDataJson || "",
        }}
      />
    </>
  );
};
