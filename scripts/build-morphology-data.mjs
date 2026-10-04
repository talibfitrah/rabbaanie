#!/usr/bin/env node
// One-off data-prep: Quranic Arabic Corpus morphology (mustafa0x/quran-morphology
// fork, GPL — credit corpus.quran.com) -> one compact JSON per surah, keyed by
// "<ayah>:<word>", segments kept in file order. Served later from
// api.rabbaanie.com/downloads/morphology/{surah}.json and parsed client-side by
// lib/quran-morphology.ts. Pure offline read of the already-cloned source file —
// no network. See local-docs/arabic-word-content-research.md for the format.
import fs from "node:fs";
import path from "node:path";

const SRC =
  process.argv[2] ||
  "/tmp/claude-1000/-home-msa-Development-rabbaanie/1eba7455-7c2f-4ee2-9afd-19b5d8a11eb9/scratchpad/clone-mustafa0x-quran-morphology/quran-morphology.txt";
const OUT_DIR =
  process.argv[3] ||
  "/tmp/claude-1000/-home-msa-Development-rabbaanie/1eba7455-7c2f-4ee2-9afd-19b5d8a11eb9/scratchpad/morphology-out";

const lines = fs.readFileSync(SRC, "utf8").split("\n").filter(Boolean);

// surah -> "ayah:word" -> [form, tag, features][] (segments appended in file
// order, which is already seg-ascending per word — verified: this is the
// Qur'an's own corpus file, strictly sorted surah:ayah:word:seg).
const bySurah = new Map();
const wordKeys = new Set(); // "surah:ayah:word", for the distinct-word count

for (const line of lines) {
  const [loc, form, tag, features] = line.split("\t");
  const [surahS, ayahS, wordS] = loc.split(":");
  const surah = Number(surahS);
  const wordKey = `${ayahS}:${wordS}`;
  if (!bySurah.has(surah)) bySurah.set(surah, {});
  const surahObj = bySurah.get(surah);
  if (!surahObj[wordKey]) surahObj[wordKey] = [];
  surahObj[wordKey].push([form, tag, features || ""]);
  wordKeys.add(`${surah}:${wordKey}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (let surah = 1; surah <= 114; surah++) {
  fs.writeFileSync(path.join(OUT_DIR, `${surah}.json`), JSON.stringify(bySurah.get(surah) || {}));
}

// ---- verify ----
const fileCount = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length;
console.log(`files written: ${fileCount}`);
console.log(`distinct surah:ayah:word keys: ${wordKeys.size}`);
for (const [surah, aw] of [
  [1, "1:1"],
  [1, "2:2"],
  [1, "5:2"],
  [2, "255:1"],
]) {
  console.log(`${surah}:${aw} ->`, JSON.stringify(bySurah.get(surah)[aw]));
}
