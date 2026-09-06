#!/usr/bin/env node
// Guards user-visible client content against the single-a misspelling of
// "Allah". House rule: in Dutch/English text the name is ALWAYS "Allaah"
// (never "Allah"). Scans the same content dirs as the Allah->Allaah sweep.
// Exit 1 on any hit, printing file:line. Run from repo root.
import fs from "node:fs";
import path from "node:path";
const DIRS = ["assets/data", "data", "lib", "app"];
const EXTS = [".json", ".ts", ".tsx"];
const RE = /\bAllah\b/;

function collect(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) collect(full, out);
    else if (EXTS.includes(path.extname(name))) out.push(full);
  }
}

let hits = 0, scanned = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  const files = [];
  collect(dir, files);
  for (const file of files) {
    scanned++;
    const isJson = file.endsWith(".json");
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (!isJson && line.trim().startsWith("//")) return; // whole-line comment, not user-visible
      if (RE.test(line)) {
        hits++;
        console.error(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}
if (!scanned) { console.error("allah-spelling check: scanned 0 files — target directories missing?"); process.exit(1); }
if (hits) { console.error(`\n${hits} single-a "Allah" hit(s). The name must be spelled "Allaah", never "Allah".`); process.exit(1); }
console.log(`allah-spelling check: clean (${scanned} files)`);
