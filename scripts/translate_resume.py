#!/usr/bin/env python3
"""
Resume-capable translation script for small data files.
Translates Arabic content to Dutch (NL) and English (EN).
Saves after each batch so progress is never lost.
"""
import json, os, sys, time, gc
from openai import OpenAI

os.chdir('/home/ubuntu/opvoedadvies_apk')
client = OpenAI()

def translate_batch(items_json: str, lang: str, context: str, retries=3) -> str:
    """Translate a JSON array batch to target language with retries."""
    lang_name = "Dutch" if lang == "nl" else "English"
    for attempt in range(retries):
        try:
            resp = client.chat.completions.create(
                model="gpt-5-mini",
                messages=[
                    {"role": "system", "content": f"Translate the following Arabic JSON array to {lang_name}. Context: {context}. Keep Islamic terms transliterated (fitrah, tawheed, dhikr, sunnah, etc). Output ONLY valid JSON array, no markdown fences."},
                    {"role": "user", "content": items_json}
                ],
                max_completion_tokens=16000,
            )
            return resp.choices[0].message.content
        except Exception as e:
            if attempt < retries - 1:
                print(f"    Retry {attempt+1}: {e}", flush=True)
                time.sleep(5 * (attempt + 1))
            else:
                raise
    return None

def clean_json(text):
    """Remove markdown fences if present."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return text.strip()

def translate_list_file(filepath, context, batch_size=6, langs=None):
    """Translate a list-type JSON file with resume capability."""
    if langs is None:
        langs = ['nl', 'en']
    
    print(f"\n{'='*50}", flush=True)
    print(f"Processing: {filepath}", flush=True)
    
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        print(f"  ERROR: Expected list, got {type(data).__name__}", flush=True)
        return False
    
    print(f"  Items: {len(data)}", flush=True)
    
    for lang in langs:
        lang_name = "Dutch" if lang == "nl" else "English"
        suffix = f"_{lang}"
        
        # Find where we left off - count items that already have translations
        already_done = 0
        for item in data:
            if any(k.endswith(suffix) for k in item.keys()):
                already_done += 1
            else:
                break
        
        if already_done >= len(data):
            print(f"  {lang_name}: Already complete ({already_done}/{len(data)})", flush=True)
            continue
        
        print(f"  Translating to {lang_name} (resuming from item {already_done})...", flush=True)
        
        remaining = data[already_done:]
        total_batches = (len(remaining) - 1) // batch_size + 1
        
        for batch_idx in range(0, len(remaining), batch_size):
            batch = remaining[batch_idx:batch_idx + batch_size]
            batch_num = batch_idx // batch_size + 1
            print(f"    Batch {batch_num}/{total_batches}...", end="", flush=True)
            
            try:
                batch_text = json.dumps(batch, ensure_ascii=False)
                result = translate_batch(batch_text, lang, context)
                result = clean_json(result)
                parsed = json.loads(result)
                
                # Apply translations to original data
                for i, tr_item in enumerate(parsed):
                    orig_idx = already_done + batch_idx + i
                    if orig_idx < len(data) and isinstance(tr_item, dict):
                        for key, val in tr_item.items():
                            if not key.endswith(suffix):
                                data[orig_idx][f"{key}{suffix}"] = val
                            else:
                                data[orig_idx][key] = val
                
                print(f" OK ({len(parsed)})", flush=True)
                
                # Save after each batch for resume capability
                with open(filepath, 'w') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
            except Exception as e:
                print(f" ERROR: {e}", flush=True)
                # Save what we have so far
                with open(filepath, 'w') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"  Saved progress. Re-run to resume.", flush=True)
                return False
            
            # Small delay to avoid rate limiting
            time.sleep(0.5)
        
        # Final save after language complete
        with open(filepath, 'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  {lang_name} complete!", flush=True)
    
    print(f"  ✓ All translations done for {filepath}", flush=True)
    gc.collect()
    return True

def translate_mindsets_file(filepath):
    """Translate mindsets_update.json - dict of year -> list of items with title/description."""
    print(f"\n{'='*50}", flush=True)
    print(f"Processing: {filepath} (mindsets structure)", flush=True)
    
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    all_items = []
    year_map = []  # (year_key, item_index)
    
    for year_key, items in data.items():
        for i, item in enumerate(items):
            all_items.append(item)
            year_map.append((year_key, i))
    
    print(f"  Total items across all years: {len(all_items)}", flush=True)
    
    for lang in ['nl', 'en']:
        lang_name = "Dutch" if lang == "nl" else "English"
        suffix = f"_{lang}"
        
        # Check if already done
        already_done = sum(1 for item in all_items if f"title{suffix}" in item)
        if already_done >= len(all_items):
            print(f"  {lang_name}: Already complete", flush=True)
            continue
        
        print(f"  Translating to {lang_name} ({already_done}/{len(all_items)} done)...", flush=True)
        
        # Process in batches
        batch_size = 6
        items_to_translate = [(idx, item) for idx, item in enumerate(all_items) if f"title{suffix}" not in item]
        
        for batch_start in range(0, len(items_to_translate), batch_size):
            batch = items_to_translate[batch_start:batch_start + batch_size]
            batch_items = [item for _, item in batch]
            batch_num = batch_start // batch_size + 1
            total_batches = (len(items_to_translate) - 1) // batch_size + 1
            
            print(f"    Batch {batch_num}/{total_batches}...", end="", flush=True)
            
            try:
                batch_text = json.dumps(batch_items, ensure_ascii=False)
                result = translate_batch(batch_text, lang, "Islamic parenting mindsets and developmental stages by year")
                result = clean_json(result)
                parsed = json.loads(result)
                
                for i, tr_item in enumerate(parsed):
                    if i < len(batch):
                        orig_idx = batch[i][0]
                        year_key, item_idx = year_map[orig_idx]
                        if isinstance(tr_item, dict):
                            for key, val in tr_item.items():
                                if not key.endswith(suffix):
                                    data[year_key][item_idx][f"{key}{suffix}"] = val
                                else:
                                    data[year_key][item_idx][key] = val
                
                print(f" OK ({len(parsed)})", flush=True)
                
                # Save progress
                with open(filepath, 'w') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    
            except Exception as e:
                print(f" ERROR: {e}", flush=True)
                with open(filepath, 'w') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return False
            
            time.sleep(0.5)
        
        print(f"  {lang_name} complete!", flush=True)
    
    print(f"  ✓ All translations done for {filepath}", flush=True)
    gc.collect()
    return True

# ============================================================
# MAIN EXECUTION
# ============================================================
print("=" * 60, flush=True)
print("TRANSLATION RESUME SCRIPT", flush=True)
print("=" * 60, flush=True)

success_count = 0
fail_count = 0

# 1. fitrah_traits_detailed.json (192 items) - NL done, EN partial
print("\n[1/5] fitrah_traits_detailed.json", flush=True)
if translate_list_file('assets/data/fitrah_traits_detailed.json',
                       "Innate traits (fitrah) of children by age - Islamic development",
                       batch_size=6):
    success_count += 1
else:
    fail_count += 1

# 2. heart_deeds.json (66 items) - NL partial, EN partial
print("\n[2/5] heart_deeds.json", flush=True)
if translate_list_file('assets/data/heart_deeds.json',
                       "Deeds of the heart (a'mal al-qulub) - Islamic spiritual development",
                       batch_size=8):
    success_count += 1
else:
    fail_count += 1

# 3. concepts_tawheed.json (14 items)
print("\n[3/5] concepts_tawheed.json", flush=True)
if translate_list_file('assets/data/concepts_tawheed.json',
                       "Concepts of Tawheed (monotheism) for teaching children",
                       batch_size=7):
    success_count += 1
else:
    fail_count += 1

# 4. tarbiya_rules.json (32 items)
print("\n[4/5] tarbiya_rules.json", flush=True)
if translate_list_file('assets/data/tarbiya_rules.json',
                       "Islamic parenting rules and principles by age group",
                       batch_size=8):
    success_count += 1
else:
    fail_count += 1

# 5. mindsets_update.json (dict structure)
print("\n[5/5] mindsets_update.json", flush=True)
if translate_mindsets_file('assets/data/mindsets_update.json'):
    success_count += 1
else:
    fail_count += 1

print(f"\n{'='*60}", flush=True)
print(f"DONE: {success_count} succeeded, {fail_count} failed", flush=True)
print(f"{'='*60}", flush=True)
