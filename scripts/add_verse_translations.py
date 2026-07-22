"""
Add Dutch and English translations for Qur'aan verses and ahaadieth in tarbiya data files.
Uses the built-in sandbox LLM (OpenAI-compatible) to translate Arabic religious texts.
"""
import json
import os
import sys
import time
from openai import OpenAI

client = OpenAI()  # Uses OPENAI_API_KEY and OPENAI_API_BASE from env

TARBIYA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "data", "tarbiya")

def translate_text(arabic_text: str, target_lang: str) -> str:
    """Translate Arabic text to Dutch or English using LLM."""
    if not arabic_text or not arabic_text.strip():
        return ""
    
    lang_name = "Dutch" if target_lang == "nl" else "English"
    
    try:
        resp = client.chat.completions.create(
            model="gpt-5-nano",
            messages=[
                {"role": "system", "content": f"You are a professional translator of Islamic texts from Arabic to {lang_name}. Translate accurately and faithfully. Provide ONLY the translation, no explanation or commentary."},
                {"role": "user", "content": arabic_text}
            ],
            max_tokens=2000,
            extra_body={"reasoning": {"effort": "low"}},
        )
        content = resp.choices[0].message.content
        return content.strip() if content else ""
    except Exception as e:
        print(f"  Translation error: {e}")
        return ""

def process_file(filepath: str):
    """Process a single tarbiya year file and add translations."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    weeks = data.get('weeks', [])
    total_translations = 0
    
    for wi, week in enumerate(weeks):
        foundations = week.get('foundations', [])
        for foundation in foundations:
            content = foundation.get('content', {})
            verse = content.get('verse', '')
            hadith = content.get('hadith', '')
            
            # Add verse translations if missing
            if verse and not content.get('verse_nl'):
                tr = translate_text(verse, 'nl')
                if tr:
                    content['verse_nl'] = tr
                    modified = True
                    total_translations += 1
                time.sleep(0.3)
            
            if verse and not content.get('verse_en'):
                tr = translate_text(verse, 'en')
                if tr:
                    content['verse_en'] = tr
                    modified = True
                    total_translations += 1
                time.sleep(0.3)
            
            # Add hadith translations if missing
            if hadith and not content.get('hadith_nl'):
                # Only translate the hadith text part (before source reference)
                hadith_text = hadith.split(' — ')[0] if ' — ' in hadith else hadith
                tr = translate_text(hadith_text, 'nl')
                if tr:
                    content['hadith_nl'] = tr
                    modified = True
                    total_translations += 1
                time.sleep(0.3)
            
            if hadith and not content.get('hadith_en'):
                hadith_text = hadith.split(' — ')[0] if ' — ' in hadith else hadith
                tr = translate_text(hadith_text, 'en')
                if tr:
                    content['hadith_en'] = tr
                    modified = True
                    total_translations += 1
                time.sleep(0.3)
        
        if (wi + 1) % 10 == 0:
            print(f"  Week {wi+1}/{len(weeks)} processed, {total_translations} translations so far")
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  Saved {filepath} ({total_translations} translations added)")
    else:
        print(f"  No changes needed: {filepath}")

def main():
    files = sorted([f for f in os.listdir(TARBIYA_DIR) if f.startswith('year_') and f.endswith('.json')])
    
    if len(sys.argv) > 1:
        target = sys.argv[1]
        files = [f for f in files if target in f]
    
    for fname in files:
        filepath = os.path.join(TARBIYA_DIR, fname)
        print(f"Processing: {fname}")
        process_file(filepath)

if __name__ == "__main__":
    main()
