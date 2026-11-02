# VeriPixel-AI

A local web app that accepts an image, inspects its file properties and embedded EXIF fields, and can optionally ask a vision model to describe the content and assess visible clues associated with AI-generated imagery.

**Origin assessments are probabilistic, not forensic proof.** Image edits, recompression, missing metadata, and model limitations can all affect the result. The app intentionally supports an inconclusive answer and separates observable signals from caveats.

## Requirements

- Python 3.10 or newer
- An OpenAI API key for the tentative visual-origin assessment.
- An optional Anthropic API key for a second image-description review. Claude is not used as an AI-image detector.

## Run locally

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Add your provider key or keys to `.env` to enable vision analysis. OpenAI is used for a tentative origin assessment; Claude, if configured, contributes a separate image description. Then start the app:

```powershell
uvicorn app.main:app --reload
```

After editing `.env`, restart the backend and confirm `/api/health` lists the provider names. Do not paste API keys into source files, chat, or browser JavaScript; keep them only in the ignored `.env` file.

Open `http://127.0.0.1:8000` in a browser. API health is available at `/api/health`; interactive API docs are at `/docs`.

## Analysis stages

1. Validate the decoded image format, file size, and pixel dimensions.
2. Read image dimensions and selected embedded EXIF fields.
3. Send the resized image concurrently to configured providers. OpenAI assesses likely origin tentatively; Claude provides visual description only.
4. Return per-provider status, evidence, file details, and limitations as structured JSON. Provider disagreement produces an inconclusive overall assessment.

## Configuration

`OPENAI_API_KEY` enables the origin-assessment provider. `OPENAI_VISION_MODEL` defaults to `gpt-4o-mini`. `ANTHROPIC_API_KEY` optionally enables Claude description review; `ANTHROPIC_VISION_MODEL` defaults to `claude-haiku-4-5`. Keep secrets in `.env`; the file is excluded from Git. Images are processed in memory and are not written to disk by this application.

## Notes

- Upload limit: 12 MB; decoded image limit: 40 megapixels.
- The model may misread details or origin clues. Do not use the output as sole evidence for moderation, legal, employment, or other consequential decisions.
- No API provides reliable access to every public AI website or a perfect AI-image detector. Claude's vision documentation specifically cautions that Claude may be inaccurate at determining AI-generated origin; it is used here for descriptions only. Signed provenance metadata and specialized forensic detectors should be treated as separate evidence sources.
- For stronger provenance evidence, integrate standards-based signed credentials (such as C2PA) and specialized detectors, and report their source/version separately from generative model interpretation.
