# Translation State

## Books to translate (excluding book 4 - إدارة العواطف):
- Book 1: قيادة النفس وطلب العلم (158 sections)
- Book 2: الخصال الفطرية في القرآن (25 sections)
- Book 3: المنهجية الربانية (1183 sections)
- Book 5: الإخلاص (458 sections)
- Book 6: المحبة والخوف والولاء والبراء (386 sections)
- Book 7: الصبر (193 sections)
- Book 8: النصيحة (144 sections)
- Book 9: أعداؤنا (139 sections)
- Book 10: الطرق والوسائل التربوية (586 sections)

## Batch structure:
- Total: 712 batches in /tmp/book_batches/batch_N.json
- Books 1-3: batches 0-189
- Books 5-7: batches 190-538
- Books 8-10: batches 539-711
- Each batch has: {batch_id, section_ids, texts}
- Section IDs format: b{book}_c{chapter}_s{section}

## Translation results:
- First run (books 1-3): 39/190 succeeded, saved at /home/ubuntu/translate_books_1_to_3.json
- The translations file URLs are CDN links that need to be downloaded
- Format: ===SECTION N DUTCH=== / ===SECTION N ENGLISH=== markers

## Integration approach:
- Parse translation files, extract per-section Dutch/English text
- Map back to book JSON using section_ids from batch files
- Add content_nl and content_en fields to each section in book_N.json

## Book 4 removal:
- Deleted assets/data/library/book_4.json
- Removed from index.json (now 9 books)
- Removed from cover_urls.json
- Removed imports from app/library/[bookId].tsx and app/library/read.tsx
