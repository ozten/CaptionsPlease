import http from "http";
import fs from "fs";
import path from "path";
import { config } from "../config.js";

const PORT = 3333;

export function startSaveServer() {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/save") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const updates = JSON.parse(body);
          const timingPath = path.join(config.dataDir, "05_caption_timing.json");

          // Read current data
          const currentData = JSON.parse(fs.readFileSync(timingPath, "utf-8"));

          // Apply updates
          if (updates.positionKeyframes !== undefined) {
            currentData.positionKeyframes = updates.positionKeyframes;
          }
          if (updates.position !== undefined) {
            currentData.position = updates.position;
          }

          // Save back
          fs.writeFileSync(timingPath, JSON.stringify(currentData, null, 2));

          console.log("Saved updates to 05_caption_timing.json");
          console.log(`  Keyframes: ${currentData.positionKeyframes?.length || 0}`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error("Save error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(PORT, () => {
    console.log(`Save server running on http://localhost:${PORT}`);
  });

  return server;
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  startSaveServer();
}
