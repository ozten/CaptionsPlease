import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Word } from "./Word";
import { captionRowStyle } from "./styles";
import { CaptionTimingData, CaptionPage, CaptionPosition, PositionKeyframe } from "../types";

interface CaptionsProps {
  captionData: CaptionTimingData;
  // Optional: override position for live preview while adjusting
  previewPosition?: CaptionPosition | null;
}

// Default position: center horizontally, 80% down (near bottom)
const DEFAULT_POSITION: CaptionPosition = { x: 50, y: 80 };

// Interpolate position based on keyframes
function getInterpolatedPosition(
  frame: number,
  keyframes?: PositionKeyframe[],
  staticPosition?: CaptionPosition
): CaptionPosition {
  // If no keyframes, use static position or default
  if (!keyframes || keyframes.length === 0) {
    return staticPosition || DEFAULT_POSITION;
  }

  // Sort keyframes by frame
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  // Before first keyframe
  if (frame <= sorted[0].frame) {
    return { x: sorted[0].x, y: sorted[0].y };
  }

  // After last keyframe
  if (frame >= sorted[sorted.length - 1].frame) {
    const last = sorted[sorted.length - 1];
    return { x: last.x, y: last.y };
  }

  // Find surrounding keyframes and interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (frame >= current.frame && frame <= next.frame) {
      const x = interpolate(
        frame,
        [current.frame, next.frame],
        [current.x, next.x],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
      const y = interpolate(
        frame,
        [current.frame, next.frame],
        [current.y, next.y],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
      return { x, y };
    }
  }

  return staticPosition || DEFAULT_POSITION;
}

export const Captions: React.FC<CaptionsProps> = ({ captionData, previewPosition }) => {
  const frame = useCurrentFrame();

  // Find current page based on frame
  const currentPage = findCurrentPage(captionData.pages, frame);

  if (!currentPage) {
    return null;
  }

  // Use preview position if provided, otherwise interpolate from keyframes
  const position = previewPosition || getInterpolatedPosition(
    frame,
    captionData.positionKeyframes,
    captionData.position
  );

  // Convert percentage position to CSS
  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: "translate(-50%, -50%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0 40px",
    maxWidth: "90%",
  };

  return (
    <AbsoluteFill>
      <div style={containerStyle}>
        <div style={captionRowStyle}>
          {currentPage.words.map((word, index) => (
            <Word
              key={`${word.originalIndex}-${index}`}
              word={word}
              currentFrame={frame}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

function findCurrentPage(
  pages: CaptionPage[],
  frame: number
): CaptionPage | null {
  for (const page of pages) {
    if (frame >= page.startFrame && frame <= page.endFrame) {
      return page;
    }
  }

  for (let i = pages.length - 1; i >= 0; i--) {
    if (frame > pages[i].endFrame) {
      if (frame <= pages[i].endFrame + 5) {
        return pages[i];
      }
      break;
    }
  }

  return null;
}
