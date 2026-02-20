import fs from "fs";
import path from "path";
import { config, CAPTION_STYLES } from "../config.js";
import {
  CutsData,
  EmphasisData,
  CaptionTimingData,
  CaptionWord,
  CaptionPage,
  TimeSegment,
  WhisperWord,
} from "../types.js";

function adjustTimestamp(
  originalMs: number,
  removedSegments: TimeSegment[]
): number {
  let adjustment = 0;
  for (const seg of removedSegments) {
    if (seg.endMs <= originalMs) {
      // Segment is entirely before this timestamp
      adjustment += seg.endMs - seg.startMs;
    } else if (seg.startMs < originalMs) {
      // Segment overlaps with this timestamp
      adjustment += originalMs - seg.startMs;
    }
  }
  return originalMs - adjustment;
}

function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

function generateCaptionTiming(
  words: WhisperWord[],
  cutsData: CutsData,
  emphasisData: EmphasisData,
  fps: number,
  originalDurationMs: number
): CaptionTimingData {
  const emphasisIndices = new Set(emphasisData.emphasisWords.map((w) => w.index));
  const captionWords: CaptionWord[] = [];

  // Process each word
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const originalStartMs = Math.round(word.start * 1000);
    const originalEndMs = Math.round(word.end * 1000);

    // Check if this word is cut
    let isCut = false;
    for (const segment of cutsData.segmentsToRemove) {
      if (originalStartMs < segment.endMs && originalEndMs > segment.startMs) {
        isCut = true;
        break;
      }
    }

    if (isCut) continue;

    // Adjust timestamps based on cuts
    const adjustedStartMs = adjustTimestamp(originalStartMs, cutsData.segmentsToRemove);
    const adjustedEndMs = adjustTimestamp(originalEndMs, cutsData.segmentsToRemove);

    captionWords.push({
      word: word.word,
      startMs: adjustedStartMs,
      endMs: adjustedEndMs,
      startFrame: msToFrame(adjustedStartMs, fps),
      endFrame: msToFrame(adjustedEndMs, fps),
      isEmphasis: emphasisIndices.has(i),
      originalIndex: i,
    });
  }

  // Create pages (groups of words)
  const pages: CaptionPage[] = [];
  const wordsPerPage = CAPTION_STYLES.wordsPerPage;

  for (let i = 0; i < captionWords.length; i += wordsPerPage) {
    const pageWords = captionWords.slice(i, i + wordsPerPage);
    if (pageWords.length > 0) {
      pages.push({
        words: pageWords,
        startFrame: pageWords[0].startFrame,
        endFrame: pageWords[pageWords.length - 1].endFrame,
      });
    }
  }

  // Calculate final duration after cuts
  const finalDurationMs = originalDurationMs - cutsData.totalCutDurationMs;
  const totalFrames = msToFrame(finalDurationMs, fps);

  return {
    inputFile: cutsData.inputFile,
    fps,
    totalFrames,
    durationMs: finalDurationMs,
    pages,
    allWords: captionWords,
    // Caption position: x=0-100 (left to right), y=0-100 (top to bottom)
    // Default: centered horizontally (50), near bottom (80)
    position: { x: 50, y: 80 },
    // Position keyframes for animation: [{ frame: 0, x: 50, y: 50 }, { frame: 1800, x: 50, y: 80 }]
    positionKeyframes: [],
  };
}

async function main() {
  console.log("=== Step 4: Generate Timing ===\n");

  // Read transcription
  const transcriptionPath = path.join(config.dataDir, "01_transcription.json");
  const transcriptionData = JSON.parse(fs.readFileSync(transcriptionPath, "utf-8"));

  // Read cuts data
  const cutsPath = path.join(config.dataDir, "03_cuts.json");
  const cutsData: CutsData = JSON.parse(fs.readFileSync(cutsPath, "utf-8"));

  // Read emphasis data
  const emphasisPath = path.join(config.dataDir, "04_emphasis.json");
  const emphasisData: EmphasisData = JSON.parse(fs.readFileSync(emphasisPath, "utf-8"));

  const originalDurationMs = Math.round((transcriptionData.duration || 0) * 1000);

  // Generate caption timing
  const captionTiming = generateCaptionTiming(
    transcriptionData.words || [],
    cutsData,
    emphasisData,
    config.fps,
    originalDurationMs
  );

  // Save timing data
  const outputPath = path.join(config.dataDir, "05_caption_timing.json");
  fs.writeFileSync(outputPath, JSON.stringify(captionTiming, null, 2));
  console.log(`Caption timing saved to: ${outputPath}`);

  // Print summary
  console.log("\n--- Summary ---");
  console.log(`Original duration: ${(originalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Final duration: ${(captionTiming.durationMs / 1000).toFixed(2)}s`);
  console.log(`Cut: ${(cutsData.totalCutDurationMs / 1000).toFixed(2)}s`);
  console.log(`Total frames: ${captionTiming.totalFrames}`);
  console.log(`Caption pages: ${captionTiming.pages.length}`);
  console.log(`Words with captions: ${captionTiming.allWords.length}`);
  console.log(
    `Emphasis words: ${captionTiming.allWords.filter((w) => w.isEmphasis).length}`
  );
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
