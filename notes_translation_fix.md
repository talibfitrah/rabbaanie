# Translation Fix Notes

## Issue 1: Names of Allah (fitrah.tsx)
- Data file: `data/names_of_allah.json`
- Structure: ageGroups[].names[] - each name has:
  - `name` (string, Arabic only) - Allah's name, should ALWAYS show Arabic
  - `meaning` (string, Arabic only) - needs translation
  - `explanation` (string, Arabic only) - needs translation
  - `reason` ({nl, en, ar} object but ALL values are Arabic) - getText() already handles structure
  - `tasfiya` (array of {nl, en, ar} objects but ALL values are Arabic)
  - `tazkiya` (array of {nl, en, ar} objects but ALL values are Arabic)
  - `tarbiya` (array of {nl, en, ar} objects but ALL values are Arabic)
  - `tarbiya_jawarih` (array of {nl, en, ar} objects but ALL values are Arabic)
- Group titles ARE translated correctly (title.nl, title.en, title.ar)
- Total names: 193 across 7 age groups

## Issue 2: Library (app/library/)
- Data files: `assets/data/library/book_*.json` (9 books, 10MB total)
- Structure: chapters[].sections[] - each section has:
  - `title` (string, Arabic only)
  - `content` (string, Arabic only)
- Chapter level has `title_nl` and `title_en` (translated)
- Section content has NO translations
- Total: 175 chapters, 2193 sections

## Solution: Server translate endpoint
- Added `translateRouter` to `server/routers.ts` with `translateTexts` mutation
- Accepts up to 20 texts, target language (nl/en), optional context
- Uses in-memory cache + LLM translation
- Client calls this when lang != "ar" and content needs translation

## Client approach:
- fitrah.tsx: When a name is expanded and lang != ar, call translate API for meaning/explanation/tasfiya etc.
- library/read.tsx: When reading a chapter and lang != ar, call translate API for section content
- Show loading indicator while translating, cache results in state
