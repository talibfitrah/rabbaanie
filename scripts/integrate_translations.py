#!/usr/bin/env python3
"""Parse downloaded translation files and integrate into book JSON files."""
import json, os, re

TRANSLATIONS_DIR = '/tmp/translations'
BATCHES_DIR = '/tmp/book_batches'
BOOKS_DIR = '/home/ubuntu/opvoedadvies_apk/assets/data/library'

def parse_translation_file(filepath):
    """Parse a translation file with ===SECTION N DUTCH/ENGLISH=== markers."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    sections = {}
    # Find all section markers
    pattern = r'===SECTION (\d+) (DUTCH|ENGLISH)===(.*?)(?====SECTION|\Z)'
    matches = re.findall(pattern, content, re.DOTALL)
    
    for num, lang, text in matches:
        num = int(num)
        if num not in sections:
            sections[num] = {}
        sections[num][lang.lower()] = text.strip()
    
    return sections

# Load all book data
books = {}
for book_num in [1, 2, 3, 5, 6, 7, 8, 9, 10]:
    path = f'{BOOKS_DIR}/book_{book_num}.json'
    if os.path.exists(path):
        books[book_num] = json.load(open(path))

# Process each translation file
total_integrated = 0
for filename in sorted(os.listdir(TRANSLATIONS_DIR)):
    if not filename.endswith('.txt'):
        continue
    
    batch_id = filename.replace('.txt', '')
    batch_num = int(batch_id.replace('batch_', ''))
    
    # Load batch metadata
    batch_path = f'{BATCHES_DIR}/{batch_id}.json'
    if not os.path.exists(batch_path):
        continue
    
    batch = json.load(open(batch_path))
    section_ids = batch['section_ids']
    
    # Parse translations
    translations = parse_translation_file(f'{TRANSLATIONS_DIR}/{filename}')
    
    # Map translations to sections
    for idx, section_id in enumerate(section_ids):
        sec_num = idx + 1  # 1-indexed in translation file
        if sec_num not in translations:
            continue
        
        trans = translations[sec_num]
        
        # Parse section_id: b{book}_c{chapter}_s{section}
        parts = section_id.split('_')
        book_num = int(parts[0][1:])
        ch_idx = int(parts[1][1:])
        sec_idx = int(parts[2][1:])
        
        if book_num not in books:
            continue
        
        book = books[book_num]
        chapters = book.get('chapters', [])
        if ch_idx >= len(chapters):
            continue
        
        sections = chapters[ch_idx].get('sections', [])
        if sec_idx >= len(sections):
            continue
        
        section = sections[sec_idx]
        
        if 'dutch' in trans and trans['dutch']:
            section['content_nl'] = trans['dutch']
            total_integrated += 1
        if 'english' in trans and trans['english']:
            section['content_en'] = trans['english']

# Save updated books
for book_num, book_data in books.items():
    path = f'{BOOKS_DIR}/book_{book_num}.json'
    with open(path, 'w') as f:
        json.dump(book_data, f, ensure_ascii=False, indent=2)

print(f'Total sections integrated: {total_integrated}')

# Report per-book status
for book_num in [1, 2, 3, 5, 6, 7, 8, 9, 10]:
    if book_num not in books:
        continue
    book = books[book_num]
    total = 0
    translated = 0
    for ch in book.get('chapters', []):
        for sec in ch.get('sections', []):
            if sec.get('content'):
                total += 1
                if sec.get('content_nl'):
                    translated += 1
    print(f'  Book {book_num}: {translated}/{total} sections translated')
