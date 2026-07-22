#!/usr/bin/env python3
"""Translate small data files to NL and EN using LLM."""
import json, os, sys
from openai import OpenAI

os.chdir('/home/ubuntu/opvoedadvies_apk')
client = OpenAI()

def translate_text(text: str, lang: str, context: str) -> str:
    lang_name = "Dutch" if lang == "nl" else "English"
    resp = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": f"Translate the following Arabic JSON array to {lang_name}. Context: {context}. Keep Islamic terms transliterated (fitrah, tawheed, dhikr etc). Output ONLY valid JSON array, no markdown."},
            {"role": "user", "content": text}
        ],
        max_completion_tokens=16000,
    )
    return resp.choices[0].message.content

def clean_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return text

def process_file(filepath, context, batch_size=6):
    print(f"\n{'='*50}", flush=True)
    print(f"Processing: {filepath}", flush=True)
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        print(f"  Skipping (not a list, is {type(data).__name__})", flush=True)
        return
    
    print(f"  Items: {len(data)}", flush=True)
    
    for lang in ['nl', 'en']:
        lang_name = "Dutch" if lang == "nl" else "English"
        print(f"  Translating to {lang_name}...", flush=True)
        
        all_translated = []
        for i in range(0, len(data), batch_size):
            batch = data[i:i+batch_size]
            batch_text = json.dumps(batch, ensure_ascii=False)
            print(f"    Batch {i//batch_size + 1}/{(len(data)-1)//batch_size + 1}...", end="", flush=True)
            
            try:
                result = translate_text(batch_text, lang, context)
                result = clean_json(result)
                parsed = json.loads(result)
                all_translated.extend(parsed)
                print(f" OK ({len(parsed)} items)", flush=True)
            except Exception as e:
                print(f" ERROR: {e}", flush=True)
                all_translated.extend(batch)
        
        # Add _nl or _en suffix to each key in translated items
        for idx, item in enumerate(data):
            if idx < len(all_translated):
                tr = all_translated[idx]
                if isinstance(tr, dict):
                    for key, val in list(tr.items()):
                        if not key.endswith(f'_{lang}'):
                            item[f"{key}_{lang}"] = val
    
    with open(filepath, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Saved!", flush=True)

# Process all small files
print("Starting translation of small files...", flush=True)

process_file('assets/data/educational_methods.json', 
             "Educational methods for Islamic parenting by age group", batch_size=6)

process_file('assets/data/fitrah_traits_detailed.json',
             "Innate traits (fitrah) of children by age - Islamic development", batch_size=6)

process_file('assets/data/heart_deeds.json',
             "Deeds of the heart - Islamic spiritual development", batch_size=8)

process_file('assets/data/concepts_tawheed.json',
             "Concepts of Tawheed for teaching children", batch_size=14)

process_file('assets/data/tarbiya_rules.json',
             "Islamic parenting rules and principles", batch_size=8)

print("\n✅ All small files translated!", flush=True)
