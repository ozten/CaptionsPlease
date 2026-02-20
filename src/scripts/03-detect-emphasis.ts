import "dotenv/config";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { config, GPT_SETTINGS } from "../config.js";
import { EmphasisData, EmphasisWord, CutsData, WhisperWord } from "../types.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getWordsAfterCuts(
  words: WhisperWord[],
  cutsData: CutsData
): { word: string; index: number }[] {
  const remainingWords: { word: string; index: number }[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordStartMs = Math.round(word.start * 1000);
    const wordEndMs = Math.round(word.end * 1000);

    // Check if this word overlaps with any cut segment
    let isCut = false;
    for (const segment of cutsData.segmentsToRemove) {
      // Word overlaps with cut segment
      if (wordStartMs < segment.endMs && wordEndMs > segment.startMs) {
        isCut = true;
        break;
      }
    }

    if (!isCut) {
      remainingWords.push({
        word: word.word,
        index: i,
      });
    }
  }

  return remainingWords;
}

async function detectEmphasis(
  words: { word: string; index: number }[]
): Promise<EmphasisWord[]> {
  const wordList = words.map((w) => w.word).join(" ");
  const targetMin = Math.floor(words.length * (GPT_SETTINGS.emphasisMinPercent / 100));
  const targetMax = Math.ceil(words.length * (GPT_SETTINGS.emphasisMaxPercent / 100));

  const prompt = `Analyze this transcript and identify the most important/impactful words that should be visually emphasized in TikTok-style captions.

Rules:
- Select ${targetMin}-${targetMax} words (${GPT_SETTINGS.emphasisMinPercent}-${GPT_SETTINGS.emphasisMaxPercent}% of total)
- Choose words that are:
  - Key nouns (main subjects, important concepts)
  - Strong verbs (action words)
  - Numbers or statistics
  - Emotionally impactful words
  - Words the speaker would naturally stress
- Do NOT emphasize:
  - Common words (the, a, is, are, etc.)
  - Conjunctions (and, but, or)
  - Prepositions (in, on, at)
  - Pronouns (I, you, we, they) unless crucial for emphasis

Transcript:
"${wordList}"

Respond with a JSON object containing a "words" array. Each item should have:
- "word": the exact word from the transcript
- "position": the 1-based position in the word list
- "reason": brief explanation (2-5 words)

Example response format:
{
  "words": [
    {"word": "amazing", "position": 5, "reason": "emotional impact"},
    {"word": "million", "position": 12, "reason": "key statistic"}
  ]
}`;

  console.log("Calling GPT-4o for emphasis detection...");

  const response = await openai.chat.completions.create({
    model: GPT_SETTINGS.model,
    messages: [
      {
        role: "system",
        content: "You are an expert at identifying impactful words for video captions. Always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  console.log("GPT response:", content.substring(0, 500));

  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("Failed to parse GPT response:", content);
    return [];
  }

  // Handle various response formats GPT might return
  let emphasisList: Array<{ word: string; position: number; reason: string }> = [];
  if (Array.isArray(parsed)) {
    emphasisList = parsed;
  } else if (parsed.words && Array.isArray(parsed.words)) {
    emphasisList = parsed.words;
  } else if (parsed.emphasis_words && Array.isArray(parsed.emphasis_words)) {
    emphasisList = parsed.emphasis_words;
  } else if (parsed.emphasisWords && Array.isArray(parsed.emphasisWords)) {
    emphasisList = parsed.emphasisWords;
  } else {
    // Try to find any array in the response
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) {
        emphasisList = parsed[key] as Array<{ word: string; position: number; reason: string }>;
        console.log(`Found emphasis words under key: "${key}"`);
        break;
      }
    }
  }

  console.log(`Found ${emphasisList.length} emphasis words from GPT`);

  // Common words that should NOT be emphasized (filter out GPT mistakes)
  const skipWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "and", "or", "but", "if", "then", "else", "when", "where", "why",
    "how", "what", "which", "who", "whom", "whose", "that", "this",
    "these", "those", "it", "its", "i", "i'm", "you", "your", "he",
    "she", "we", "they", "me", "him", "her", "us", "them", "my", "our",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "up",
    "down", "out", "off", "over", "under", "again", "further", "once",
    "here", "there", "all", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "just", "gonna", "gotta", "wanna",
  ]);

  // Match by word text instead of position (GPT often miscounts)
  const emphasisWords: EmphasisWord[] = [];
  const usedIndices = new Set<number>();

  for (const item of emphasisList) {
    const targetWord = item.word.toLowerCase().replace(/[.,!?]/g, "");

    // Skip common words
    if (skipWords.has(targetWord)) {
      continue;
    }

    // Find the first matching word that hasn't been used
    for (const w of words) {
      const wordText = w.word.toLowerCase().replace(/[.,!?]/g, "");
      if (wordText === targetWord && !usedIndices.has(w.index)) {
        usedIndices.add(w.index);
        emphasisWords.push({
          word: w.word,
          index: w.index,
          reason: item.reason,
        });
        break;
      }
    }
  }

  console.log(`After filtering: ${emphasisWords.length} emphasis words`);
  return emphasisWords;
}

async function main() {
  console.log("=== Step 3: Detect Emphasis ===\n");

  // Read transcription
  const transcriptionPath = path.join(config.dataDir, "01_transcription.json");
  if (!fs.existsSync(transcriptionPath)) {
    throw new Error(`Transcription not found. Run pipeline first.`);
  }
  const transcriptionData = JSON.parse(fs.readFileSync(transcriptionPath, "utf-8"));

  // Read cuts data
  const cutsPath = path.join(config.dataDir, "03_cuts.json");
  if (!fs.existsSync(cutsPath)) {
    throw new Error(`Cuts data not found. Run 02-analyze-fillers.ts first.`);
  }
  const cutsData: CutsData = JSON.parse(fs.readFileSync(cutsPath, "utf-8"));

  // Get words after applying cuts
  const remainingWords = getWordsAfterCuts(transcriptionData.words || [], cutsData);
  console.log(`Words remaining after cuts: ${remainingWords.length}`);

  // Detect emphasis words
  const emphasisWords = await detectEmphasis(remainingWords);

  // Save emphasis data
  const emphasisData: EmphasisData = {
    inputFile: transcriptionData.inputFile,
    emphasisWords,
    totalWords: remainingWords.length,
    emphasisPercentage: (emphasisWords.length / remainingWords.length) * 100,
  };

  const outputPath = path.join(config.dataDir, "04_emphasis.json");
  fs.writeFileSync(outputPath, JSON.stringify(emphasisData, null, 2));
  console.log(`\nEmphasis data saved to: ${outputPath}`);

  // Print summary
  console.log("\n--- Summary ---");
  console.log(`Total words: ${remainingWords.length}`);
  console.log(`Emphasis words: ${emphasisWords.length} (${emphasisData.emphasisPercentage.toFixed(1)}%)`);
  console.log("\nEmphasis words:");
  for (const word of emphasisWords) {
    console.log(`  "${word.word}" - ${word.reason}`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
