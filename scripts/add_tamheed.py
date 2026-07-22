"""
Add tamheed (introduction) to each chapter that already has bismillah header.
Uses the correct OPENAI_API_BASE endpoint.
"""
import json
import os
import re
import time
from openai import OpenAI

client = OpenAI()  # auto-reads OPENAI_API_KEY and OPENAI_API_BASE from env
DATA_DIR = "/home/ubuntu/opvoedadvies_apk/assets/data/library"

BISMILLAH_HEADER = """بسم الله الرحمن الرحيم

الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، نبينا محمد وعلى آله وصحبه أجمعين.

أما بعد:"""


def generate_tamheed(prev_chapter_title, prev_chapter_summary, current_chapter_title, current_first_content):
    """Generate a tamheed that links previous chapter to current."""
    if not prev_chapter_title:
        prompt = f"""اكتب تمهيداً قصيراً (2-3 جمل) يدخل القارئ في موضوع هذا المقال.
عنوان المقال: {current_chapter_title}
بداية المحتوى: {current_first_content[:300]}

اكتب التمهيد فقط بدون أي مقدمات. لا تكتب البسملة ولا الحمد."""
    else:
        prompt = f"""اكتب تمهيداً قصيراً (2-3 جمل) يلخص المقال السابق ويدخل في المقال الحالي.
المقال السابق: {prev_chapter_title}
ملخص المقال السابق: {prev_chapter_summary[:200]}
المقال الحالي: {current_chapter_title}
بداية المحتوى الحالي: {current_first_content[:300]}

اكتب التمهيد فقط. لا تكتب البسملة ولا الحمد. ابدأ بربط المقال السابق بالحالي."""
    
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model="gpt-5-nano",
                messages=[{"role": "user", "content": prompt}],
                max_completion_tokens=200,
                temperature=0.7,
            )
            result = resp.choices[0].message.content
            return result.strip() if result else ""
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
            else:
                print(f"  [WARN] Failed: {e}")
                return ""


def get_chapter_summary(chapter):
    """Get a brief summary of chapter content."""
    sections = chapter.get("sections", [])
    all_content = ""
    for sec in sections[1:4]:  # Skip bismillah section
        all_content += sec.get("title", "") + " " + sec.get("content", "") + " "
        if len(all_content) > 400:
            break
    return all_content[:400]


def process_book(book_file):
    """Add tamheed to each chapter of a book."""
    filepath = os.path.join(DATA_DIR, book_file)
    with open(filepath) as f:
        book = json.load(f)
    
    chapters = book.get("chapters", [])
    print(f"\n{'='*50}")
    print(f"Adding tamheed to {book_file}: {len(chapters)} chapters")
    
    prev_title = ""
    prev_summary = ""
    modified = 0
    
    for i, ch in enumerate(chapters):
        sections = ch.get("sections", [])
        if not sections:
            continue
        
        # Check if first section is the bismillah header (already added)
        first_content = sections[0].get("content", "")
        if "أما بعد:" not in first_content:
            continue
        
        # Get content from second section onwards
        ch_title = ch.get("title", "")
        next_content = sections[1].get("content", "") if len(sections) > 1 else ""
        
        # Generate tamheed
        tamheed = generate_tamheed(prev_title, prev_summary, ch_title, next_content)
        
        if tamheed:
            # Append tamheed after "أما بعد:"
            sections[0]["content"] = BISMILLAH_HEADER + f"\n\n{tamheed}"
            modified += 1
        
        prev_title = ch_title
        prev_summary = get_chapter_summary(ch)
        
        if (i + 1) % 5 == 0:
            print(f"  {i+1}/{len(chapters)} chapters...")
    
    # Save
    with open(filepath, "w") as f:
        json.dump(book, f, ensure_ascii=False, indent=2)
    
    print(f"  DONE: {modified}/{len(chapters)} chapters got tamheed")
    return modified


def main():
    books = sorted([f for f in os.listdir(DATA_DIR) if f.startswith("book_") and f.endswith(".json")])
    print(f"Found {len(books)} books")
    
    total = 0
    for book_file in books:
        total += process_book(book_file)
        time.sleep(0.5)
    
    print(f"\n{'='*50}")
    print(f"ALL DONE: {total} chapters got tamheed")


if __name__ == "__main__":
    main()
