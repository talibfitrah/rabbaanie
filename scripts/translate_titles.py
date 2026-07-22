#!/usr/bin/env python3
"""Translate chapter titles and section titles for all books."""
import json, sys, time
from openai import OpenAI

client = OpenAI()
MODEL = "gpt-5-nano"  # Titles are short, nano is fine

BOOKS_DIR = '/home/ubuntu/opvoedadvies_apk/assets/data/library'

def translate_text(text):
    """Translate a short text to Dutch and English."""
    if not text or not text.strip():
        return '', ''
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": "Translate the Arabic text to Dutch and English. Keep Islamic terms transliterated (Tawhied, Fitrah, Sabr, Ikhlaas, etc). Output JSON with keys 'nl' and 'en'."},
                    {"role": "user", "content": text},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "translation",
                        "strict": True,
                        "schema": {
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
            )
            result = json.loads(resp.choices[0].message.content)
            return result.get('nl', ''), result.get('en', '')
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed: {str(e)[:60]}")
                return '', ''
    return '', ''

def process_book(book_num):
    path = f'{BOOKS_DIR}/book_{book_num}.json'
    book = json.load(open(path))
    modified = False
    
    # Translate chapter titles
    for ch in book.get('chapters', []):
        title = ch.get('title', '')
        if title and not ch.get('title_nl'):
            nl, en = translate_text(title)
            if nl:
                ch['title_nl'] = nl
                ch['title_en'] = en
                modified = True
                print(f"  Ch: {title[:40]} -> {nl[:40]}")
        
        # Translate section titles
        for sec in ch.get('sections', []):
            sec_title = sec.get('title', '')
            if sec_title and not sec.get('title_nl'):
                nl, en = translate_text(sec_title)
                if nl:
                    sec['title_nl'] = nl
                    sec['title_en'] = en
                    modified = True
    
    if modified:
        with open(path, 'w') as f:
            json.dump(book, f, ensure_ascii=False, indent=2)
    
    # Count results
    total_ch = len(book.get('chapters', []))
    done_ch = sum(1 for ch in book.get('chapters', []) if ch.get('title_nl'))
    print(f"  Book {book_num}: {done_ch}/{total_ch} chapter titles done")

if __name__ == '__main__':
    books = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else [3,5,6,7,9,10]
    for b in books:
        print(f"Processing book {b} titles...")
        process_book(b)
    print("Done!")
