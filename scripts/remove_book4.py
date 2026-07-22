#!/usr/bin/env python3
"""Remove book 4 (إدارة العواطف) from library index and cover URLs."""
import json

# Remove from index.json
with open('assets/data/library/index.json', 'r') as f:
    index = json.load(f)

index = [b for b in index if b['id'] != 4]
print(f"Index now has {len(index)} books")

with open('assets/data/library/index.json', 'w') as f:
    json.dump(index, f, ensure_ascii=False, indent=2)

# Remove from cover_urls.json
with open('assets/data/library/cover_urls.json', 'r') as f:
    covers = json.load(f)

if 'book_4' in covers:
    del covers['book_4']
    print("Removed book_4 from cover_urls.json")

with open('assets/data/library/cover_urls.json', 'w') as f:
    json.dump(covers, f, ensure_ascii=False, indent=2)

print("Done!")
