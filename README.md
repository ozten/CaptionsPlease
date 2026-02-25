# TikTok-Style Video Captioning

A Node.js/TypeScript pipeline for processing vertical videos (1080x1920) with:
- OpenAI Whisper transcription (word-level timestamps)
- Filler word and pause detection/removal
- GPT-4o emphasis word detection
- Remotion-powered TikTok-style animated captions (word-by-word pop-in, green highlights)

## Requirements

### System Dependencies

- **Node.js 18+** and npm
- **FFmpeg** - required for audio extraction and video cutting
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use `choco install ffmpeg`

### API Keys

- **OpenAI API key** with access to:
  - **Whisper API** - for audio transcription with word-level timestamps
  - **GPT-4o** - for emphasis word detection

### Automatic Dependencies

- **Chromium** - Remotion automatically downloads a compatible Chromium version on first render (no manual install needed)

## Installation

```bash
npm install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

## Usage

### Daily Workflow

For daily video processing (recommended):

1. **Clean up from previous session:**
   ```bash
   npm run clean
   ```
   This removes cached files from `temp/`, `data/`, and `public/video.mp4`.

2. **Archive your previous work (optional):**
   Move old videos from `input/` to `archive/` to keep things organized.

3. **Add your new video:**
   Place your `.mov` or `.mp4` file in the `input/` folder.

4. **Run the pipeline:**
   ```bash
   npm run pipeline    # Transcribe + analyze fillers
   # Review data/*.json files if needed
   npm run continue    # Emphasis detection + cut + render
   ```

5. **Find your output:**
   Your captioned video will be in `output/`.

### Quick Start (First Time)

1. Place a video in the `input/` folder (e.g., `input/test.mp4`)

2. Run the first stage (transcription + filler analysis):
   ```bash
   npm run pipeline
   ```

3. Review and edit the JSON files in `data/` to adjust cuts and emphasis words

4. Run the second stage (emphasis detection + video cutting + rendering):
   ```bash
   npm run continue
   ```

5. Find your captioned video in `output/` (e.g., `output/test_captioned.mp4`)

### Individual Scripts

Run each step separately for more control:

```bash
npm run clean             # Clear temp/, data/, and public/video.mp4
npm run transcribe        # Step 1: Whisper transcription
npm run analyze-fillers   # Step 2: Detect fillers and pauses
npm run detect-emphasis   # Step 3: GPT-4o emphasis detection
npm run generate-timing   # Step 4: Adjust timestamps for cuts
npm run cut-video         # Step 5: FFmpeg segment removal
npm run render            # Step 6: Remotion rendering
```

### Preview

Preview the Remotion composition before rendering:

```bash
npm run preview
```

## Project Structure

```
├── package.json              # Dependencies & npm scripts
├── tsconfig.json             # TypeScript config
├── remotion.config.ts        # Remotion config
├── .env                      # OPENAI_API_KEY (create from .env.example)
├── input/                    # Place input videos here
├── output/                   # Final captioned videos
├── data/                     # Editable JSON files (review step)
│   ├── 01_transcription.json
│   ├── 02_filler_analysis.json
│   ├── 03_cuts.json
│   ├── 04_emphasis.json
│   └── 05_caption_timing.json
├── temp/                     # Intermediate files
└── src/
    ├── types.ts              # TypeScript interfaces
    ├── config.ts             # Pipeline configuration
    ├── scripts/
    │   ├── 01-transcribe.ts      # Whisper API transcription
    │   ├── 02-analyze-fillers.ts # Detect fillers/pauses
    │   ├── 03-detect-emphasis.ts # GPT-4o emphasis detection
    │   ├── 04-generate-timing.ts # Adjust timestamps for cuts
    │   ├── 05-cut-video.ts       # FFmpeg segment removal
    │   └── 06-render.ts          # Remotion rendering
    └── remotion/
        ├── index.ts
        ├── Root.tsx              # Composition definition
        ├── Video.tsx             # Video + captions overlay
        ├── Captions.tsx          # Page-based caption display
        ├── Word.tsx              # Spring pop-in animation
        └── styles.ts             # TikTok-style fonts/colors
```

## Workflow Details

### Step 1: Transcription
Extracts audio from the video and sends it to OpenAI Whisper API with word-level timestamps.

### Step 2: Filler Analysis
Detects filler words (um, uh, etc.) and long pauses. Generates suggested cuts that you can review and edit in `data/03_cuts.json`.

### Step 3: Emphasis Detection
Uses GPT-4o to identify impactful words (15-25% of total) that should be highlighted in the captions.

### Step 4: Generate Timing
Adjusts word timestamps based on the cuts and paginates words into caption pages (4 words per page by default).

### Step 5: Cut Video
Uses FFmpeg to remove the marked segments (fillers and long pauses) from the video.

### Step 6: Render
Uses Remotion to render the final video with animated captions overlaid.

## Configuration

Edit `src/config.ts` to customize:

- **Filler word patterns**: Words detected as fillers
- **Pause thresholds**: When to detect/auto-remove pauses (default: detect at 500ms, auto-remove at 1000ms)
- **Caption styling**: Colors, fonts, positioning
- **Words per page**: Number of words shown at once (default: 4)

## Caption Styling

- Font: Montserrat 72px bold, uppercase
- Normal words: White (#FFFFFF)
- Emphasis words: TikTok green (#00FF88) with glow effect
- Animation: Spring pop-in effect per word
- Position: Bottom 20% of screen

## License

MIT
