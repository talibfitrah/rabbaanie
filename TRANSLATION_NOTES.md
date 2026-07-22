# Translation Notes

## Completed Translations:

### 1. Educational Methods (48 items) ✅
- File: assets/data/educational_methods.json
- Status: NL=48/48, EN=48/48

### 2. Fitrah Traits Detailed (192 items) ✅
- File: assets/data/fitrah_traits_detailed.json
- Status: NL=192/192, EN=192/192

### 3. Heart Deeds (66 items) ✅
- File: assets/data/heart_deeds.json
- Status: NL=66/66, EN=66/66

### 4. Concepts Tawheed (14 items) ✅
- File: assets/data/concepts_tawheed.json
- Status: NL=14/14, EN=14/14

### 5. Tarbiya Rules (32 items) ✅
- File: assets/data/tarbiya_rules.json
- Status: NL=32/32, EN=32/32

### 6. Mindsets Update (53 items) ✅
- File: assets/data/mindsets_update.json
- Status: NL=53/53, EN=53/53

### 7. Emotion Path ✅ (already multilingual)
- File: assets/data/emotion_path.json
- Status: Already uses {ar, nl, en} dict structure

## Still Needs Translation:

### Library Books (9 books, 2193 sections, ~2M chars)
- Files: assets/data/library/book_1.json to book_10.json (no book_4)
- Structure: chapters[].sections[].content (Arabic only)
- Already has: chapters[].title_nl, chapters[].title_en
- NEEDS: sections[].content_nl, sections[].content_en
- NOTE: This is a very large task (~2M characters) requiring dedicated processing

## Translation approach:
- Used gpt-5-mini for bulk translation (cheapest, good quality)
- Processed in batches of 6-8 items with resume capability
- Saved after each batch to prevent data loss
- Kept Islamic terms transliterated (e.g., fitrah, tawheed, dhikr)
- Translation keys use suffix pattern: key_nl, key_en
