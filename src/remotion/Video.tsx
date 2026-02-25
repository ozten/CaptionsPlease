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
  onBackToProjects?: () => void;
  projectName?: string;
}

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
  videoSrc,
  position,
  emphasisIndices,
  showControls = false,
  captionDataJson,
  onBackToProjects,
  projectName,
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
  // pages is the source of truth - allWords is derived from it
  const captionData = useMemo(() => {
    if (!baseCaptionData) return null;

    // Apply emphasis toggles to pages (source of truth)
    const updatedPages = baseCaptionData.pages.map((page) => ({
      ...page,
      words: page.words.map((word) => {
        const shouldEmphasize = emphasisToggles.has(word.originalIndex)
          ? !word.isEmphasis
          : word.isEmphasis;
        return { ...word, isEmphasis: shouldEmphasize };
      }),
    }));

    // Derive allWords from pages for consistency
    const allWords = updatedPages.flatMap((page) => page.words);

    return {
      ...baseCaptionData,
      position: localPosition,
      positionKeyframes: keyframes,
      pages: updatedPages,
      allWords,
    };
  }, [baseCaptionData, localPosition, keyframes, emphasisToggles]);

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
          onBackToProjects={onBackToProjects}
          projectName={projectName}
        />
      )}
    </AbsoluteFill>
  );
};
