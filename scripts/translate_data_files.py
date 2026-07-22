#!/usr/bin/env python3
"""
Translate Arabic-only data files to Dutch and English using built-in LLM proxy.
Uses OpenAI SDK with OPENAI_API_BASE and OPENAI_API_KEY env vars.
"""
import json
import os
import sys
import time

from openai import OpenAI

client = OpenAI()  # auto-reads OPENAI_API_BASE and OPENAI_API_KEY

PROJECT = '/home/ubuntu/opvoedadvies_apk'
DATA_DIR = f'{PROJECT}/assets/data'
PROGRESS_FILE = f'{PROJECT}/scripts/.translate_progress.json'

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_progress(progress):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)

def translate_chunk(items):
    """Translate a chunk using gpt-5-nano (cheapest)."""
    prompt = f"""Translate this Arabic JSON array. For each text field, add _nl (Dutch) and _en (English) translations.
Rules:
- Keep ALL Arabic text unchanged
- Add _nl and _en suffix fields for each translatable text field
- Use "Qur'aan" not "Quran", "hadieth" not "hadith", "Allaah" not "Allah"
- Keep Quranic verses and hadith text in Arabic - only translate explanations
- Islamic terms: fitrah, tazkiyah, tasfiyah, tawheed

Input:
{json.dumps(items, ensure_ascii=False)}

Return ONLY valid JSON array with _nl and _en fields added. No markdown, no explanation."""

    try:
        resp = client.chat.completions.create(
            model='gpt-5-nano',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=16000,
            temperature=0.2,
            extra_body={'reasoning': {'effort': 'low'}},
        )
        content = resp.choices[0].message.content.strip()
        # Parse JSON
        if content.startswith('```'):
            content = content.split('\n', 1)[1]
            if content.rstrip().endswith('```'):
                content = content.rstrip()[:-3]
            content = content.strip()
        return json.loads(content)
    except Exception as e:
        print(f"    Error: {e}")
        return None

def process_list_file(name, path, chunk_size=10):
    """Process a list-type JSON file."""
    print(f"\n{'='*40}\n{name} ({path})")
    
    progress = load_progress()
    
    with open(path, 'r') as f:
        data = json.load(f)
    
    # Check if already done
    if data and isinstance(data[0], dict) and any('_nl' in k for k in data[0].keys()):
        print("  Already translated!")
        progress[name] = 'done'
        save_progress(progress)
        return True
    
    # Check partial progress
    partial_path = f'{DATA_DIR}/{name}_partial.json'
    translated = []
    start_idx = 0
    if os.path.exists(partial_path):
        with open(partial_path, 'r') as f:
            translated = json.load(f)
        start_idx = len(translated)
        print(f"  Resuming from item {start_idx}")
    
    total = len(data)
    for i in range(start_idx, total, chunk_size):
        chunk = data[i:i+chunk_size]
        end = min(i+chunk_size, total)
        print(f"  [{i+1}-{end}/{total}]", end=" ", flush=True)
        
        result = translate_chunk(chunk)
        if result and isinstance(result, list):
            translated.extend(result)
            print(f"OK ({len(result)})")
        else:
            print("RETRY...", end=" ", flush=True)
            time.sleep(2)
            result = translate_chunk(chunk)
            if result and isinstance(result, list):
                translated.extend(result)
                print(f"OK ({len(result)})")
            else:
                print("SKIP (keeping original)")
                translated.extend(chunk)
        
        # Save partial progress every 3 chunks
        if (i // chunk_size) % 3 == 2:
            with open(partial_path, 'w') as f:
                json.dump(translated, f, ensure_ascii=False, indent=1)
        
        time.sleep(0.3)
    
    # Save final
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(translated, f, ensure_ascii=False, indent=1)
    
    # Clean up partial
    if os.path.exists(partial_path):
        os.remove(partial_path)
    
    progress[name] = 'done'
    save_progress(progress)
    print(f"  DONE: {len(translated)} items saved")
    return True

def process_dict_file(name, path):
    """Process mindsets_update (dict)."""
    print(f"\n{'='*40}\n{name}")
    
    with open(path, 'r') as f:
        data = json.load(f)
    
    first_key = list(data.keys())[0]
    if data[first_key] and 'title_nl' in data[first_key][0]:
        print("  Already translated!")
        return True
    
    prompt = f"""Translate this JSON dict. Each value is a list of objects with 'title' and 'description'.
Add 'title_nl', 'title_en', 'description_nl', 'description_en' fields.
Rules: Use Qur'aan (not Quran), hadieth (not hadith), Allaah (not Allah). Keep Arabic text.

{json.dumps(data, ensure_ascii=False)}

Return ONLY valid JSON object."""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-5-nano',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=16000,
            temperature=0.2,
            extra_body={'reasoning': {'effort': 'low'}},
        )
        content = resp.choices[0].message.content.strip()
        if content.startswith('```'):
            content = content.split('\n', 1)[1]
            if content.rstrip().endswith('```'):
                content = content.rstrip()[:-3]
            content = content.strip()
        result = json.loads(content)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        print(f"  DONE: {len(result)} keys")
        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False

def main():
    # Start with smallest files first
    files = [
        ('mindsets_update', f'{DATA_DIR}/mindsets_update.json', 'dict', 0),
        ('heart_deeds', f'{DATA_DIR}/heart_deeds.json', 'list', 12),
        ('educational_methods', f'{DATA_DIR}/educational_methods.json', 'list', 12),
        ('allah_names_by_age', f'{DATA_DIR}/allah_names_by_age.json', 'list', 12),
        ('fitrah_traits_detailed', f'{DATA_DIR}/fitrah_traits_detailed.json', 'list', 12),
    ]
    
    progress = load_progress()
    
    for name, path, ftype, chunk in files:
        if progress.get(name) == 'done':
            print(f"\n{name}: already done, skipping")
            continue
        
        if ftype == 'list':
            process_list_file(name, path, chunk)
        else:
            process_dict_file(name, path)

if __name__ == '__main__':
    main()
