#!/usr/bin/env python3
"""Translate chapter and section titles in batches for efficiency."""
import json, sys, time
import concurrent.futures as cf
from openai import OpenAI

client = OpenAI()
MODEL = "gpt-5-mini"
BOOKS_DIR = '/home/ubuntu/opvoedadvies_apk/assets/data/library'

def translate_batch(titles):
    """Translate a batch of titles (up to 20) in one API call."""
    if not titles:
        return []
    
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
    
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": "Translate each numbered Arabic title to Dutch and English. Keep Islamic terms transliterated. Output a JSON array with objects containing 'nl' and 'en' for each title, in the same order."},
                    {"role": "user", "content": numbered},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "translations",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "items": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "nl": {"type": "string"},
                                            "en": {"type": "string"},
                                        },
                                        "required": ["nl", "en"],
                                        "additionalProperties": False,
                                    },
                                },
                            },
                            "required": ["items"],
                            "additionalProperties": False,
                        },
                    },
                },
            )
            result = json.loads(resp.choices[0].message.content)
            items = result.get('items', [])
            # Pad if needed
            while len(items) < len(titles):
                items.append({'nl': '', 'en': ''})
            return items[:len(titles)]
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                print(f"  Batch failed: {str(e)[:60]}")
                return [{'nl': '', 'en': ''} for _ in titles]
    return [{'nl': '', 'en': ''} for _ in titles]

def process_book(book_num):
    path = f'{BOOKS_DIR}/book_{book_num}.json'
    book = json.load(open(path))
    
    # Collect all untranslated titles with their references
    items_to_translate = []  # (type, ch_idx, sec_idx, title)
    
    for ch_idx, ch in enumerate(book.get('chapters', [])):
        if ch.get('title') and not ch.get('title_nl'):
            items_to_translate.append(('ch', ch_idx, -1, ch['title']))
        for sec_idx, sec in enumerate(ch.get('sections', [])):
            if sec.get('title') and not sec.get('title_nl'):
                items_to_translate.append(('sec', ch_idx, sec_idx, sec['title']))
    
    if not items_to_translate:
        print(f"  Book {book_num}: All titles already translated!")
        return
    
    print(f"  Book {book_num}: {len(items_to_translate)} titles to translate")
    
    # Process in batches of 20
    BATCH_SIZE = 20
    batches = [items_to_translate[i:i+BATCH_SIZE] for i in range(0, len(items_to_translate), BATCH_SIZE)]
    
    def do_batch(batch):
        titles = [item[3] for item in batch]
        return translate_batch(titles)
    
    translated = 0
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        futures = [(batch, ex.submit(do_batch, batch)) for batch in batches]
        for batch, future in futures:
            results = future.result()
            for item, result in zip(batch, results):
                typ, ch_idx, sec_idx, _ = item
                nl = result.get('nl', '')
                en = result.get('en', '')
                if nl:
                    if typ == 'ch':
                        book['chapters'][ch_idx]['title_nl'] = nl
                        book['chapters'][ch_idx]['title_en'] = en
                    else:
                        book['chapters'][ch_idx]['sections'][sec_idx]['title_nl'] = nl
                        book['chapters'][ch_idx]['sections'][sec_idx]['title_en'] = en
                    translated += 1
    
    with open(path, 'w') as f:
        json.dump(book, f, ensure_ascii=False, indent=2)
    
    print(f"  Book {book_num}: {translated}/{len(items_to_translate)} titles translated")

if __name__ == '__main__':
    books = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else [3,5,6,7,9,10]
    for b in books:
        print(f"Processing book {b}...")
        process_book(b)
    print("All done!")
