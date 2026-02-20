import fs from "fs";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { config } from "../config.js";
import { CaptionTimingData } from "../types.js";

async function main() {
  console.log("=== Step 6: Render Video ===\n");

  // Read timing data
  const timingPath = path.join(config.dataDir, "05_caption_timing.json");
  const timingData: CaptionTimingData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));

  // Get video name
  const videoName = path.basename(timingData.inputFile, path.extname(timingData.inputFile));
  const cutVideoPath = path.join(config.tempDir, `${videoName}_cut.mp4`);
  const outputPath = path.join(config.outputDir, `${videoName}_captioned.mp4`);

  const projectRoot = path.resolve(config.inputDir, "..");

  // Ensure directories exist
  fs.mkdirSync(config.outputDir, { recursive: true });
  const publicDir = path.join(projectRoot, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  // Verify cut video exists
  if (!fs.existsSync(cutVideoPath)) {
    throw new Error(`Cut video not found at ${cutVideoPath}. Run 05-cut-video.ts first.`);
  }

  // Copy video to public folder for Remotion to access
  const publicVideoPath = path.join(publicDir, "video.mp4");
  console.log(`Copying video to public folder...`);
  fs.copyFileSync(cutVideoPath, publicVideoPath);

  console.log(`Input video: ${cutVideoPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Duration: ${(timingData.durationMs / 1000).toFixed(2)}s`);
  console.log(`Frames: ${timingData.totalFrames}`);

  // Bundle the Remotion project
  console.log("\nBundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint: path.join(projectRoot, "src", "remotion", "index.ts"),
    webpackOverride: (webpackConfig) => webpackConfig,
    publicDir,
  });

  console.log("Bundle created at:", bundleLocation);

  // Get emphasis indices from timing data
  const emphasisIndices = timingData.allWords
    .filter((w) => w.isEmphasis)
    .map((w) => w.originalIndex);

  // Use new props structure
  const inputProps = {
    videoSrc: "video.mp4",
    position: timingData.position || { x: 50, y: 80 },
    emphasisIndices: emphasisIndices,
    showControls: false,
    captionDataJson: JSON.stringify(timingData),
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "CaptionedVideo",
    inputProps,
  });

  console.log(`\nRendering composition: ${composition.id}`);
  console.log(`Resolution: ${composition.width}x${composition.height}`);
  console.log(`FPS: ${composition.fps}`);
  console.log(`Duration: ${composition.durationInFrames} frames`);

  // Render
  console.log("\nRendering video...");
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      process.stdout.write(`\rProgress: ${(progress * 100).toFixed(1)}%`);
    },
  });

  console.log(`\n\nRendering complete!`);
  console.log(`Output: ${outputPath}`);

  // Clean up public video copy
  fs.unlinkSync(publicVideoPath);

  // Verify output
  const stats = fs.statSync(outputPath);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
