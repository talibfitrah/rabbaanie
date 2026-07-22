"""Translate all verse/hadith in all tarbiya year files"""
import json, time, os, sys
from openai import OpenAI
client = OpenAI()

TARBIYA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "data", "tarbiya")

def translate(text, lang):
    lang_name = "Dutch" if lang == "nl" else "English"
    try:
        resp = client.chat.completions.create(
            model='gpt-5-nano',
            messages=[
                {'role':'system','content':f'Translate this Arabic Islamic text to {lang_name}. Only the translation, nothing else.'},
                {'role':'user','content': text}
            ],
            max_tokens=2000,
            extra_body={'reasoning':{'effort':'low'}},
        )
        if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
            return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"  Error: {e}")
    return ""

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    
    count = 0
    for w in d.get('weeks', []):
        for fo in w.get('foundations', []):
            c = fo.get('content', {})
            verse = c.get('verse', '')
            hadith = c.get('hadith', '')
            
            if verse:
                if not c.get('verse_nl'):
                    tr = translate(verse, 'nl')
                    if tr:
                        c['verse_nl'] = tr
                        count += 1
                    time.sleep(0.2)
                if not c.get('verse_en'):
                    tr = translate(verse, 'en')
                    if tr:
                        c['verse_en'] = tr
                        count += 1
                    time.sleep(0.2)
            
            if hadith:
                hadith_text = hadith.split(' — ')[0] if ' — ' in hadith else hadith
                if not c.get('hadith_nl'):
                    tr = translate(hadith_text, 'nl')
                    if tr:
                        c['hadith_nl'] = tr
                        count += 1
                    time.sleep(0.2)
                if not c.get('hadith_en'):
                    tr = translate(hadith_text, 'en')
                    if tr:
                        c['hadith_en'] = tr
                        count += 1
                    time.sleep(0.2)
    
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    return count

def main():
    files = sorted([f for f in os.listdir(TARBIYA_DIR) if f.startswith('year_') and f.endswith('.json')])
    
    # Allow specifying start file
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
    
    print(f"\nDone! Total translations added: {total}")

if __name__ == "__main__":
    main()
