#!/usr/bin/env python3
"""Translate Quran verse meanings and hadith meanings in tarbiya foundations to Dutch and English.
Keeps original Arabic text, adds verse_nl/verse_en and hadith_nl/hadith_en fields."""
import json
import os
import sys
import time
from openai import OpenAI

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
client = OpenAI()
BATCH_SIZE = 10


def translate_texts(texts, target_lang, text_type="verse"):
    """Translate a batch of Arabic verses or hadiths to target language."""
    if not texts:
        return []
    
    lang_name = "Dutch" if target_lang == "nl" else "English"
    
    if text_type == "verse":
        system_msg = f"Translate the meaning of each numbered Quranic verse to {lang_name}. This is a translation of the MEANING, not a literal word-for-word translation. Keep it respectful and accurate. Output ONLY numbered translations, one per line."
    else:
        system_msg = f"Translate the meaning of each numbered hadith (prophetic narration) to {lang_name}. Include the narrator reference. Output ONLY numbered translations, one per line."
    
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    
    try:
        resp = client.chat.completions.create(
            model="gpt-5-nano",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": numbered},
            ],
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
        print(f"  ERROR: {e}", flush=True)
        return [""] * len(texts)


def process_year(year_num):
    """Process a single year file."""
    year_path = f"/home/ubuntu/opvoedadvies_apk/assets/data/tarbiya/year_{year_num}.json"
    if not os.path.exists(year_path):
        return 0
    
    with open(year_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Year {year_num}: {data.get('name', '?')}", flush=True)
    
    # Collect all verses and hadiths that need translation
    verses = []  # (week_idx, found_idx, text)
    hadiths = []  # (week_idx, found_idx, text)
    
    for w_idx, week in enumerate(data.get('weeks', [])):
        for f_idx, found in enumerate(week.get('foundations', [])):
            content = found.get('content', {})
            verse = content.get('verse', '')
            hadith = content.get('hadith', '')
            
            if verse and not content.get('verse_nl'):
                verses.append((w_idx, f_idx, verse))
            if hadith and not content.get('hadith_nl'):
                hadiths.append((w_idx, f_idx, hadith))
    
    total = len(verses) + len(hadiths)
    if total == 0:
        print(f"  Skip (already done)", flush=True)
        return 0
    
    print(f"  {len(verses)} verses, {len(hadiths)} hadiths to translate", flush=True)
    
    # Translate verses
    for lang in ['nl', 'en']:
        field = f'verse_{lang}'
        for i in range(0, len(verses), BATCH_SIZE):
            batch = verses[i:i + BATCH_SIZE]
            texts = [x[2] for x in batch]
            results = translate_texts(texts, lang, "verse")
            
            for (w_idx, f_idx, _), trans in zip(batch, results):
                data['weeks'][w_idx]['foundations'][f_idx]['content'][field] = trans
            
            print(f"  [Verse {lang.upper()}] {i//BATCH_SIZE + 1}/{(len(verses) + BATCH_SIZE - 1)//BATCH_SIZE}", flush=True)
            time.sleep(0.3)
    
    # Translate hadiths
    for lang in ['nl', 'en']:
        field = f'hadith_{lang}'
        for i in range(0, len(hadiths), BATCH_SIZE):
            batch = hadiths[i:i + BATCH_SIZE]
            texts = [x[2] for x in batch]
            results = translate_texts(texts, lang, "hadith")
            
            for (w_idx, f_idx, _), trans in zip(batch, results):
                data['weeks'][w_idx]['foundations'][f_idx]['content'][field] = trans
            
            print(f"  [Hadith {lang.upper()}] {i//BATCH_SIZE + 1}/{(len(hadiths) + BATCH_SIZE - 1)//BATCH_SIZE}", flush=True)
            time.sleep(0.3)
    
    # Save
    with open(year_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Done! ({total} items)", flush=True)
    return total


if __name__ == "__main__":
    if len(sys.argv) > 1:
        year_num = int(sys.argv[1])
        process_year(year_num)
    else:
        total = 0
        for y in range(-1, 19):
            total += process_year(y)
        print(f"\nTotal: {total} items translated", flush=True)
