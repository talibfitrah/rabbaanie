"""
Restructure library books to article format:
1. Remove khutbat al-hajah and cover pages
2. Merge consecutive sections with <10 sentences, respecting context/meaning
3. Add bismillah + hamd + salah + amma ba'd at the beginning of each chapter
4. Generate a tamheed (intro) for each chapter using LLM

Processes books one at a time to conserve memory.
"""
import json
import os
import re
import time
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8222/v1")
DATA_DIR = "/home/ubuntu/opvoedadvies_apk/assets/data/library"

BISMILLAH_HEADER = """بسم الله الرحمن الرحيم

الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، نبينا محمد وعلى آله وصحبه أجمعين.

أما بعد:"""

# Patterns to identify cover/khutbah chapters to remove
COVER_PATTERNS = [
    "سلسلة فقه الأسرة",
    "سلسلةُ فقهِ الأُسرةِ",
    "سلسلةُ فقهِ الأسرةِ",
    "خُطْبَةُ الحاجَة",
    "خطبة الحاجة",
]

REMOVE_CHAPTER_PATTERNS = [
    r"^[٠-٩\d]+$",
    r"^\([٠-٩\d]+\)$",
    r"^صهيب سلام$",
    r"^صُهَيب سلام$",
    r"^◆",
    r"^۞$",
]


def is_cover_or_khutbah(chapter):
    """Check if a chapter is a cover page, khutbah, or metadata to remove."""
    title = chapter.get("title", "").strip()
    sections = chapter.get("sections", [])
    
    for pattern in COVER_PATTERNS:
        if pattern in title:
            return True
    
    for pattern in REMOVE_CHAPTER_PATTERNS:
        if re.match(pattern, title):
            return True
    
    if not sections:
        total_content = ""
    else:
        total_content = " ".join(s.get("content", "") for s in sections)
    
    # Check if content contains khutbah
    if "إنَّ الحمدَ لله، نَحمَدُه ونستعينُه" in total_content:
        return True
    if "إن الحمد لله نحمده ونستعينه" in total_content:
        return True
    
    # Very short chapters that are just metadata
    if len(total_content) < 100 and any(p in total_content for p in ["صهيب سلام", "الحقوق محفوظة", "الطبعة", "بقلم"]):
        return True
    
    # Chapters with only decorative content
    if total_content.strip() in ["◆ ◆ ◆", "❖", "۞", ""]:
        return True
    
    # Bismillah-only chapters (no real content beyond it)
    if title == "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" and len(total_content) < 50:
        return True
    
    return False


def count_sentences(text):
    """Count meaningful sentences in text."""
    if not text or not text.strip():
        return 0
    # Split on sentence-ending punctuation
    parts = re.split(r'[.،؛!\?؟]', text)
    # Also count newline-separated lines as sentences
    for part in text.split('\n'):
        if part.strip() and len(part.strip()) > 15:
            parts.append(part)
    return len([s for s in parts if s.strip() and len(s.strip()) > 10])


def is_same_context(sec1, sec2):
    """Check if two sections are in the same context/topic."""
    title1 = sec1.get("title", "").strip()
    title2 = sec2.get("title", "").strip()
    
    # If sec2 has a major heading indicator, it's a new context
    major_indicators = ["الباب", "الفصل", "المبحث", "القسم", "المسار"]
    for ind in major_indicators:
        if title2.startswith(ind):
            return False
    
    # If sec2 title starts with a numbering that resets (أولاً, ثانياً etc at top level)
    # but the previous section was also numbered, they're in the same context
    
    return True


def merge_short_sections(sections):
    """Merge consecutive sections with <10 sentences, respecting context."""
    if not sections:
        return sections
    
    merged = []
    buffer_title = ""
    buffer_content = ""
    buffer_content_nl = ""
    buffer_content_en = ""
    buffer_title_nl = ""
    buffer_title_en = ""
    buffer_sentence_count = 0
    buffer_count = 0
    last_sec_in_buffer = None
    
    def flush_buffer():
        nonlocal buffer_title, buffer_content, buffer_content_nl, buffer_content_en
        nonlocal buffer_title_nl, buffer_title_en, buffer_count, buffer_sentence_count, last_sec_in_buffer
        if buffer_count > 0:
            merged_sec = {
                "title": buffer_title,
                "content": buffer_content.strip(),
            }
            if buffer_title_nl:
                merged_sec["title_nl"] = buffer_title_nl
            if buffer_title_en:
                merged_sec["title_en"] = buffer_title_en
            if buffer_content_nl:
                merged_sec["content_nl"] = buffer_content_nl.strip()
            if buffer_content_en:
                merged_sec["content_en"] = buffer_content_en.strip()
            merged.append(merged_sec)
        buffer_title = ""
        buffer_content = ""
        buffer_content_nl = ""
        buffer_content_en = ""
        buffer_title_nl = ""
        buffer_title_en = ""
        buffer_count = 0
        buffer_sentence_count = 0
        last_sec_in_buffer = None
    
    for sec in sections:
        content = sec.get("content", "")
        title = sec.get("title", "")
        sents = count_sentences(content)
        
        if sents >= 10:
            # This section is long enough on its own
            flush_buffer()
            merged.append(sec)
        else:
            # Short section - try to merge
            # Check context compatibility
            if buffer_count > 0 and last_sec_in_buffer and not is_same_context(last_sec_in_buffer, sec):
                # Different context - flush and start new buffer
                flush_buffer()
            
            # Check if adding this would make buffer too long (cap at ~30 sentences)
            if buffer_sentence_count + sents > 30:
                flush_buffer()
            
            # Add to buffer
            if not buffer_title and title:
                buffer_title = title
                buffer_title_nl = sec.get("title_nl", "")
                buffer_title_en = sec.get("title_en", "")
            
            # Append content with title as sub-heading
            if title and buffer_content:
                buffer_content += f"\n\n{title}\n{content}" if content else f"\n\n{title}"
            elif content:
                buffer_content += f"\n\n{content}" if buffer_content else content
            elif title and not buffer_content:
                buffer_content = title
            
            # Also merge translations
            content_nl = sec.get("content_nl", "")
            content_en = sec.get("content_en", "")
            title_nl = sec.get("title_nl", "")
            title_en = sec.get("title_en", "")
            
            if title_nl and buffer_content_nl:
                buffer_content_nl += f"\n\n{title_nl}\n{content_nl}" if content_nl else f"\n\n{title_nl}"
            elif content_nl:
                buffer_content_nl += f"\n\n{content_nl}" if buffer_content_nl else content_nl
            
            if title_en and buffer_content_en:
                buffer_content_en += f"\n\n{title_en}\n{content_en}" if content_en else f"\n\n{title_en}"
            elif content_en:
                buffer_content_en += f"\n\n{content_en}" if buffer_content_en else content_en
            
            buffer_sentence_count += sents
            buffer_count += 1
            last_sec_in_buffer = sec
    
    # Flush remaining
    flush_buffer()
    
    return merged


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
                max_tokens=200,
                temperature=0.7,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
            else:
                print(f"  [WARN] Failed to generate tamheed: {e}")
                return ""


def get_chapter_summary(chapter):
    """Get a brief summary of chapter content."""
    sections = chapter.get("sections", [])
    if not sections:
        return chapter.get("title", "")
    all_content = ""
    for sec in sections[:3]:
        all_content += sec.get("title", "") + " " + sec.get("content", "") + " "
        if len(all_content) > 400:
            break
    return all_content[:400]


def process_book(book_file):
    """Process a single book file."""
    filepath = os.path.join(DATA_DIR, book_file)
    with open(filepath) as f:
        book = json.load(f)
    
    chapters = book.get("chapters", [])
    original_count = len(chapters)
    print(f"\n{'='*60}")
    print(f"Processing {book_file}: {original_count} chapters")
    
    # Step 1: Remove cover/khutbah chapters
    content_chapters = []
    for ch in chapters:
        if not is_cover_or_khutbah(ch):
            content_chapters.append(ch)
        else:
            print(f"  [REMOVED] \"{ch.get('title', '')[:50]}\"")
    
    removed = original_count - len(content_chapters)
    print(f"  After removal: {len(content_chapters)} chapters (removed {removed})")
    
    # Step 2: Merge short sections within each chapter
    total_before = 0
    total_after = 0
    for ch in content_chapters:
        old_sections = ch.get("sections", [])
        total_before += len(old_sections)
        new_sections = merge_short_sections(old_sections)
        ch["sections"] = new_sections
        total_after += len(new_sections)
    
    print(f"  Sections: {total_before} -> {total_after} (merged {total_before - total_after})")
    
    # Step 3: Add bismillah header and generate tamheed
    prev_title = ""
    prev_summary = ""
    
    for i, ch in enumerate(content_chapters):
        sections = ch.get("sections", [])
        first_content = sections[0].get("content", "") if sections else ""
        ch_title = ch.get("title", "")
        
        # Generate tamheed
        tamheed = generate_tamheed(prev_title, prev_summary, ch_title, first_content)
        
        # Create intro section
        intro_content = BISMILLAH_HEADER
        if tamheed:
            intro_content += f"\n\n{tamheed}"
        
        intro_section = {"title": "", "content": intro_content}
        ch["sections"] = [intro_section] + sections
        
        prev_title = ch_title
        prev_summary = get_chapter_summary(ch)
        
        if (i + 1) % 5 == 0:
            print(f"  Tamheed: {i+1}/{len(content_chapters)} chapters...")
    
    # Save
    book["chapters"] = content_chapters
    with open(filepath, "w") as f:
        json.dump(book, f, ensure_ascii=False, indent=2)
    
    print(f"  DONE: {book_file} saved with {len(content_chapters)} chapters")
    return len(content_chapters)


def main():
    books = sorted([f for f in os.listdir(DATA_DIR) if f.startswith("book_") and f.endswith(".json")])
    print(f"Found {len(books)} books to process")
    
    total = 0
    for book_file in books:
        total += process_book(book_file)
        time.sleep(1)
    
    print(f"\n{'='*60}")
    print(f"ALL DONE: {len(books)} books, {total} total chapters")


if __name__ == "__main__":
    main()
