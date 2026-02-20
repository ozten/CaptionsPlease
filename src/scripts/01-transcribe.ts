import "dotenv/config";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { WhisperTranscription } from "../types.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function findInputVideo(): Promise<string> {
  const files = fs.readdirSync(config.inputDir);
  const videoFiles = files.filter((f) =>
    [".mp4", ".mov", ".webm", ".mkv"].includes(path.extname(f).toLowerCase())
  );

  if (videoFiles.length === 0) {
    throw new Error(`No video files found in ${config.inputDir}`);
  }

  // Use the first video file found
  const inputFile = videoFiles[0];
  console.log(`Found input video: ${inputFile}`);
  return path.join(config.inputDir, inputFile);
}

async function extractAudio(videoPath: string): Promise<string> {
  const { execSync } = await import("child_process");
  const audioPath = path.join(
    config.tempDir,
    `${path.basename(videoPath, path.extname(videoPath))}.wav`
  );

  console.log("Extracting audio from video...");

  // Extract audio using ffmpeg
  execSync(
    `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
    { stdio: "inherit" }
  );

  console.log(`Audio extracted to: ${audioPath}`);
  return audioPath;
}

async function transcribeAudio(
  audioPath: string
): Promise<WhisperTranscription> {
  console.log("Transcribing audio with Whisper...");

  const audioFile = fs.createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });

  console.log(`Transcription complete. Found ${response.words?.length || 0} words.`);

  return response as unknown as WhisperTranscription;
}

async function main() {
  console.log("=== Step 1: Transcribe Video ===\n");

  // Ensure directories exist
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.tempDir, { recursive: true });

  // Find input video
  const videoPath = await findInputVideo();
  const videoName = path.basename(videoPath, path.extname(videoPath));

  // Extract audio
  const audioPath = await extractAudio(videoPath);

  // Transcribe
  const transcription = await transcribeAudio(audioPath);

  // Save transcription data
  const outputPath = path.join(config.dataDir, "01_transcription.json");
  const outputData = {
    inputFile: videoPath,
    videoName,
    ...transcription,
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\nTranscription saved to: ${outputPath}`);

  // Print summary
  console.log("\n--- Summary ---");
  console.log(`Duration: ${transcription.duration?.toFixed(2)}s`);
  console.log(`Words: ${transcription.words?.length || 0}`);
  console.log(`Segments: ${transcription.segments?.length || 0}`);
  console.log(`\nFull text:\n${transcription.text}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
