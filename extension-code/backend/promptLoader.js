import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_ROOT = path.join(__dirname, "prompts");

export function loadPrompt(stage, version, fallback = "legacy") {
  const safeStage = stage.toLowerCase();
  const target = path.join(PROMPTS_ROOT, safeStage, `${version}.md`);
  const legacy = path.join(PROMPTS_ROOT, safeStage, `${fallback}.md`);
  if (fs.existsSync(target)) {
    return { version, content: fs.readFileSync(target, "utf8"), path: target };
  }
  if (!fs.existsSync(legacy)) {
    throw new Error(`Prompt not found for stage=${stage}, version=${version} (no legacy fallback)`);
  }
  return { version: fallback, content: fs.readFileSync(legacy, "utf8"), path: legacy };
}
