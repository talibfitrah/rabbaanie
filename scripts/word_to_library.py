#!/usr/bin/env python3
"""
Extract Word files, convert to library JSON structure, and translate to NL+EN.
Processes one file at a time to save memory.
Saves progress after each section translation.
"""
import json
import os
import sys
import time
import re
from pathlib import Path
from docx import Document
from openai import OpenAI

client = OpenAI()
BASE_DIR = Path("/home/ubuntu/opvoedadvies_apk")
UPLOAD_DIR = Path("/home/ubuntu/upload")
LIBRARY_DIR = BASE_DIR / "assets/data/library"
PROGRESS_FILE = BASE_DIR / "scripts/.word_translate_progress.json"

# Map Word files to book IDs (starting from 11)
WORD_FILES = [
    # Part 2 - Marriage (ج2)
    {"file": "08_ج2-الزواج_اختيار-الزوج-ومدخل-حكم-الزواج-وفوائده.docx", "id": 11, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 8},
    {"file": "09_ج2_الخطبة-والأسئلة-عند-التعارف.docx", "id": 12, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 9},
    {"file": "10_ج2_الإعداد-للزفاف-والوليمة-وعقد-الزواج-والمهر.docx", "id": 13, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 10},
    {"file": "11_ج2_الليلة-الأولى-وأنواع-الزيجات.docx", "id": 14, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 11},
    {"file": "12_ج2_بناء-العلاقة-الزوجية-المراحل-والأركان-والحقوق-والمنافع.docx", "id": 15, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 12},
    {"file": "13_ج2_التواصل-والتربية-بين-الزوجين-المفاتيح-والتقارب.docx", "id": 16, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 13},
    {"file": "14_ج2_مشكلات-الزواج-وحلولها-الخلافات-والشقاق.docx", "id": 17, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 14},
    {"file": "15_ج2_الطلاق-وفسخ-الزواج-الظهار-والخلع-والعدة.docx", "id": 18, "category": "الزواج", "series": "سلسلة فقه الأسرة", "series_num": 15},
    # Part 3 - Children (ج3)
    {"file": "16_ج3-الولد_تمهيد-ما-التربية-والوسائل-والتهيؤ-وصفات-المربي.docx", "id": 19, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 16},
    {"file": "17_ج3_مجالات-التربية-وعوامل-التأثير.docx", "id": 20, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 17},
    {"file": "18_ج3_حقوق-الولد-الاثنا-عشر-حقا-وتطبيقها.docx", "id": 21, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 18},
    {"file": "19_ج3_صفات-الولد-حسب-المراحل-العمرية.docx", "id": 22, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 19},
    {"file": "20_ج3_الحمل-والولادة.docx", "id": 23, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 20},
    {"file": "21_ج3_تنظيم-الحمل-والرضاعة-والإجهاض-ومراجعات-الحقوق.docx", "id": 24, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 21},
    {"file": "22_ج3_تربية-العقيدة.docx", "id": 25, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 22},
    {"file": "23_ج3_تربية-العبادة-الصلاة-والزكاة-والصيام-والقرآن.docx", "id": 26, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 23},
    {"file": "24_ج3_التربية-الاجتماعية.docx", "id": 27, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 24},
    {"file": "25_ج3_التربية-السلوكية.docx", "id": 28, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 25},
    {"file": "26_ج3_التربية-العاطفية.docx", "id": 29, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 26},
    {"file": "27_ج3_التربية-البدنية.docx", "id": 30, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 27},
    {"file": "28_ج3_التربية-الفكرية.docx", "id": 31, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 28},
    {"file": "29_ج3_التربية-الصحية.docx", "id": 32, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 29},
    {"file": "30_ج3_التعليم-المنزلي.docx", "id": 33, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 30},
    {"file": "31_ج3_التربية-الجنسية.docx", "id": 34, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 31},
    {"file": "32_ج3_التربية-المالية.docx", "id": 35, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 32},
    {"file": "33_ج3_تربية-وسائل-الإعلام.docx", "id": 36, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 33},
    {"file": "34_ج3_تربية-النقاش.docx", "id": 37, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 34},
    {"file": "35_ج3_تربية-الوقت.docx", "id": 38, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 35},
    {"file": "36_ج3_أساليب-التحفيز-وإدارة-النزاعات.docx", "id": 39, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 36},
    {"file": "37_ج3_العقاب-وأنواعه-الهجر-والتوبيخ-والضرب.docx", "id": 40, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 37},
    {"file": "38_ج3_طرق-التأثير-في-السلوك-وتشكيل-العقل.docx", "id": 41, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 38},
    {"file": "39_ج3_التزكية-وتشكيل-القلب.docx", "id": 42, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 39},
    {"file": "40_ج3_تطبيقات-المراحل-والمشكلات-السلوكية-وصور-العمل.docx", "id": 43, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 40},
    {"file": "41_ج3_الدعوة.docx", "id": 44, "category": "تربية الأولاد", "series": "سلسلة فقه الأسرة", "series_num": 41},
    # Special files
    {"file": "الجامع_المحرر_مع_الهدايات_والتفعيل.docx", "id": 45, "category": "الجامع", "series": "سلسلة فقه الأسرة", "series_num": 42},
    {"file": "السنن_الكونية_موسوعة_علمية-16.docx", "id": 46, "category": "السنن الكونية", "series": "سلسلة فقه الأسرة", "series_num": 43},
    {"file": "الطرقوالوسائلالتربوية-كاملالطرق٤٤-6.docx", "id": 47, "category": "الطرق التربوية", "series": "سلسلة فقه الأسرة", "series_num": 44},
    {"file": "قيادةالعواطفوهيكلالتفكير.docx", "id": 48, "category": "قيادة النفس", "series": "سلسلة فقه الأسرة", "series_num": 45},
]

def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"completed_books": [], "current_book": None, "current_section": 0}

def save_progress(progress):
    PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False))

def extract_title_from_filename(filename):
    """Extract a clean Arabic title from the filename."""
    name = filename.replace(".docx", "")
    # Remove number prefix
    name = re.sub(r'^\d+_', '', name)
    # Remove part prefix
    name = re.sub(r'^ج\d+[-_]?', '', name)
    # Replace hyphens/underscores with spaces
    name = name.replace('-', ' ').replace('_', ' ')
    return name.strip()

def extract_word_content(filepath):
    """Extract content from Word file, splitting into chapters/sections."""
    doc = Document(filepath)
    
    paragraphs = []
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        # Detect headings by style
        style = p.style.name if p.style else ""
        is_heading = "Heading" in style or "heading" in style
        # Also detect bold-only paragraphs as potential headings
        is_bold = all(run.bold for run in p.runs if run.text.strip()) and len(p.runs) > 0 and len(text) < 100
        paragraphs.append({
            "text": text,
            "is_heading": is_heading or is_bold,
            "level": int(style.replace("Heading ", "").replace("heading ", "")) if "Heading" in style or "heading" in style else (1 if is_bold else 0)
        })
    
    if not paragraphs:
        return []
    
    # Split into chapters based on level-1 headings
    chapters = []
    current_chapter = {"title": "", "sections": []}
    current_section = {"title": "", "content_parts": []}
    
    for p in paragraphs:
        if p["is_heading"] and p["level"] <= 1:
            # Save current section
            if current_section["content_parts"]:
                current_chapter["sections"].append({
                    "title": current_section["title"],
                    "content": "\n".join(current_section["content_parts"])
                })
            # Save current chapter if it has content
            if current_chapter["sections"] or current_chapter["title"]:
                if not current_chapter["sections"] and current_chapter["title"]:
                    # Chapter with no sections yet, skip
                    pass
                else:
                    chapters.append(current_chapter)
            # Start new chapter
            current_chapter = {"title": p["text"], "sections": []}
            current_section = {"title": "", "content_parts": []}
        elif p["is_heading"] and p["level"] >= 2:
            # Save current section
            if current_section["content_parts"]:
                current_chapter["sections"].append({
                    "title": current_section["title"],
                    "content": "\n".join(current_section["content_parts"])
                })
            # Start new section
            current_section = {"title": p["text"], "content_parts": []}
        else:
            current_section["content_parts"].append(p["text"])
    
    # Save last section and chapter
    if current_section["content_parts"]:
        current_chapter["sections"].append({
            "title": current_section["title"],
            "content": "\n".join(current_section["content_parts"])
        })
    if current_chapter["sections"]:
        chapters.append(current_chapter)
    
    # If no chapters found, treat entire document as one chapter
    if not chapters:
        all_text = "\n".join(p["text"] for p in paragraphs)
        # Split into sections of ~2000 chars
        sections = []
        words = all_text.split("\n")
        current = []
        current_len = 0
        for w in words:
            current.append(w)
            current_len += len(w)
            if current_len > 2000:
                sections.append({"title": "", "content": "\n".join(current)})
                current = []
                current_len = 0
        if current:
            sections.append({"title": "", "content": "\n".join(current)})
        chapters = [{"title": extract_title_from_filename(filepath.name), "sections": sections}]
    
    # Merge very small sections (< 200 chars) with previous
    for ch in chapters:
        merged = []
        for s in ch["sections"]:
            if merged and len(s["content"]) < 200 and not s["title"]:
                merged[-1]["content"] += "\n" + s["content"]
            else:
                merged.append(s)
        ch["sections"] = merged
    
    return chapters

def translate_text(text, target_lang, context="Islamic education"):
    """Translate text using LLM."""
    if not text or len(text.strip()) < 3:
        return text
    
    lang_name = "Dutch" if target_lang == "nl" else "English"
    
    # Truncate very long texts to avoid token limits
    max_chars = 6000
    if len(text) > max_chars:
        # Split and translate in parts
        parts = []
        for i in range(0, len(text), max_chars):
            part = text[i:i+max_chars]
            translated = _do_translate(part, lang_name, context)
            parts.append(translated)
        return "\n".join(parts)
    
    return _do_translate(text, lang_name, context)

def _do_translate(text, lang_name, context):
    """Single translation call."""
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model="gpt-5-mini",
                messages=[
                    {"role": "system", "content": f"Translate the following Arabic text to {lang_name}. Context: {context}. Keep Islamic terms transliterated (e.g., Allaah, salaat, fitrah, tawheed). Preserve paragraph structure. Output ONLY the translation."},
                    {"role": "user", "content": text}
                ],
                max_completion_tokens=8000,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt < 2:
                time.sleep(5)
            else:
                print(f"    Translation failed: {e}")
                return text
    return text

def translate_title(title, target_lang):
    """Translate a short title."""
    if not title or len(title.strip()) < 2:
        return title
    return translate_text(title, target_lang, "Islamic book chapter/section title")

def process_book(book_info, progress):
    """Process a single Word file: extract, structure, and translate."""
    book_id = book_info["id"]
    filename = book_info["file"]
    filepath = UPLOAD_DIR / filename
    output_path = LIBRARY_DIR / f"book_{book_id}.json"
    
    print(f"\n{'='*60}")
    print(f"Processing book {book_id}: {filename}")
    print(f"{'='*60}")
    
    # Check if already fully done
    if book_id in progress.get("completed_books", []):
        print(f"  Already completed, skipping.")
        return True
    
    # Load existing book data or extract from Word
    if output_path.exists():
        book_data = json.loads(output_path.read_text())
        print(f"  Loaded existing: {len(book_data['chapters'])} chapters")
    else:
        # Extract from Word
        if not filepath.exists():
            print(f"  ERROR: File not found: {filepath}")
            return False
        
        print(f"  Extracting from Word...")
        chapters = extract_word_content(filepath)
        title_ar = extract_title_from_filename(filename)
        
        total_words = sum(len(s["content"].split()) for ch in chapters for s in ch["sections"])
        
        book_data = {
            "id": book_id,
            "title_ar": title_ar,
            "title_en": "",
            "title_nl": "",
            "series": book_info["series"],
            "series_num": book_info["series_num"],
            "category": book_info["category"],
            "total_chapters": len(chapters),
            "total_words": total_words,
            "chapters": chapters,
        }
        
        # Save initial extraction
        output_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2))
        print(f"  Extracted: {len(chapters)} chapters, {total_words} words")
    
    # Translate book title if needed
    if not book_data.get("title_nl"):
        book_data["title_nl"] = translate_title(book_data["title_ar"], "nl")
        book_data["title_en"] = translate_title(book_data["title_ar"], "en")
        output_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2))
        print(f"  Title NL: {book_data['title_nl']}")
        print(f"  Title EN: {book_data['title_en']}")
    
    # Translate chapters and sections
    total_sections = sum(len(ch["sections"]) for ch in book_data["chapters"])
    translated_sections = sum(1 for ch in book_data["chapters"] for s in ch["sections"] if s.get("content_nl"))
    
    if translated_sections >= total_sections:
        print(f"  All {total_sections} sections already translated!")
        progress["completed_books"].append(book_id)
        save_progress(progress)
        return True
    
    print(f"  Translating sections: {translated_sections}/{total_sections} done")
    
    section_count = 0
    for ci, chapter in enumerate(book_data["chapters"]):
        # Translate chapter title
        if not chapter.get("title_nl") and chapter.get("title"):
            chapter["title_nl"] = translate_title(chapter["title"], "nl")
            chapter["title_en"] = translate_title(chapter["title"], "en")
        
        for si, section in enumerate(chapter["sections"]):
            section_count += 1
            
            if section.get("content_nl") and section.get("content_en"):
                continue
            
            # Translate section title
            if section.get("title") and not section.get("title_nl"):
                section["title_nl"] = translate_title(section["title"], "nl")
                section["title_en"] = translate_title(section["title"], "en")
            
            # Translate content
            content = section.get("content", "")
            if not content:
                continue
            
            if not section.get("content_nl"):
                print(f"  Ch{ci+1}/S{si+1} NL ({len(content)} chars)...", end="", flush=True)
                section["content_nl"] = translate_text(content, "nl")
                print(" OK")
            
            if not section.get("content_en"):
                print(f"  Ch{ci+1}/S{si+1} EN ({len(content)} chars)...", end="", flush=True)
                section["content_en"] = translate_text(content, "en")
                print(" OK")
            
            # Save after every 3 sections
            if section_count % 3 == 0:
                output_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2))
    
    # Final save
    output_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2))
    progress["completed_books"].append(book_id)
    save_progress(progress)
    print(f"  ✓ Book {book_id} complete!")
    return True

def update_library_index():
    """Update index.json with new books."""
    index_path = LIBRARY_DIR / "index.json"
    existing = json.loads(index_path.read_text())
    existing_ids = {b["id"] for b in existing}
    
    # Add new books
    for book_info in WORD_FILES:
        book_id = book_info["id"]
        if book_id in existing_ids:
            continue
        
        book_path = LIBRARY_DIR / f"book_{book_id}.json"
        if not book_path.exists():
            continue
        
        book_data = json.loads(book_path.read_text())
        entry = {
            "id": book_id,
            "title_ar": book_data.get("title_ar", ""),
            "title_en": book_data.get("title_en", ""),
            "title_nl": book_data.get("title_nl", ""),
            "series": book_data.get("series", ""),
            "series_num": book_data.get("series_num", 0),
            "category": book_data.get("category", ""),
            "total_chapters": book_data.get("total_chapters", 0),
            "total_words": book_data.get("total_words", 0),
            "chapter_titles": [ch.get("title", "") for ch in book_data.get("chapters", [])],
            "series_nl": "Serie Gezinswetenschappen",
            "series_en": "Family Jurisprudence Series",
        }
        existing.append(entry)
        print(f"  Added book {book_id} to index: {entry['title_ar'][:40]}")
    
    # Sort by id
    existing.sort(key=lambda b: b["id"])
    index_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    print(f"  Index updated: {len(existing)} books total")

def main():
    print("=" * 60)
    print("WORD FILES → LIBRARY TRANSLATION")
    print("=" * 60)
    
    progress = load_progress()
    completed = progress.get("completed_books", [])
    print(f"Previously completed: {len(completed)} books")
    
    # Process each file
    success = 0
    failed = 0
    for book_info in WORD_FILES:
        try:
            if process_book(book_info, progress):
                success += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ERROR processing {book_info['file']}: {e}")
            failed += 1
            # Save what we have
            continue
    
    # Update index
    print(f"\n{'='*60}")
    print("Updating library index...")
    update_library_index()
    
    print(f"\n{'='*60}")
    print(f"DONE: {success} succeeded, {failed} failed")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
