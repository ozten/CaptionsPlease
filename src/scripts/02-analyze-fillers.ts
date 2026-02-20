import fs from "fs";
import path from "path";
import { config, FILLER_PATTERNS, PAUSE_THRESHOLDS } from "../config.js";
import {
  WhisperTranscription,
  FillerWord,
  Pause,
  FillerAnalysis,
  CutsData,
  TimeSegment,
} from "../types.js";

function isFillerWord(word: string): boolean {
  const normalized = word.toLowerCase().replace(/[.,!?]/g, "");

  // Check against regex patterns
  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

function analyzeFillers(
  transcription: WhisperTranscription
): { fillerWords: FillerWord[]; pauses: Pause[] } {
  const fillerWords: FillerWord[] = [];
  const pauses: Pause[] = [];
  const words = transcription.words || [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const startMs = Math.round(word.start * 1000);
    const endMs = Math.round(word.end * 1000);

    // Check for filler words
    if (isFillerWord(word.word)) {
      fillerWords.push({
        word: word.word,
        startMs,
        endMs,
        index: i,
        autoRemove: true, // Fillers are auto-remove by default
      });
    }

    // Check for pauses between words
    if (i < words.length - 1) {
      const nextWord = words[i + 1];
      const gapMs = Math.round((nextWord.start - word.end) * 1000);

      if (gapMs >= PAUSE_THRESHOLDS.detectMs) {
        pauses.push({
          startMs: endMs,
          endMs: Math.round(nextWord.start * 1000),
          durationMs: gapMs,
          afterWordIndex: i,
          autoRemove: gapMs >= PAUSE_THRESHOLDS.autoRemoveMs,
        });
      }
    }
  }

  return { fillerWords, pauses };
}

function generateCutsData(
  inputFile: string,
  fillerWords: FillerWord[],
  pauses: Pause[]
): CutsData {
  const segmentsToRemove: TimeSegment[] = [];

  // Add filler words that are marked for removal
  for (const filler of fillerWords) {
    if (filler.autoRemove) {
      segmentsToRemove.push({
        startMs: filler.startMs,
        endMs: filler.endMs,
        reason: `filler: "${filler.word}"`,
      });
    }
  }

  // Add pauses that are marked for removal
  for (const pause of pauses) {
    if (pause.autoRemove) {
      // Keep a small gap (200ms) to avoid jarring cuts
      const keepMs = 200;
      if (pause.durationMs > keepMs * 2) {
        segmentsToRemove.push({
          startMs: pause.startMs + keepMs,
          endMs: pause.endMs - keepMs,
          reason: `pause: ${pause.durationMs}ms`,
        });
      }
    }
  }

  // Sort by start time
  segmentsToRemove.sort((a, b) => a.startMs - b.startMs);

  // Merge overlapping segments
  const merged: TimeSegment[] = [];
  for (const seg of segmentsToRemove) {
    if (merged.length === 0) {
      merged.push(seg);
    } else {
      const last = merged[merged.length - 1];
      if (seg.startMs <= last.endMs) {
        // Overlapping, merge them
        last.endMs = Math.max(last.endMs, seg.endMs);
        last.reason = `${last.reason}; ${seg.reason}`;
      } else {
        merged.push(seg);
      }
    }
  }

  const totalCutDurationMs = merged.reduce(
    (sum, seg) => sum + (seg.endMs - seg.startMs),
    0
  );

  return {
    inputFile,
    segmentsToRemove: merged,
    totalCutDurationMs,
  };
}

async function main() {
  console.log("=== Step 2: Analyze Fillers ===\n");

  // Read transcription
  const transcriptionPath = path.join(config.dataDir, "01_transcription.json");
  if (!fs.existsSync(transcriptionPath)) {
    throw new Error(
      `Transcription not found at ${transcriptionPath}. Run 01-transcribe.ts first.`
    );
  }

  const transcriptionData = JSON.parse(fs.readFileSync(transcriptionPath, "utf-8"));
  const inputFile = transcriptionData.inputFile;

  // Analyze fillers and pauses
  const { fillerWords, pauses } = analyzeFillers(transcriptionData);

  // Save filler analysis
  const fillerAnalysis: FillerAnalysis = {
    inputFile,
    fillerWords,
    pauses,
    totalFillers: fillerWords.length,
    totalPauses: pauses.length,
  };

  const fillerPath = path.join(config.dataDir, "02_filler_analysis.json");
  fs.writeFileSync(fillerPath, JSON.stringify(fillerAnalysis, null, 2));
  console.log(`Filler analysis saved to: ${fillerPath}`);

  // Generate cuts data
  const cutsData = generateCutsData(inputFile, fillerWords, pauses);
  const cutsPath = path.join(config.dataDir, "03_cuts.json");
  fs.writeFileSync(cutsPath, JSON.stringify(cutsData, null, 2));
  console.log(`Cuts data saved to: ${cutsPath}`);

  // Print summary
  console.log("\n--- Summary ---");
  console.log(`Filler words found: ${fillerWords.length}`);
  if (fillerWords.length > 0) {
    console.log(
      `  Words: ${fillerWords.map((f) => `"${f.word}"`).join(", ")}`
    );
  }
  console.log(`Pauses detected: ${pauses.length}`);
  if (pauses.length > 0) {
    console.log(
      `  Durations: ${pauses.map((p) => `${p.durationMs}ms`).join(", ")}`
    );
  }
  console.log(`\nSegments to remove: ${cutsData.segmentsToRemove.length}`);
  console.log(`Total cut duration: ${(cutsData.totalCutDurationMs / 1000).toFixed(2)}s`);

  console.log("\n>>> REVIEW: Edit data/02_filler_analysis.json and data/03_cuts.json");
  console.log(">>> Then run: npm run continue");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
