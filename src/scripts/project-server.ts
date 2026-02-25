import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { config } from "../config.js";

const PORT = 3334;

interface ProjectInfo {
  name: string;
  date: string;
  size: string;
  isCurrent: boolean;
}

// Get the project root directory
const projectRoot = path.resolve(config.inputDir, "..");
const archiveDir = path.join(projectRoot, "archive");
const projectFile = path.join(projectRoot, ".project");
const publicDir = path.join(projectRoot, "public");

// Track current video timestamp for cache busting
let currentVideoTimestamp = Date.now();

// Copy cut video to public folder for Remotion
function copyVideoToPublic(): string | null {
  const timingPath = path.join(config.dataDir, "05_caption_timing.json");
  if (!fs.existsSync(timingPath)) return null;

  try {
    const timingData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));
    const videoName = path.basename(timingData.inputFile, path.extname(timingData.inputFile));
    const cutVideoPath = path.join(config.tempDir, `${videoName}_cut.mp4`);

    if (fs.existsSync(cutVideoPath)) {
      fs.mkdirSync(publicDir, { recursive: true });

      // Clear old video files
      const publicFiles = fs.readdirSync(publicDir);
      for (const file of publicFiles) {
        if (file.startsWith("video-") && file.endsWith(".mp4")) {
          fs.unlinkSync(path.join(publicDir, file));
        }
      }

      // Use timestamp in filename for cache busting
      currentVideoTimestamp = Date.now();
      const publicVideoName = `video-${currentVideoTimestamp}.mp4`;
      const publicVideoPath = path.join(publicDir, publicVideoName);
      fs.copyFileSync(cutVideoPath, publicVideoPath);
      console.log(`Copied video to ${publicVideoPath}`);
      return publicVideoName;
    }
  } catch (e) {
    console.error("Error copying video:", e);
  }
  return null;
}

// Get current video filename
function getCurrentVideoFilename(): string {
  return `video-${currentVideoTimestamp}.mp4`;
}

// Ensure archive directory exists
function ensureArchiveDir() {
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
}

// Get current project name from .project file
function getCurrentProjectName(): string | null {
  if (fs.existsSync(projectFile)) {
    return fs.readFileSync(projectFile, "utf-8").trim();
  }
  return null;
}

// Set current project name
function setCurrentProjectName(name: string | null) {
  if (name) {
    fs.writeFileSync(projectFile, name);
  } else if (fs.existsSync(projectFile)) {
    fs.unlinkSync(projectFile);
  }
}

// Calculate directory size recursively
function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;

  let totalSize = 0;
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      totalSize += getDirSize(filePath);
    } else {
      totalSize += stat.size;
    }
  }

  return totalSize;
}

// Format bytes to human readable
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Get date from directory stats or name
function getProjectDate(projectPath: string, projectName: string): string {
  // Try to parse date from project name (YYYYMMDD format)
  const match = projectName.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(`${year}-${month}-${day}`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Fall back to directory modification time
  const stat = fs.statSync(projectPath);
  return stat.mtime.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Check if current working directories have content
function hasCurrentProject(): boolean {
  const hasInput = fs.existsSync(config.inputDir) && fs.readdirSync(config.inputDir).length > 0;
  const hasData = fs.existsSync(config.dataDir) && fs.readdirSync(config.dataDir).length > 0;
  return hasInput || hasData;
}

// List all projects (archived + current)
function listProjects(): ProjectInfo[] {
  ensureArchiveDir();
  const projects: ProjectInfo[] = [];
  const currentProjectName = getCurrentProjectName();

  // Check archived projects
  const archiveContents = fs.readdirSync(archiveDir);
  for (const name of archiveContents) {
    const projectPath = path.join(archiveDir, name);
    const stat = fs.statSync(projectPath);

    if (stat.isDirectory()) {
      const size = getDirSize(projectPath);
      projects.push({
        name,
        date: getProjectDate(projectPath, name),
        size: formatSize(size),
        isCurrent: false,
      });
    }
  }

  // Add current project if it exists
  if (currentProjectName && hasCurrentProject()) {
    const currentSize = getDirSize(config.inputDir) +
                        getDirSize(config.dataDir) +
                        getDirSize(config.outputDir);
    projects.push({
      name: currentProjectName,
      date: getProjectDate(projectRoot, currentProjectName),
      size: formatSize(currentSize),
      isCurrent: true,
    });
  }

  // Sort by name descending (newest first assuming YYYYMMDD naming)
  projects.sort((a, b) => b.name.localeCompare(a.name));

  return projects;
}

// Generate unique project name (appends suffix if needed)
function getUniqueProjectName(baseName: string): string {
  let name = baseName;
  let suffix = 1;

  while (fs.existsSync(path.join(archiveDir, name))) {
    suffix++;
    name = `${baseName}-${suffix}`;
  }

  return name;
}

// Create a new project (archives current if exists)
function createProject(name: string): { success: boolean; error?: string; name?: string } {
  ensureArchiveDir();

  // Validate name
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return { success: false, error: "Invalid project name" };
  }

  // Archive current project if it exists
  const currentProjectName = getCurrentProjectName();
  if (currentProjectName && hasCurrentProject()) {
    const archiveResult = archiveProject(currentProjectName);
    if (!archiveResult.success) {
      return archiveResult;
    }
  }

  // Get unique name if this one already exists in archive
  const uniqueName = getUniqueProjectName(name);

  // Create empty directories for new project
  fs.mkdirSync(config.inputDir, { recursive: true });
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.tempDir, { recursive: true });

  // Set new project as current
  setCurrentProjectName(uniqueName);

  console.log(`Created new project: ${uniqueName}`);
  return { success: true, name: uniqueName };
}

// Archive current project
function archiveProject(name: string): { success: boolean; error?: string } {
  ensureArchiveDir();

  if (!hasCurrentProject()) {
    return { success: false, error: "No current project to archive" };
  }

  const archivePath = path.join(archiveDir, name);

  // Create archive directory
  fs.mkdirSync(archivePath, { recursive: true });

  // Copy directories to archive
  const dirsToArchive = [
    { src: config.inputDir, dest: path.join(archivePath, "input") },
    { src: config.dataDir, dest: path.join(archivePath, "data") },
    { src: config.outputDir, dest: path.join(archivePath, "output") },
    { src: config.tempDir, dest: path.join(archivePath, "temp") },
  ];

  for (const { src, dest } of dirsToArchive) {
    if (fs.existsSync(src) && fs.readdirSync(src).length > 0) {
      copyDirSync(src, dest);
    }
  }

  // Clear working directories
  clearDir(config.inputDir);
  clearDir(config.dataDir);
  clearDir(config.outputDir);
  clearDir(config.tempDir);

  // Clear project file
  setCurrentProjectName(null);

  console.log(`Archived project: ${name}`);
  return { success: true };
}

// Load a project from archive
function loadProject(name: string): { success: boolean; error?: string } {
  ensureArchiveDir();

  const archivePath = path.join(archiveDir, name);

  if (!fs.existsSync(archivePath)) {
    return { success: false, error: `Project "${name}" not found in archive` };
  }

  // Archive current project first if it exists and is different
  const currentProjectName = getCurrentProjectName();
  if (currentProjectName && currentProjectName !== name && hasCurrentProject()) {
    const archiveResult = archiveProject(currentProjectName);
    if (!archiveResult.success) {
      return archiveResult;
    }
  }

  // Clear working directories
  clearDir(config.inputDir);
  clearDir(config.dataDir);
  clearDir(config.outputDir);
  clearDir(config.tempDir);

  // Copy from archive to working directories
  const dirsToRestore = [
    { src: path.join(archivePath, "input"), dest: config.inputDir },
    { src: path.join(archivePath, "data"), dest: config.dataDir },
    { src: path.join(archivePath, "output"), dest: config.outputDir },
    { src: path.join(archivePath, "temp"), dest: config.tempDir },
  ];

  for (const { src, dest } of dirsToRestore) {
    if (fs.existsSync(src)) {
      copyDirSync(src, dest);
    } else {
      fs.mkdirSync(dest, { recursive: true });
    }
  }

  // Remove from archive
  fs.rmSync(archivePath, { recursive: true, force: true });

  // Set as current project
  setCurrentProjectName(name);

  // Copy video to public folder for Remotion
  copyVideoToPublic();

  console.log(`Loaded project: ${name}`);
  return { success: true };
}

// Helper: Copy directory recursively
function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper: Clear directory contents
function clearDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
    }
  }
}

// Parse URL to extract path and params
function parseUrl(url: string): { path: string; segments: string[] } {
  const [pathPart] = url.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  return { path: pathPart, segments };
}

// Pipeline steps configuration
const PIPELINE_STEPS = [
  { script: "src/scripts/01-transcribe.ts", name: "Transcribing audio" },
  { script: "src/scripts/02-analyze-fillers.ts", name: "Analyzing fillers" },
  { script: "src/scripts/03-detect-emphasis.ts", name: "Detecting emphasis" },
  { script: "src/scripts/04-generate-timing.ts", name: "Generating timing" },
  { script: "src/scripts/05-cut-video.ts", name: "Cutting video" },
];

// Run a single pipeline step
function runPipelineStep(script: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", script], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `Exit code ${code}` });
      }
    });

    child.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

// Active SSE connections for pipeline progress
const pipelineClients: Set<http.ServerResponse> = new Set();

// Broadcast pipeline progress to all connected clients
function broadcastPipelineProgress(data: {
  step: number;
  totalSteps: number;
  stepName: string;
  status: "running" | "complete" | "error";
  error?: string;
}) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of pipelineClients) {
    client.write(message);
  }
}

// Run the full pipeline
async function runPipeline(): Promise<{ success: boolean; error?: string }> {
  const totalSteps = PIPELINE_STEPS.length;

  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const step = PIPELINE_STEPS[i];
    console.log(`Running pipeline step ${i + 1}/${totalSteps}: ${step.name}`);

    broadcastPipelineProgress({
      step: i + 1,
      totalSteps,
      stepName: step.name,
      status: "running",
    });

    const result = await runPipelineStep(step.script);

    if (!result.success) {
      broadcastPipelineProgress({
        step: i + 1,
        totalSteps,
        stepName: step.name,
        status: "error",
        error: result.error,
      });
      return { success: false, error: `${step.name} failed: ${result.error}` };
    }
  }

  // Copy video to public folder after pipeline completes
  copyVideoToPublic();

  broadcastPipelineProgress({
    step: totalSteps,
    totalSteps,
    stepName: "Complete",
    status: "complete",
  });

  return { success: true };
}

export function startProjectServer() {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const { path: urlPath, segments } = parseUrl(req.url || "/");

    // GET /projects - List all projects
    if (req.method === "GET" && urlPath === "/projects") {
      const projects = listProjects();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ projects }));
      return;
    }

    // POST /projects - Create new project
    if (req.method === "POST" && urlPath === "/projects") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const { name } = JSON.parse(body);
          const result = createProject(name);

          if (result.success) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: result.error }));
          }
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: String(error) }));
        }
      });
      return;
    }

    // POST /projects/:name/load - Load project from archive
    if (req.method === "POST" && segments[0] === "projects" && segments[2] === "load") {
      const projectName = decodeURIComponent(segments[1]);
      const result = loadProject(projectName);

      if (result.success) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: result.error }));
      }
      return;
    }

    // POST /projects/:name/archive - Archive current project
    if (req.method === "POST" && segments[0] === "projects" && segments[2] === "archive") {
      const projectName = decodeURIComponent(segments[1]);
      const result = archiveProject(projectName);

      if (result.success) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: result.error }));
      }
      return;
    }

    // POST /import - Import video file and run pipeline
    if (req.method === "POST" && urlPath === "/import") {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on("end", async () => {
        try {
          const body = Buffer.concat(chunks);

          // Parse multipart form data manually (simple approach)
          const contentType = req.headers["content-type"] || "";
          const boundaryMatch = contentType.match(/boundary=(.+)$/);

          if (!boundaryMatch) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Invalid content type" }));
            return;
          }

          const boundary = boundaryMatch[1];
          const bodyStr = body.toString("latin1");

          // Find file content between boundaries
          const parts = bodyStr.split(`--${boundary}`);
          let fileName = "";
          let fileContent: Buffer | null = null;

          for (const part of parts) {
            if (part.includes("filename=")) {
              // Extract filename
              const filenameMatch = part.match(/filename="([^"]+)"/);
              if (filenameMatch) {
                fileName = filenameMatch[1];
              }

              // Find the content (after double newline)
              const contentStart = part.indexOf("\r\n\r\n");
              if (contentStart !== -1) {
                const contentStr = part.slice(contentStart + 4);
                // Remove trailing boundary markers
                const contentEnd = contentStr.lastIndexOf("\r\n");
                const cleanContent = contentEnd !== -1 ? contentStr.slice(0, contentEnd) : contentStr;
                fileContent = Buffer.from(cleanContent, "latin1");
              }
            }
          }

          if (!fileName || !fileContent) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "No file found in request" }));
            return;
          }

          // Ensure input directory exists
          fs.mkdirSync(config.inputDir, { recursive: true });

          // Clear any existing files in input
          clearDir(config.inputDir);

          // Save the file
          const destPath = path.join(config.inputDir, fileName);
          fs.writeFileSync(destPath, fileContent);
          console.log(`Saved video: ${destPath} (${formatSize(fileContent.length)})`);

          // Start pipeline in background
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, fileName }));

          // Run pipeline after response
          runPipeline().then((result) => {
            if (!result.success) {
              console.error("Pipeline failed:", result.error);
            } else {
              console.log("Pipeline completed successfully");
            }
          });
        } catch (error) {
          console.error("Import error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: String(error) }));
        }
      });
      return;
    }

    // GET /pipeline/progress - SSE endpoint for pipeline progress
    if (req.method === "GET" && urlPath === "/pipeline/progress") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      pipelineClients.add(res);
      console.log(`Pipeline SSE client connected (${pipelineClients.size} total)`);

      req.on("close", () => {
        pipelineClients.delete(res);
        console.log(`Pipeline SSE client disconnected (${pipelineClients.size} total)`);
      });

      // Send initial ping
      res.write("data: {\"status\":\"connected\"}\n\n");
      return;
    }

    // GET /current - Get current project info (for frontend)
    if (req.method === "GET" && urlPath === "/current") {
      const currentName = getCurrentProjectName();

      if (currentName) {
        // Check if timing data exists
        const timingPath = path.join(config.dataDir, "05_caption_timing.json");
        const hasTimingData = fs.existsSync(timingPath);

        let captionData = null;
        if (hasTimingData) {
          captionData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));
        }

        // Ensure video is copied and get filename
        const videoFilename = copyVideoToPublic() || getCurrentVideoFilename();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          name: currentName,
          hasTimingData,
          captionData,
          videoFilename,
        }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ name: null }));
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, () => {
    console.log(`Project server running on http://localhost:${PORT}`);
  });

  return server;
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  startProjectServer();
}
