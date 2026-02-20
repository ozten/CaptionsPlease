import React, { useState, useCallback, useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { Captions } from "./Captions";
import { ControlPanel } from "./ControlPanel";
import { CaptionTimingData, CaptionPosition, PositionKeyframe } from "../types";

export interface CaptionedVideoProps {
  videoSrc: string;
  position: CaptionPosition;
  emphasisIndices: number[];
  showControls?: boolean;
  captionDataJson: string;
}

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
  videoSrc,
  position,
  emphasisIndices,
  showControls = false,
  captionDataJson,
}) => {
  // Parse caption data
  const baseCaptionData: CaptionTimingData | null = useMemo(() => {
    if (!captionDataJson) return null;
    try {
      return JSON.parse(captionDataJson);
    } catch {
      return null;
    }
  }, [captionDataJson]);

  // State for control panel overrides
  const [localPosition, setLocalPosition] = useState<CaptionPosition>(position);
  const [keyframes, setKeyframes] = useState<PositionKeyframe[]>(
    baseCaptionData?.positionKeyframes || []
  );
  const [emphasisToggles, setEmphasisToggles] = useState<Set<number>>(new Set());

  // Compute final caption data with all overrides
  const captionData = useMemo(() => {
    if (!baseCaptionData) return null;

    const emphasisSet = new Set([
      ...emphasisIndices,
      ...Array.from(emphasisToggles),
    ]);

    return {
      ...baseCaptionData,
      position: localPosition,
      positionKeyframes: keyframes,
      allWords: baseCaptionData.allWords.map((word) => {
        const shouldEmphasize = emphasisToggles.has(word.originalIndex)
          ? !word.isEmphasis
          : emphasisIndices.length > 0
            ? emphasisSet.has(word.originalIndex)
            : word.isEmphasis;
        return { ...word, isEmphasis: shouldEmphasize };
      }),
      pages: baseCaptionData.pages.map((page) => ({
        ...page,
        words: page.words.map((word) => {
          const shouldEmphasize = emphasisToggles.has(word.originalIndex)
            ? !word.isEmphasis
            : emphasisIndices.length > 0
              ? emphasisSet.has(word.originalIndex)
              : word.isEmphasis;
          return { ...word, isEmphasis: shouldEmphasize };
        }),
      })),
    };
  }, [baseCaptionData, localPosition, keyframes, emphasisIndices, emphasisToggles]);

  const handleEmphasisToggle = useCallback((wordIndex: number) => {
    setEmphasisToggles((prev) => {
      const next = new Set(prev);
      if (next.has(wordIndex)) {
        next.delete(wordIndex);
      } else {
        next.add(wordIndex);
      }
      return next;
    });
  }, []);

  if (!videoSrc || !captionData) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#fff", fontSize: 48 }}>No video loaded</div>
      </AbsoluteFill>
    );
  }

  const videoSource = staticFile(videoSrc);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={videoSource}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Pass previewPosition when controls are shown for live preview */}
      <Captions
        captionData={captionData}
        previewPosition={showControls ? localPosition : null}
      />

      {showControls && (
        <ControlPanel
          captionData={captionData}
          position={localPosition}
          keyframes={keyframes}
          onPositionChange={setLocalPosition}
          onKeyframesChange={setKeyframes}
          onEmphasisToggle={handleEmphasisToggle}
        />
      )}
    </AbsoluteFill>
  );
};
