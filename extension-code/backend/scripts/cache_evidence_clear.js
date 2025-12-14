import fs from "fs";
import { getCacheRoot } from "../scoring/evidenceCache.js";

const cacheRoot = getCacheRoot();

if (!fs.existsSync(cacheRoot)) {
  console.log(`No evidence cache found at ${cacheRoot}`);
  process.exit(0);
}

fs.rmSync(cacheRoot, { recursive: true, force: true });
console.log(`Cleared evidence cache at ${cacheRoot}`);
