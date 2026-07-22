#!/usr/bin/env python3
"""Batch translate verse and hadith fields in tarbiya year data to Dutch and English.
Structure: year.weeks[].foundations[].content.{verse, hadith} -> add verse_nl, verse_en, hadith_nl, hadith_en
"""
import json
import os
import sys
import time
from openai import OpenAI

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
client = OpenAI()
BATCH_SIZE = 10
BASE = "/home/ubuntu/opvoedadvies_apk/assets/data/tarbiya"

def translate_texts(texts, target_lang, context="Qur'anic verse or hadith"):
    """Translate a batch of Arabic texts to target language."""
    if not texts:
        return []
    lang_name = "Dutch" if target_lang == "nl" else "English"
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model="gpt-5-nano",
                messages=[
                    {"role": "system", "content": f"Translate each numbered {context} from Arabic to {lang_name}. Keep Islamic terms transliterated (Tawheed, Fitrah, Sabr, Ikhlas, Tarbiyah). Keep source references (like البخاري/مسلم numbers) as-is. Output ONLY numbered translations, one per line, same numbering."},
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
            while len(translations) < len(texts):
                translations.append("")
            return translations[:len(texts)]
        except Exception as e:
            print(f"  RETRY {attempt+1}: {e}", flush=True)
            time.sleep(2 * (attempt + 1))
    return [""] * len(texts)

def process_year(year_num):
    """Process a single year file."""
    year_path = f"{BASE}/year_{year_num}.json"
    if not os.path.exists(year_path):
        return 0
    with open(year_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    weeks = data.get('weeks', [])
    # Collect items needing translation: (week_idx, foundation_idx, field, arabic_text)
    verse_items = []
    hadith_items = []
    
    for w_idx, week in enumerate(weeks):
        for f_idx, foundation in enumerate(week.get('foundations', [])):
            content = foundation.get('content', {})
            if not isinstance(content, dict):
                continue
            verse = content.get('verse', '')
            hadith = content.get('hadith', '')
            if verse and not content.get('verse_nl'):
                verse_items.append((w_idx, f_idx, verse))
            if hadith and not content.get('hadith_nl'):
                hadith_items.append((w_idx, f_idx, hadith))
    
    total_items = len(verse_items) + len(hadith_items)
    if total_items == 0:
        print(f"  Year {year_num}: Skip (already done or no content)", flush=True)
        return 0
    print(f"  Year {year_num}: {len(verse_items)} verses + {len(hadith_items)} hadiths to translate", flush=True)
    
    # Translate verses
    for lang in ['nl', 'en']:
        v_field = f'verse_{lang}'
        for i in range(0, len(verse_items), BATCH_SIZE):
            batch = verse_items[i:i + BATCH_SIZE]
            texts = [x[2] for x in batch]
            results = translate_texts(texts, lang, "Qur'anic verse")
            for (w_idx, f_idx, _), trans in zip(batch, results):
                weeks[w_idx]['foundations'][f_idx]['content'][v_field] = trans
            time.sleep(0.3)
        
        h_field = f'hadith_{lang}'
        for i in range(0, len(hadith_items), BATCH_SIZE):
            batch = hadith_items[i:i + BATCH_SIZE]
            texts = [x[2] for x in batch]
            results = translate_texts(texts, lang, "hadith (prophetic saying)")
            for (w_idx, f_idx, _), trans in zip(batch, results):
                weeks[w_idx]['foundations'][f_idx]['content'][h_field] = trans
            time.sleep(0.3)
    
    data['weeks'] = weeks
    with open(year_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Year {year_num}: Saved! ({total_items} items)", flush=True)
    return total_items

if __name__ == "__main__":
    total = 0
    years = list(range(-1, 18))  # year -1 to 17
    for y in years:
        total += process_year(y)
    print(f"\nTotal: {total} items translated", flush=True)
