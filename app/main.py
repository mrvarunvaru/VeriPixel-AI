from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.services.image_analysis import MAX_UPLOAD_BYTES, analyze_image, inspect_image

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="VeriPixel-AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict[str, str | list[str]]:
    providers = []
    if _has_api_key():
        providers.append("openai")
    if _has_anthropic_key():
        providers.append("anthropic")
    return {"status": "ok", "vision_model": "configured" if providers else "metadata-only", "providers": providers}


def _has_api_key() -> bool:
    from os import getenv

    return bool(getenv("OPENAI_API_KEY"))


def _has_anthropic_key() -> bool:
    from os import getenv

    return bool(getenv("ANTHROPIC_API_KEY"))


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)) -> dict:
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 12 MB upload limit.")

    try:
        image, metadata = inspect_image(content)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    try:
        report = await run_in_threadpool(analyze_image, image, metadata)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vision analysis failed: {exc}") from exc

    report["filename"] = Path(file.filename or "uploaded-image").name
    return report
