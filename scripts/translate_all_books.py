#!/usr/bin/env python3
"""Batch translate library book chapter/section titles to Dutch and English."""
import json
import os
import sys
import time
from openai import OpenAI

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
client = OpenAI()
BATCH_SIZE = 15
BASE = "/home/ubuntu/opvoedadvies_apk/assets/data/library"

def translate_batch(titles, target_lang):
    """Translate a batch of Arabic titles to target language."""
    if not titles:
        return []
    lang_name = "Dutch" if target_lang == "nl" else "English"
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model="gpt-5-nano",
                messages=[
                    {"role": "system", "content": f"Translate each numbered Arabic title to {lang_name}. Keep Islamic terms transliterated (Tawheed, Fitrah, Sabr, Ikhlas, Tarbiyah, Tawbah, Dhikr). Output ONLY numbered translations, one per line, same numbering."},
                    {"role": "user", "content": numbered},
                ],
                timeout=60,
            )
            result = resp.choices[0].message.content.strip()
            lines = [l.strip() for l in result.split("\n") if l.strip()]
            translations = []
            for line in lines:
                if line and line[0].isdigit():
                    parts = line.split(". ", 1) if ". " in line else line.split(") ", 1)
                    translations.append(parts[1].strip() if len(parts) > 1 else line)
                elif line:
                    translations.append(line)
            while len(translations) < len(titles):
                translations.append("")
            return translations[:len(titles)]
        except Exception as e:
            print(f"  RETRY {attempt+1}: {e}", flush=True)
            time.sleep(2 * (attempt + 1))
    return [""] * len(titles)

def process_book(book_num):
    """Process a single book."""
    book_path = f"{BASE}/book_{book_num}.json"
    if not os.path.exists(book_path):
        print(f"Book {book_num}: NOT FOUND", flush=True)
        return 0
    with open(book_path, 'r', encoding='utf-8') as f:
        book = json.load(f)
    print(f"Book {book_num}: {book.get('title_ar', '?')}", flush=True)
    
    # Collect titles needing translation
    items = []
    for ch_idx, chapter in enumerate(book.get('chapters', [])):
        ch_title = chapter.get('title', '')
        if ch_title and not chapter.get('title_nl'):
            items.append(('ch', ch_idx, -1, ch_title))
        for sec_idx, section in enumerate(chapter.get('sections', [])):
            sec_title = section.get('title', '')
            if sec_title and not section.get('title_nl'):
                items.append(('sec', ch_idx, sec_idx, sec_title))
    if not items:
        print(f"  Skip (already done)", flush=True)
        return 0
    print(f"  {len(items)} titles to translate", flush=True)
    
    for lang in ['nl', 'en']:
        field = f'title_{lang}'
        for i in range(0, len(items), BATCH_SIZE):
            batch = items[i:i + BATCH_SIZE]
            titles = [x[3] for x in batch]
            results = translate_batch(titles, lang)
            for (typ, ch_idx, sec_idx, _), trans in zip(batch, results):
                if typ == 'ch':
                    book['chapters'][ch_idx][field] = trans
                else:
                    book['chapters'][ch_idx]['sections'][sec_idx][field] = trans
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(items) + BATCH_SIZE - 1) // BATCH_SIZE
            print(f"  [{lang.upper()}] batch {batch_num}/{total_batches} done", flush=True)
            time.sleep(0.3)
    
    with open(book_path, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=2)
    print(f"  Saved!", flush=True)
    return len(items)

if __name__ == "__main__":
    total = 0
    for i in range(3, 11):  # Books 3-10 (1-2 already done)
        total += process_book(i)
        time.sleep(0.5)
    print(f"\nTotal: {total} items translated", flush=True)
