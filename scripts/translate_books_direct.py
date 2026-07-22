#!/usr/bin/env python3
"""
Translate all book sections directly using the built-in LLM API.
Processes sections concurrently with retry logic.
"""
import json, os, sys, time, re
import concurrent.futures as cf
from openai import OpenAI

client = OpenAI()
MODEL = "gpt-5-mini"  # Best for translation at scale

BOOKS_DIR = '/home/ubuntu/opvoedadvies_apk/assets/data/library'
PROGRESS_FILE = '/tmp/translation_progress.json'
BOOKS_TO_TRANSLATE = [1, 2, 3, 5, 6, 7, 8, 9, 10]

SYSTEM_PROMPT = """You are a professional translator specializing in Islamic educational texts.
Translate the Arabic text COMPLETELY and FAITHFULLY into both Dutch and English.

RULES:
1. Translate EVERYTHING - every single word and sentence
2. Keep these Islamic terms transliterated: Tawhied, Fitrah, Sabr, Ikhlaas, Tarbiyah, Dhikr, 'Ibaadah, Tawbah, Khushoo', Taqwaa, Birr, Ihsaan, Sunnah, Hadieth, Fiqh, Shirk, Kufr, Nifaaq, Salaah, Zakaat, Sawm, Hajj, Wudoo, Da'wah, Ummah, Halaal, Haraam, Ruqyah
3. Keep Qur'anic Arabic text as-is, followed by translation in parentheses
4. Keep hadith references (البخاري/مسلم numbers) as-is
5. Maintain paragraph structure

Output ONLY valid JSON with exactly two keys: "nl" and "en"."""

def translate_section(content):
    """Translate a single section, returns (nl, en) or None on failure."""
    # Truncate very long content to avoid token limits
    if len(content) > 4000:
        content = content[:4000]
    
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": content},
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
                print(f"  Failed after 3 attempts: {str(e)[:80]}")
                return None
    return None

def load_progress():
    """Load progress tracking file."""
    if os.path.exists(PROGRESS_FILE):
        return json.load(open(PROGRESS_FILE))
    return {}

def save_progress(progress):
    """Save progress tracking file."""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)

def process_book(book_num):
    """Process all untranslated sections in a book."""
    path = f'{BOOKS_DIR}/book_{book_num}.json'
    if not os.path.exists(path):
        return
    
    book = json.load(open(path))
    progress = load_progress()
    
    # Collect sections needing translation
    tasks = []
    for ch_idx, ch in enumerate(book.get('chapters', [])):
        for sec_idx, sec in enumerate(ch.get('sections', [])):
            content = sec.get('content', '')
            if content and not sec.get('content_nl'):
                key = f'b{book_num}_c{ch_idx}_s{sec_idx}'
                if key not in progress:
                    tasks.append((ch_idx, sec_idx, content, key))
    
    if not tasks:
        print(f"  Book {book_num}: All sections already translated!")
        return
    
    print(f"  Book {book_num}: {len(tasks)} sections to translate")
    
    translated_count = 0
    
    def do_translate(task):
        ch_idx, sec_idx, content, key = task
        result = translate_section(content)
        return (ch_idx, sec_idx, key, result)
    
    # Process concurrently
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(do_translate, t) for t in tasks]
        for i, future in enumerate(cf.as_completed(futures)):
            ch_idx, sec_idx, key, result = future.result()
            if result:
                nl, en = result
                book['chapters'][ch_idx]['sections'][sec_idx]['content_nl'] = nl
                book['chapters'][ch_idx]['sections'][sec_idx]['content_en'] = en
                progress[key] = True
                translated_count += 1
            
            # Save every 20 sections
            if (i + 1) % 20 == 0:
                with open(path, 'w') as f:
                    json.dump(book, f, ensure_ascii=False, indent=2)
                save_progress(progress)
                print(f"    Progress: {i+1}/{len(tasks)} ({translated_count} translated)")
    
    # Final save
    with open(path, 'w') as f:
        json.dump(book, f, ensure_ascii=False, indent=2)
    save_progress(progress)
    print(f"  Book {book_num}: Done! {translated_count}/{len(tasks)} translated")

if __name__ == '__main__':
    # Allow specifying which books to process
    if len(sys.argv) > 1:
        books = [int(x) for x in sys.argv[1:]]
    else:
        books = BOOKS_TO_TRANSLATE
    
    print(f"Starting translation for books: {books}")
    for book_num in books:
        print(f"\nProcessing Book {book_num}...")
        process_book(book_num)
    
    print("\n=== Final Status ===")
    for book_num in BOOKS_TO_TRANSLATE:
        path = f'{BOOKS_DIR}/book_{book_num}.json'
        if not os.path.exists(path):
            continue
        book = json.load(open(path))
        total = sum(1 for ch in book.get('chapters', []) for sec in ch.get('sections', []) if sec.get('content'))
        done = sum(1 for ch in book.get('chapters', []) for sec in ch.get('sections', []) if sec.get('content_nl'))
        print(f"  Book {book_num}: {done}/{total} ({100*done//max(total,1)}%)")
