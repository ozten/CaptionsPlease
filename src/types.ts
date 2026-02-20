// Whisper API response types
export interface WhisperWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface WhisperTranscription {
  task: string;
  language: string;
  duration: number;
  text: string;
  words: WhisperWord[];
  segments: WhisperSegment[];
}

// Filler analysis types
export interface FillerWord {
  word: string;
  startMs: number;
  endMs: number;
  index: number; // Position in original word array
  autoRemove: boolean;
}

export interface Pause {
  startMs: number;
  endMs: number;
  durationMs: number;
  afterWordIndex: number;
  autoRemove: boolean;
}

export interface FillerAnalysis {
  inputFile: string;
  fillerWords: FillerWord[];
  pauses: Pause[];
  totalFillers: number;
  totalPauses: number;
}

// Cuts data (editable by user)
export interface TimeSegment {
  startMs: number;
  endMs: number;
  reason: string;
}

export interface CutsData {
  inputFile: string;
  segmentsToRemove: TimeSegment[];
  totalCutDurationMs: number;
}

// Emphasis data
export interface EmphasisWord {
  word: string;
  index: number;
  reason: string;
}

export interface EmphasisData {
  inputFile: string;
  emphasisWords: EmphasisWord[];
  totalWords: number;
  emphasisPercentage: number;
}

// Caption timing data
export interface CaptionWord {
  word: string;
  startMs: number;
  endMs: number;
  startFrame: number;
  endFrame: number;
  isEmphasis: boolean;
  originalIndex: number;
}

export interface CaptionPage {
  words: CaptionWord[];
  startFrame: number;
  endFrame: number;
}

// Caption position settings (editable in JSON)
export interface CaptionPosition {
  x: number; // Horizontal position: 0 = left, 50 = center, 100 = right (percentage)
  y: number; // Vertical position: 0 = top, 50 = center, 100 = bottom (percentage)
}

// Position keyframe for animation
export interface PositionKeyframe {
  frame: number; // Frame number where this keyframe applies
  x: number;
  y: number;
}

export interface CaptionTimingData {
  inputFile: string;
  fps: number;
  totalFrames: number;
  durationMs: number;
  pages: CaptionPage[];
  allWords: CaptionWord[];
  // Optional: static caption position (defaults to center-bottom if not set)
  position?: CaptionPosition;
  // Optional: position keyframes for animation (overrides static position)
  positionKeyframes?: PositionKeyframe[];
}

// Script config
export interface PipelineConfig {
  inputDir: string;
  outputDir: string;
  dataDir: string;
  tempDir: string;
  fps: number;
  width: number;
  height: number;
}
