#!/usr/bin/env node
/**
 * Refreshes `backend-openapi.json` at the repo root. This is what Orval reads
 * — re-running this script + `npm run gen:api` is the standard loop for
 * picking up backend contract changes.
 *
 * Two sources:
 *
 *  1. **A spec URL** (`npm run fetch:openapi -- http://localhost:5188/openapi/v1.json`).
 *     Plain HTTP fetch of the live OpenAPI document. Also used for production:
 *     `npm run fetch:openapi -- https://tasks-api.lupira.com/openapi/v1.json`.
 *
 *  2. **No args** — leaves the existing `backend-openapi.json` placeholder in
 *     place (the skeleton ships with an empty `paths` object so the Orval
 *     config validates before the backend contract exists).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outFile = path.join(repoRoot, 'backend-openapi.json');

const arg = process.argv[2];

if (arg) {
  console.log(`Fetching ${arg} …`);
  const res = await fetch(arg);
  if (!res.ok) {
    console.error(`Failed: ${res.status} ${res.statusText} from ${arg}`);
    process.exit(1);
  }
  const json = await res.json();
  await fs.writeFile(outFile, JSON.stringify(json, null, 2) + '\n');
  console.log(`Wrote ${outFile} (${(JSON.stringify(json).length / 1024).toFixed(1)} KB)`);
} else {
  console.log(
    `No URL passed; leaving ${outFile} as-is.\n` +
    `Pass a spec URL to refresh, e.g.:\n` +
    `  npm run fetch:openapi -- https://tasks-api.lupira.com/openapi/v1.json`,
  );
}
