import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { config } from "../config.js";
import { CutsData, CaptionTimingData } from "../types.js";

function buildFFmpegFilter(
  cuts: CutsData,
  durationMs: number
): { filter: string; segmentCount: number } {
  if (cuts.segmentsToRemove.length === 0) {
    // No cuts needed, just copy
    return { filter: "", segmentCount: 0 };
  }

  // Build segments to KEEP
  const segmentsToKeep: { start: number; end: number }[] = [];
  let currentPos = 0;

  for (const cut of cuts.segmentsToRemove) {
    if (cut.startMs > currentPos) {
      segmentsToKeep.push({
        start: currentPos / 1000,
        end: cut.startMs / 1000,
      });
    }
    currentPos = cut.endMs;
  }

  // Add final segment
  if (currentPos < durationMs) {
    segmentsToKeep.push({
      start: currentPos / 1000,
      end: durationMs / 1000,
    });
  }

  if (segmentsToKeep.length === 0) {
    throw new Error("No segments to keep after cuts!");
  }

  // Build FFmpeg filter_complex
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < segmentsToKeep.length; i++) {
    const seg = segmentsToKeep[i];
    // Trim video and audio
    filterParts.push(
      `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`
    );
    filterParts.push(
      `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
    );
    concatInputs.push(`[v${i}][a${i}]`);
  }

  // Concatenate all segments
  filterParts.push(
    `${concatInputs.join("")}concat=n=${segmentsToKeep.length}:v=1:a=1[outv][outa]`
  );

  return {
    filter: filterParts.join(";"),
    segmentCount: segmentsToKeep.length,
  };
}

async function main() {
  console.log("=== Step 5: Cut Video ===\n");

  // Read cuts data
  const cutsPath = path.join(config.dataDir, "03_cuts.json");
  const cutsData: CutsData = JSON.parse(fs.readFileSync(cutsPath, "utf-8"));

  // Read timing data for duration
  const timingPath = path.join(config.dataDir, "05_caption_timing.json");
  const timingData: CaptionTimingData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));

  // Read original duration from transcription
  const transcriptionPath = path.join(config.dataDir, "01_transcription.json");
  const transcriptionData = JSON.parse(fs.readFileSync(transcriptionPath, "utf-8"));
  const originalDurationMs = Math.round((transcriptionData.duration || 0) * 1000);

  const inputPath = cutsData.inputFile;
  const videoName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(config.tempDir, `${videoName}_cut.mp4`);

  console.log(`Input: ${inputPath}`);
  console.log(`Segments to remove: ${cutsData.segmentsToRemove.length}`);
  console.log(`Total cut duration: ${(cutsData.totalCutDurationMs / 1000).toFixed(2)}s`);

  if (cutsData.segmentsToRemove.length === 0) {
    // No cuts needed, just copy the file
    console.log("\nNo cuts needed, copying original file...");
    fs.copyFileSync(inputPath, outputPath);
  } else {
    // Build and execute FFmpeg command
    const { filter, segmentCount } = buildFFmpegFilter(cutsData, originalDurationMs);
    console.log(`\nKeeping ${segmentCount} segments`);

    const ffmpegCmd = [
      "ffmpeg",
      "-y",
      `-i "${inputPath}"`,
      `-filter_complex "${filter}"`,
      `-map "[outv]"`,
      `-map "[outa]"`,
      "-c:v libx264",
      "-crf 18",
      "-preset medium",
      "-c:a aac",
      "-b:a 192k",
      `"${outputPath}"`,
    ].join(" ");

    console.log("\nRunning FFmpeg...");
    execSync(ffmpegCmd, { stdio: "inherit" });
  }

  console.log(`\nCut video saved to: ${outputPath}`);

  // Verify output
  const stats = fs.statSync(outputPath);
  console.log(`Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
