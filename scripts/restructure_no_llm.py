"""
Restructure library books to article format (NO LLM needed):
1. Remove khutbat al-hajah and cover pages
2. Merge consecutive sections with <10 sentences, respecting context
3. Add bismillah + hamd + salah + amma ba'd at the beginning of each chapter
(Tamheed will be added later when LLM API is available)
"""
import json
import os
import re

DATA_DIR = "/home/ubuntu/opvoedadvies_apk/assets/data/library"

BISMILLAH_HEADER = """بسم الله الرحمن الرحيم

الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، نبينا محمد وعلى آله وصحبه أجمعين.

أما بعد:"""

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
    r"^‏?[٠-٩\d]+ ",  # Starts with number + space (like "٣ الإخلاص" which is a cover variant)
    r"^صهيب سلام$",
    r"^صُهَيب سلام$",
    r"^◆",
    r"^۞$",
]


def is_cover_or_khutbah(chapter, idx, total):
    """Check if a chapter is a cover page, khutbah, or metadata to remove."""
    title = chapter.get("title", "").strip()
    sections = chapter.get("sections", [])
    
    for pattern in COVER_PATTERNS:
        if pattern in title:
            return True
    
    for pattern in REMOVE_CHAPTER_PATTERNS:
        if re.match(pattern, title):
            return True
    
    total_content = " ".join(s.get("content", "") for s in sections) if sections else ""
    
    # Khutbah content
    if "إنَّ الحمدَ لله، نَحمَدُه ونستعينُه" in total_content:
        return True
    if "إن الحمد لله نحمده ونستعينه" in total_content:
        return True
    
    # Metadata chapters
    if len(total_content) < 100 and any(p in total_content for p in ["صهيب سلام", "الحقوق محفوظة", "الطبعة", "بقلم", "تأليف"]):
        return True
    
    # Decorative only
    if total_content.strip() in ["◆ ◆ ◆", "❖", "۞", "", "الكتابُ السادسُ", "الكتاب السادس"]:
        return True
    
    # Bismillah-only chapters
    if title == "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" and len(total_content) < 50:
        return True
    
    # First few chapters that are just title/series/number pages
    if idx < 5 and not sections and len(title) < 50:
        # Likely a cover element (title page, number, etc.)
        return True
    
    return False


def count_sentences(text):
    """Count meaningful sentences in text."""
    if not text or not text.strip():
        return 0
    parts = re.split(r'[.،؛!\?؟\n]', text)
    return len([s for s in parts if s.strip() and len(s.strip()) > 10])


def is_same_context(sec1, sec2):
    """Check if two sections are in the same context/topic."""
    title2 = sec2.get("title", "").strip()
    major_indicators = ["الباب", "الفصل", "المبحث", "القسم", "المسار"]
    for ind in major_indicators:
        if title2.startswith(ind):
            return False
    return True


def merge_short_sections(sections):
    """Merge consecutive sections with <10 sentences, respecting context."""
    if not sections:
        return sections
    
    merged = []
    buf = {"title": "", "content": "", "content_nl": "", "content_en": "",
           "title_nl": "", "title_en": "", "count": 0, "sents": 0, "last": None}
    
    def flush():
        if buf["count"] > 0:
            sec = {"title": buf["title"], "content": buf["content"].strip()}
            if buf["title_nl"]:
                sec["title_nl"] = buf["title_nl"]
            if buf["title_en"]:
                sec["title_en"] = buf["title_en"]
            if buf["content_nl"]:
                sec["content_nl"] = buf["content_nl"].strip()
            if buf["content_en"]:
                sec["content_en"] = buf["content_en"].strip()
            merged.append(sec)
        buf["title"] = ""
        buf["content"] = ""
        buf["content_nl"] = ""
        buf["content_en"] = ""
        buf["title_nl"] = ""
        buf["title_en"] = ""
        buf["count"] = 0
        buf["sents"] = 0
        buf["last"] = None
    
    for sec in sections:
        content = sec.get("content", "")
        title = sec.get("title", "")
        sents = count_sentences(content)
        
        if sents >= 10:
            flush()
            merged.append(sec)
        else:
            # Context check
            if buf["count"] > 0 and buf["last"] and not is_same_context(buf["last"], sec):
                flush()
            # Size cap
            if buf["sents"] + sents > 30:
                flush()
            
            # Set title from first section with a title
            if not buf["title"] and title:
                buf["title"] = title
                buf["title_nl"] = sec.get("title_nl", "")
                buf["title_en"] = sec.get("title_en", "")
            
            # Append content
            piece = f"{title}\n{content}" if title and buf["content"] else (content or title)
            buf["content"] += f"\n\n{piece}" if buf["content"] else piece
            
            # Translations
            cnl = sec.get("content_nl", "")
            cen = sec.get("content_en", "")
            tnl = sec.get("title_nl", "")
            ten = sec.get("title_en", "")
            
            piece_nl = f"{tnl}\n{cnl}" if tnl and buf["content_nl"] else (cnl or tnl)
            if piece_nl:
                buf["content_nl"] += f"\n\n{piece_nl}" if buf["content_nl"] else piece_nl
            
            piece_en = f"{ten}\n{cen}" if ten and buf["content_en"] else (cen or ten)
            if piece_en:
                buf["content_en"] += f"\n\n{piece_en}" if buf["content_en"] else piece_en
            
            buf["sents"] += sents
            buf["count"] += 1
            buf["last"] = sec
    
    flush()
    return merged


def process_book(book_file):
    """Process a single book file."""
    filepath = os.path.join(DATA_DIR, book_file)
    with open(filepath) as f:
        book = json.load(f)
    
    chapters = book.get("chapters", [])
    original_count = len(chapters)
    print(f"\n{'='*60}")
    print(f"Processing {book_file}: {original_count} chapters")
    
    # Step 1: Remove cover/khutbah
    content_chapters = []
    for idx, ch in enumerate(chapters):
        if not is_cover_or_khutbah(ch, idx, original_count):
            content_chapters.append(ch)
        else:
            print(f"  [REMOVED] \"{ch.get('title', '')[:50]}\"")
    
    removed = original_count - len(content_chapters)
    print(f"  After removal: {len(content_chapters)} chapters (removed {removed})")
    
    # Step 2: Merge short sections
    total_before = 0
    total_after = 0
    for ch in content_chapters:
        old_secs = ch.get("sections", [])
        total_before += len(old_secs)
        new_secs = merge_short_sections(old_secs)
        ch["sections"] = new_secs
        total_after += len(new_secs)
    
    print(f"  Sections: {total_before} -> {total_after} (merged {total_before - total_after})")
    
    # Step 3: Add bismillah header at start of each chapter
    for ch in content_chapters:
        sections = ch.get("sections", [])
        intro_section = {"title": "", "content": BISMILLAH_HEADER}
        ch["sections"] = [intro_section] + sections
    
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
    
    print(f"\n{'='*60}")
    print(f"ALL DONE: {len(books)} books, {total} total chapters")


if __name__ == "__main__":
    main()
