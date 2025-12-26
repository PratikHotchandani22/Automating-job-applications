import fs from "fs";
import path from "path";
import { getCacheRoot, validateEvidenceScoresJson } from "../scoring/evidenceCache.js";

const cacheRoot = getCacheRoot();

if (!fs.existsSync(cacheRoot)) {
  console.log(`Evidence cache directory does not exist at ${cacheRoot}`);
  process.exit(0);
}

const resumeDirs = fs
  .readdirSync(cacheRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let total = 0;
let valid = 0;
let invalid = 0;
const rows = [];

resumeDirs.forEach((resumeHash) => {
  const resumePath = path.join(cacheRoot, resumeHash);
  const rulesDirs = fs
    .readdirSync(resumePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  rulesDirs.forEach((rulesHash) => {
    const filePath = path.join(resumePath, rulesHash, "evidence_scores.json");
    if (!fs.existsSync(filePath)) return;
    total += 1;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const validation = validateEvidenceScoresJson(parsed);
      if (validation.valid) {
        valid += 1;
        rows.push({ resumeHash, rulesHash, status: "valid" });
      } else {
        invalid += 1;
        rows.push({ resumeHash, rulesHash, status: `invalid (${validation.errors.join(", ")})` });
      }
    } catch (error) {
      invalid += 1;
      rows.push({ resumeHash, rulesHash, status: `corrupt (${error.message})` });
    }
  });
});

console.log(`Evidence cache root: ${cacheRoot}`);
console.log(`Entries: ${total} (valid: ${valid}, invalid: ${invalid})`);
rows.forEach((row) => {
  console.log(`- ${row.resumeHash}/${row.rulesHash}: ${row.status}`);
});
