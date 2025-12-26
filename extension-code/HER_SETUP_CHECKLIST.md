# Setup on Her Mac (M2 Air)

This is the exact checklist to bring the `extension-code` folder onto her Mac and get it running locally without coding.

## What to bring from your Mac
- AirDrop/zip the **entire** `extension-code/` folder, including `backend/node_modules/` and `backend/start.command` (already executable).
- Copy `backend/.env.local.example` to `backend/.env.local` and add your real keys before zipping, or fill it on her machine:
  ```
  OPENAI_API_KEY=YOUR_OPENAI_KEY
  ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY
  LATEX_ENGINE=tectonic   # or pdflatex if she has MacTeX
  PORT=3001
  ```

## One-time installs on her Mac
1) Node.js 18+ (use the official macOS .pkg installer; no terminal needed).
2) LaTeX engine (for PDF):
   - Preferred: Tectonic (small). If Homebrew exists: `brew install tectonic`. Otherwise use the Tectonic macOS installer.
   - If you prefer MacTeX, install that and set `LATEX_ENGINE=pdflatex`.
3) Google Chrome (for loading the unpacked extension).

## First run (no coding)
1) Unzip the folder somewhere simple, e.g. `~/ResumeIntel/extension-code`.
2) Ensure `start.command` is executable (only needed if permissions were stripped):
   ```bash
   chmod +x backend/start.command
   ```
3) Start backend (double-click, or via terminal):
   ```bash
   cd ~/ResumeIntel/extension-code/backend
   ./start.command   # or: source .env.local && node server.js
   ```
4) Verify health in a browser: http://localhost:3001/health (should show `ok`).
5) Load the extension in Chrome:
   - Chrome → Settings → Extensions → enable Developer Mode.
   - “Load unpacked” → select the unzipped `extension-code/` folder.
6) Use the extension/dashboard as normal. Keep the backend terminal window open while using it.

## If something fails
- If `node` is missing or version < 18: install Node and rerun step 3.
- If LaTeX compile fails, install Tectonic (or MacTeX) and set `LATEX_ENGINE` accordingly, then rerun.
- If `npm install` is ever needed (only if `backend/node_modules` was not copied), run inside `backend/`:
  ```bash
  npm install
  ```

## Mock mode (optional demo without real keys)
- To skip live LLM calls, set `MOCK_MODE=1` in `.env.local`. PDFs still need LaTeX unless you disable compilation in code.
