"""Batch translate all verse/hadith in all tarbiya year files using batched LLM calls"""
import json, time, os, sys
from openai import OpenAI
client = OpenAI()

TARBIYA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "data", "tarbiya")

def batch_translate(texts, target_lang):
    """Translate multiple texts in one LLM call"""
    if not texts:
        return []
    lang_name = "Dutch" if target_lang == "nl" else "English"
    
    numbered = "\n".join([f"{i+1}. {t}" for i, t in enumerate(texts)])
    prompt = f"""Translate each of the following Arabic Islamic texts to {lang_name}.
Return ONLY the translations, one per line, numbered exactly like the input.
Do not add explanations or commentary.

{numbered}"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-5-nano',
            messages=[
                {'role': 'system', 'content': f'You are a professional translator of Islamic texts from Arabic to {lang_name}. Translate accurately. Return numbered translations matching the input numbering.'},
                {'role': 'user', 'content': prompt}
            ],
            max_tokens=4000,
            extra_body={'reasoning': {'effort': 'low'}},
        )
        if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
            content = resp.choices[0].message.content.strip()
            lines = content.split('\n')
            results = []
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # Remove numbering prefix like "1. " or "1) "
                import re
                cleaned = re.sub(r'^\d+[\.\)]\s*', '', line)
                if cleaned:
                    results.append(cleaned)
            return results
    except Exception as e:
        print(f"  Batch error: {e}")
    return []

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    
    # Collect all texts that need translation
    verse_texts = []
    hadith_texts = []
    verse_indices = []  # (week_idx, foundation_idx)
    hadith_indices = []
    
    for wi, w in enumerate(d.get('weeks', [])):
        for fi, fo in enumerate(w.get('foundations', [])):
            c = fo.get('content', {})
            verse = c.get('verse', '')
            hadith = c.get('hadith', '')
            
            if verse and (not c.get('verse_nl') or not c.get('verse_en')):
                verse_texts.append(verse)
                verse_indices.append((wi, fi))
            
            if hadith and (not c.get('hadith_nl') or not c.get('hadith_en')):
                hadith_text = hadith.split(' — ')[0] if ' — ' in hadith else hadith
                hadith_texts.append(hadith_text)
                hadith_indices.append((wi, fi))
    
    if not verse_texts and not hadith_texts:
        return 0
    
    count = 0
    
    # Translate verses in batches of 10
    batch_size = 10
    for i in range(0, len(verse_texts), batch_size):
        batch = verse_texts[i:i+batch_size]
        batch_idx = verse_indices[i:i+batch_size]
        
        # Dutch
        nl_results = batch_translate(batch, 'nl')
        time.sleep(0.3)
        # English
        en_results = batch_translate(batch, 'en')
        time.sleep(0.3)
        
        for j, (wi, fi) in enumerate(batch_idx):
            c = d['weeks'][wi]['foundations'][fi].get('content', {})
            if j < len(nl_results) and nl_results[j]:
                c['verse_nl'] = nl_results[j]
                count += 1
            if j < len(en_results) and en_results[j]:
                c['verse_en'] = en_results[j]
                count += 1
    
    # Translate hadiths in batches of 10
    for i in range(0, len(hadith_texts), batch_size):
        batch = hadith_texts[i:i+batch_size]
        batch_idx = hadith_indices[i:i+batch_size]
        
        # Dutch
        nl_results = batch_translate(batch, 'nl')
        time.sleep(0.3)
        # English
        en_results = batch_translate(batch, 'en')
        time.sleep(0.3)
        
        for j, (wi, fi) in enumerate(batch_idx):
            c = d['weeks'][wi]['foundations'][fi].get('content', {})
            if j < len(nl_results) and nl_results[j]:
                c['hadith_nl'] = nl_results[j]
                count += 1
            if j < len(en_results) and en_results[j]:
                c['hadith_en'] = en_results[j]
                count += 1
    
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    
    return count

def main():
    files = sorted([f for f in os.listdir(TARBIYA_DIR) if f.startswith('year_') and f.endswith('.json')])
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    
    total = 0
    for i, fname in enumerate(files):
        if i < start:
            continue
        filepath = os.path.join(TARBIYA_DIR, fname)
        print(f"[{i+1}/{len(files)}] {fname}...", flush=True)
        count = process_file(filepath)
        total += count
        print(f"  +{count} translations", flush=True)
    
    print(f"\nDone! Total: {total}")

if __name__ == "__main__":
    main()
