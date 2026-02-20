import { PipelineConfig } from "./types.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export const config: PipelineConfig = {
  inputDir: path.join(projectRoot, "input"),
  outputDir: path.join(projectRoot, "output"),
  dataDir: path.join(projectRoot, "data"),
  tempDir: path.join(projectRoot, "temp"),
  fps: 30,
  width: 1080,
  height: 1920,
};

// Filler words to detect (case-insensitive)
export const FILLER_WORDS = [
  "um",
  "uh",
  "uhh",
  "umm",
  "hmm",
  "hm",
  "er",
  "err",
  "ah",
  "ahh",
  "like", // Only when standalone/filler usage
  "you know",
  "basically",
  "actually",
  "literally",
  "so", // Only at sentence start as filler
  "well", // Only at sentence start as filler
];

// Filler word patterns (regex)
export const FILLER_PATTERNS = [
  /^u+[hm]+$/i, // um, uh, uhm, uhh, umm, etc.
  /^e+r+$/i, // er, err
  /^a+h+$/i, // ah, ahh
  /^h+m+$/i, // hm, hmm
];

// Pause detection thresholds (in milliseconds)
export const PAUSE_THRESHOLDS = {
  // Minimum pause duration to detect
  detectMs: 500,
  // Pause duration that triggers auto-removal suggestion
  autoRemoveMs: 1000,
};

// Caption styling
export const CAPTION_STYLES = {
  // Emphasis color (TikTok green)
  emphasisColor: "#00FF88",
  // Normal text color
  normalColor: "#FFFFFF",
  // Font settings
  fontFamily: "Montserrat, sans-serif",
  fontSize: 72,
  fontWeight: 800,
  // Text shadow for readability
  textShadow: "0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.9)",
  // Words per page
  wordsPerPage: 4,
  // Vertical position (from bottom, as percentage)
  bottomOffset: "20%",
};

// FFmpeg settings
export const FFMPEG_SETTINGS = {
  // Audio codec for extraction
  audioCodec: "pcm_s16le",
  // Video codec for output
  videoCodec: "libx264",
  // CRF quality (lower = better, 18-23 recommended)
  crf: 18,
  // Preset (slower = better compression)
  preset: "medium",
};

// GPT settings for emphasis detection
export const GPT_SETTINGS = {
  model: "gpt-4o",
  // Target emphasis percentage range
  emphasisMinPercent: 15,
  emphasisMaxPercent: 25,
};
