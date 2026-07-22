"""Test translation of first 2 weeks of year_0"""
import json, time
from openai import OpenAI
client = OpenAI()

def translate(text, lang):
    lang_name = "Dutch" if lang == "nl" else "English"
    try:
        resp = client.chat.completions.create(
            model='gpt-5-nano',
            messages=[
                {'role':'system','content':f'Translate this Arabic Islamic text to {lang_name}. Only the translation, nothing else.'},
                {'role':'user','content': text}
            ],
            max_tokens=2000,
            extra_body={'reasoning':{'effort':'low'}},
        )
        if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
            return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"  Error: {e}")
    return ""

with open('assets/data/tarbiya/year_0.json') as f:
    d = json.load(f)

count = 0
for w in d['weeks'][:2]:
    for fo in w.get('foundations', []):
        c = fo.get('content', {})
        verse = c.get('verse', '')
        hadith = c.get('hadith', '')
        
        if verse and not c.get('verse_nl'):
            tr = translate(verse, 'nl')
            if tr:
                c['verse_nl'] = tr
                count += 1
                print(f'verse_nl: {tr[:80]}')
            time.sleep(0.3)
        
        if verse and not c.get('verse_en'):
            tr = translate(verse, 'en')
            if tr:
                c['verse_en'] = tr
                count += 1
                print(f'verse_en: {tr[:80]}')
            time.sleep(0.3)
        
        if hadith and not c.get('hadith_nl'):
            hadith_text = hadith.split(' — ')[0] if ' — ' in hadith else hadith
            tr = translate(hadith_text, 'nl')
            if tr:
                c['hadith_nl'] = tr
                count += 1
                print(f'hadith_nl: {tr[:80]}')
            time.sleep(0.3)
        
        if hadith and not c.get('hadith_en'):
            hadith_text = hadith.split(' — ')[0] if ' — ' in hadith else hadith
            tr = translate(hadith_text, 'en')
            if tr:
                c['hadith_en'] = tr
                count += 1
                print(f'hadith_en: {tr[:80]}')
            time.sleep(0.3)

print(f'\nTotal translations: {count}')
with open('assets/data/tarbiya/year_0.json', 'w') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print('Saved!')
