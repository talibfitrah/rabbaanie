"""
Translate fitrah_tasyeer.json group 0 (0-2 years) traits from Arabic to Dutch and English.
All 47 traits in group 0 have Arabic text in their nl/en fields - this script fixes that.
"""
import json
import os
import time
from openai import OpenAI

client = OpenAI()  # Uses OPENAI_API_KEY and OPENAI_API_BASE from env

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "fitrah_tasyeer.json")

def translate_batch(texts: list[str], target_lang: str, batch_num: int) -> list[str]:
    """Translate a batch of Arabic texts to target language."""
    lang_name = "Nederlands (Dutch)" if target_lang == "nl" else "English"
    
    numbered = "\n---\n".join([f"[{i+1}] {t}" for i, t in enumerate(texts)])
    
    instruction = f"""Translate the following Islamic parenting trait descriptions from Arabic to {lang_name}.
Keep Islamic terms transliterated: salah, du'a, Qur'aan, hadieth, tawheed, fitrah, adhkaar, dhikr, taqwa, imaan.
Keep the same numbered format [1], [2], etc.
Each text is a short description - translate it naturally and accurately.
Output format:
[1] <translation>
[2] <translation>
..."""

    try:
        response = client.chat.completions.create(
            model="claude-haiku-4-5",
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": numbered}
            ],
            max_tokens=4000,
            temperature=0.3,
        )
        content = response.choices[0].message.content or ""
        
        # Parse results
        results = [""] * len(texts)
        import re
        blocks = re.split(r'\[(\d+)\]', content)
        for i in range(1, len(blocks), 2):
            idx = int(blocks[i]) - 1
            if 0 <= idx < len(results):
                results[idx] = blocks[i+1].strip().rstrip("---").strip()
        
        # Fallback: if any result is empty, keep original
        for i in range(len(results)):
            if not results[i]:
                results[i] = texts[i]
        
        return results
    except Exception as e:
        print(f"  Error in batch {batch_num}: {e}")
        return texts


def main():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    group = data["ageGroups"][0]
    traits = group["fitrahTraits"]
    print(f"Translating {len(traits)} traits from group 0 (0-2 years)")
    
    # Collect all texts to translate
    # For each trait: trait name, method, sub_phase, and details fields
    for target_lang in ["nl", "en"]:
        lang_name = "Dutch" if target_lang == "nl" else "English"
        print(f"\n=== Translating to {lang_name} ===")
        
        # 1. Translate trait names (short texts)
        trait_names = [t["trait"]["ar"] for t in traits]
        print(f"  Translating {len(trait_names)} trait names...")
        # Batch in groups of 15
        translated_names = []
        for i in range(0, len(trait_names), 15):
            batch = trait_names[i:i+15]
            result = translate_batch(batch, target_lang, i//15)
            translated_names.extend(result)
            time.sleep(0.5)
        
        # 2. Translate methods (longer texts)
        methods = [t["method"]["ar"] for t in traits]
        print(f"  Translating {len(methods)} methods...")
        translated_methods = []
        for i in range(0, len(methods), 8):
            batch = methods[i:i+8]
            result = translate_batch(batch, target_lang, i//8)
            translated_methods.extend(result)
            time.sleep(0.5)
        
        # 3. Translate sub_phase (short texts, many duplicates)
        unique_subphases = list(set(t.get("sub_phase", "") for t in traits if t.get("sub_phase")))
        print(f"  Translating {len(unique_subphases)} unique sub_phases...")
        if unique_subphases:
            translated_subphases_list = translate_batch(unique_subphases, target_lang, 0)
            subphase_map = dict(zip(unique_subphases, translated_subphases_list))
        else:
            subphase_map = {}
        time.sleep(0.5)
        
        # 4. Translate details fields
        detail_keys = ["self_leadership", "emotions", "patience", "sincerity", "love_fear", "time_management"]
        for dk in detail_keys:
            detail_texts = []
            detail_indices = []
            for i, t in enumerate(traits):
                if t.get("details") and t["details"].get(dk):
                    detail_texts.append(t["details"][dk])
                    detail_indices.append(i)
            
            if detail_texts:
                print(f"  Translating {len(detail_texts)} '{dk}' details...")
                translated_details = []
                for i in range(0, len(detail_texts), 8):
                    batch = detail_texts[i:i+8]
                    result = translate_batch(batch, target_lang, i//8)
                    translated_details.extend(result)
                    time.sleep(0.5)
                
                # Store translations in a new field
                for j, idx in enumerate(detail_indices):
                    if "details_tr" not in traits[idx]:
                        traits[idx]["details_tr"] = {}
                    if target_lang not in traits[idx]["details_tr"]:
                        traits[idx]["details_tr"][target_lang] = {}
                    traits[idx]["details_tr"][target_lang][dk] = translated_details[j]
        
        # Apply translations
        for i, t in enumerate(traits):
            t["trait"][target_lang] = translated_names[i]
            t["method"][target_lang] = translated_methods[i]
            if t.get("sub_phase") and t["sub_phase"] in subphase_map:
                if "sub_phase_tr" not in t:
                    t["sub_phase_tr"] = {}
                t["sub_phase_tr"][target_lang] = subphase_map[t["sub_phase"]]
    
    # Save back
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\nDone! Updated {DATA_PATH}")


if __name__ == "__main__":
    main()
