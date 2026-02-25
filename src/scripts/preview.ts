import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { config } from "../config.js";
import { startSaveServer } from "./save-server.js";
import { startProjectServer } from "./project-server.js";

async function main() {
  console.log("=== Preview with Remotion Studio ===\n");

  const projectRoot = path.resolve(config.inputDir, "..");
  const publicDir = path.join(projectRoot, "public");

  // Ensure public directory exists
  fs.mkdirSync(publicDir, { recursive: true });

  // Check if timing data exists
  const timingPath = path.join(config.dataDir, "05_caption_timing.json");

  if (fs.existsSync(timingPath)) {
    try {
      const timingData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));
      console.log(`Current project has timing data`);
      console.log(`Duration: ${(timingData.durationMs / 1000).toFixed(2)}s`);
      console.log(`Frames: ${timingData.totalFrames}`);
      console.log(`Pages: ${timingData.pages.length}`);
      const emphasisCount = timingData.allWords.filter((w: any) => w.isEmphasis).length;
      console.log(`Emphasis words: ${emphasisCount}`);
      console.log();
    } catch (e) {
      console.log("Could not load timing data:", e);
    }
  } else {
    console.log("No project data found. Project selector will display.\n");
  }

  // Start both servers
  const saveServer = startSaveServer();
  const projectServer = startProjectServer();

  // Create minimal props for Remotion Studio
  // The ProjectSelector will handle loading actual data
  const props = {
    videoSrc: "video.mp4",
    position: { x: 50, y: 80 },
    emphasisIndices: [],
    showControls: true,
    captionDataJson: "", // Let the UI load this
  };

  // Write props to temp file
  fs.mkdirSync(config.tempDir, { recursive: true });
  const timestamp = Date.now();
  const propsPath = path.join(config.tempDir, `preview-props-${timestamp}.json`);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

  // Clean up old props files
  const tempFiles = fs.readdirSync(config.tempDir);
  for (const file of tempFiles) {
    if (file.startsWith("preview-props-") && file !== `preview-props-${timestamp}.json`) {
      fs.unlinkSync(path.join(config.tempDir, file));
    }
  }

  console.log("Starting Remotion Studio...");
  console.log("Select or create a project in the Project Selector.\n");

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
    projectServer.close();
    // Clean up any video files in public
    if (fs.existsSync(publicDir)) {
      const publicFiles = fs.readdirSync(publicDir);
      for (const file of publicFiles) {
        if (file.startsWith("video") && file.endsWith(".mp4")) {
          fs.unlinkSync(path.join(publicDir, file));
        }
      }
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
