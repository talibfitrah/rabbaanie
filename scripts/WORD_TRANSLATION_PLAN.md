# Word Files Translation Plan

## Source Files
- Location: /home/ubuntu/upload/*.docx
- Total: 38 files, 6.2M characters
- Categories:
  - ج2 (Part 2 - Marriage): files 08-15 (8 files)
  - ج3 (Part 3 - Children): files 16-41 (26 files)
  - Special files: الجامع (1.1M), السنن الكونية (135K), الطرق التربوية (1.1M), قيادة العواطف (193K)

## Current Library Structure
- Location: /home/ubuntu/opvoedadvies_apk/assets/data/library/
- Books: book_1.json to book_10.json (no book_4), 9 books total
- Index: index.json (metadata for all books)
- Structure per book:
  ```json
  {
    "id": 1,
    "title_ar": "...", "title_en": "...", "title_nl": "...",
    "series": "...", "series_num": 1, "category": "...",
    "total_chapters": 10, "total_words": 21720,
    "chapters": [
      {
        "title": "Arabic title",
        "title_nl": "Dutch title",
        "title_en": "English title",
        "sections": [
          { "title": "Section title", "content": "Arabic content" }
        ]
      }
    ]
  }
  ```

## How Library is Displayed
- app/library/index.tsx: Shows book list grouped by category
- app/library/[bookId].tsx: Shows chapters of a book
- app/library/read.tsx: Shows chapter content with sections
  - Uses getSectionContent() which checks: section.content_nl or section.content_en
  - Falls back to on-demand translation via trpc.translate.translateTexts mutation
  - Already supports multilingual display!

## Translation Approach for Word Files
The Word files need to be:
1. Extracted to text (python-docx)
2. Structured into JSON (chapters/sections)
3. Added as new books in the library (book_11 to book_48 or similar)
4. Each section needs content_nl and content_en fields
5. Update index.json with new book entries

## Key Insight
The app already handles multilingual content in the library:
- If content_nl/content_en exists → displays it
- If not → falls back to Arabic or on-demand translation
- So we can add books with Arabic content first, then translate later

## Estimation
- 6.2M chars total
- At ~4000 chars per LLM call, that's ~1550 calls per language = ~3100 total
- At ~2 seconds per call = ~1.7 hours per language
- Total: ~3.5 hours for both NL+EN
- Cost: ~$3-5 at gpt-5-mini rates
