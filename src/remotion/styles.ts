import React from "react";

// Caption styling (duplicated from config.ts to avoid Node.js dependencies in webpack)
const CAPTION_STYLES = {
  emphasisColor: "#00FF88",
  normalColor: "#FFFFFF",
  fontFamily: "Montserrat, sans-serif",
  fontSize: 72,
  fontWeight: 800,
  textShadow: "0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.9)",
  wordsPerPage: 4,
  bottomOffset: "20%",
};

export const captionContainerStyle: React.CSSProperties = {
  position: "absolute",
  bottom: CAPTION_STYLES.bottomOffset,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "0 40px",
};

export const captionRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
  gap: "8px",
  maxWidth: "90%",
};

export const wordStyle: React.CSSProperties = {
  fontFamily: CAPTION_STYLES.fontFamily,
  fontSize: CAPTION_STYLES.fontSize,
  fontWeight: CAPTION_STYLES.fontWeight,
  color: CAPTION_STYLES.normalColor,
  textShadow: CAPTION_STYLES.textShadow,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  lineHeight: 1.2,
};

export const emphasisWordStyle: React.CSSProperties = {
  ...wordStyle,
  color: CAPTION_STYLES.emphasisColor,
  textShadow: `
    ${CAPTION_STYLES.textShadow},
    0 0 20px ${CAPTION_STYLES.emphasisColor}40,
    0 0 40px ${CAPTION_STYLES.emphasisColor}20
  `,
};
