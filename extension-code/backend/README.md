# Resume Intelligence Backend

Local-only backend that the extension calls to tailor resumes, render LaTeX, and compile PDFs.

## Quick start
1. `cd backend`
2. `npm install`
3. Ensure LaTeX is available locally (`pdflatex` or set `LATEX_ENGINE`).
4. Set keys: `export OPENAI_API_KEY=...` and `export ANTHROPIC_API_KEY=...`
5. Run: `npm start` (defaults to `http://localhost:3001`)

## Configuration
- `PORT`: HTTP port (default `3001`)
- `RUNS_ROOT`: Folder to write artifacts (default `backend/runs`)
- `RESUMES_DIR`: Folder containing master resume JSON (default `backend/resumes`)
- `OPENAI_MODEL`: Model for tailoring (default `gpt-4o-mini`)
- `ANTHROPIC_MODEL`: Model for LaTeX (default `claude-3-5-sonnet-20240620`)
- `LATEX_ENGINE`: Latex binary (`pdflatex` default)
- `LATEX_TEMPLATE`: Path to LaTeX template with lock markers (default `backend/templates/resume_template.tex`)
- `PROMPT_VERSION`: Prompt bundle to load from `backend/prompts/` (default `latest_v1`, fallback `legacy`)
- `STAGE_TIMEOUT_MS`: Timeout per stage in ms (default `60000`)
- `MOCK_MODE=1`: Skip LLM calls and use a deterministic template.
- `OPENAI_EMBEDDING_MODEL`: Embedding model for relevance scoring (default `text-embedding-3-large`)
- `OPENAI_EMBEDDING_DIMS`: Override embedding dimension (defaults to model’s native 3072 when unset)
- `EMBED_CACHE_DIR`: Cache root for resume bullet embeddings (default `backend/cache/embeddings`)
- `EMBED_PREPROCESS_VERSION`: Preprocess version for embeddings (default `embed_text_v1`)

## API
- `POST /analyze` → `{ run_id, status, stage, files, message }`
- `GET /status/:runId` → stage + files + message
- `GET /download/:runId/:file` → download stored artifacts
