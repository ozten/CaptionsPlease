import React from "react";
import { spring, useVideoConfig } from "remotion";
import { wordStyle, emphasisWordStyle } from "./styles";
import { CaptionWord } from "../types";

interface WordProps {
  word: CaptionWord;
  currentFrame: number;
}

export const Word: React.FC<WordProps> = ({ word, currentFrame }) => {
  const { fps } = useVideoConfig();

  // Calculate animation progress
  const framesSinceStart = currentFrame - word.startFrame;

  // Only animate if this word has started
  if (framesSinceStart < 0) {
    return (
      <span
        style={{
          ...wordStyle,
          opacity: 0,
          transform: "scale(0)",
        }}
      >
        {word.word}
      </span>
    );
  }

  // Spring animation for pop-in effect
  const scale = spring({
    frame: framesSinceStart,
    fps,
    config: {
      damping: 12,
      stiffness: 200,
      mass: 0.5,
    },
  });

  // Opacity animation
  const opacity = spring({
    frame: framesSinceStart,
    fps,
    config: {
      damping: 20,
      stiffness: 300,
    },
  });

  // Apply emphasis styling
  const style: React.CSSProperties = {
    ...(word.isEmphasis ? emphasisWordStyle : wordStyle),
    transform: `scale(${scale})`,
    opacity,
    display: "inline-block",
    marginRight: "0.25em",
  };

  return <span style={style}>{word.word}</span>;
};
