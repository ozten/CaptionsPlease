import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { config } from "../config.js";
import { CaptionTimingData } from "../types.js";
import { startSaveServer } from "./save-server.js";

async function main() {
  console.log("=== Preview with Remotion Studio ===\n");

  const projectRoot = path.resolve(config.inputDir, "..");
  const publicDir = path.join(projectRoot, "public");

  // Check if timing data exists
  const timingPath = path.join(config.dataDir, "05_caption_timing.json");

  if (!fs.existsSync(timingPath)) {
    console.log("No caption timing data found. Starting with empty preview.");
    console.log("Run the pipeline first to generate data.\n");
    const child = spawn("npx", ["remotion", "studio", "src/remotion/index.ts"], {
      stdio: "inherit",
      cwd: projectRoot,
    });
    child.on("exit", () => process.exit(0));
    return;
  }

  // Read timing data
  const timingData: CaptionTimingData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));

  // Get video path
  const videoName = path.basename(timingData.inputFile, path.extname(timingData.inputFile));
  const cutVideoPath = path.join(config.tempDir, `${videoName}_cut.mp4`);

  if (!fs.existsSync(cutVideoPath)) {
    console.log(`Cut video not found at ${cutVideoPath}`);
    console.log("Run 'npm run cut-video' first.\n");
    process.exit(1);
  }

  // Ensure public directory exists and copy video
  fs.mkdirSync(publicDir, { recursive: true });
  const publicVideoPath = path.join(publicDir, "video.mp4");
  console.log(`Copying video to public folder...`);
  fs.copyFileSync(cutVideoPath, publicVideoPath);

  console.log(`Video: ${cutVideoPath}`);
  console.log(`Duration: ${(timingData.durationMs / 1000).toFixed(2)}s`);
  console.log(`Frames: ${timingData.totalFrames}`);
  console.log(`Pages: ${timingData.pages.length}`);

  // Get current emphasis indices
  const emphasisIndices = timingData.allWords
    .filter((w) => w.isEmphasis)
    .map((w) => w.originalIndex);

  console.log(`Emphasis words: ${emphasisIndices.length}`);
  console.log();

  // Start save server for persisting changes
  const saveServer = startSaveServer();

  // Create props
  const props = {
    videoSrc: "video.mp4",
    position: timingData.position || { x: 50, y: 80 },
    emphasisIndices: emphasisIndices,
    showControls: true,
    captionDataJson: JSON.stringify(timingData),
  };

  // Write props to temp file
  const propsPath = path.join(config.tempDir, "preview-props.json");
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

  console.log("Starting Remotion Studio...");
  console.log("Use the control panel to set keyframes, then click SAVE.");
  console.log("After saving, run: npm run render\n");

  // Spawn Remotion Studio
  const child = spawn(
    "npx",
    ["remotion", "studio", "src/remotion/index.ts", `--props=${propsPath}`],
    {
      stdio: "inherit",
      cwd: projectRoot,
    }
  );

  // Cleanup on exit
  const cleanup = () => {
    saveServer.close();
    if (fs.existsSync(publicVideoPath)) {
      fs.unlinkSync(publicVideoPath);
    }
  };

  child.on("exit", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    cleanup();
    child.kill();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
