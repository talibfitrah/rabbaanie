# New Tarbiya Data Format Reference

## File location: assets/data/tarbiya/year_{N}.json (N = -1 to 18)

## Week structure:
```json
{
  "week": 6,
  "goals_count": 16,
  "goals": [
    {
      "num": 1,
      "stage": "التزكية (القلب)",  // or "التصفية (العقل)" or "التربية (الجوارح واللسان)"
      "type": "1. التربية العقدية",  // goal type category
      "goal": "اجعل الطفلَ يشعر بمزيدٍ من محبّة...",
      "source": "تحفة المودود لابن القيم (ص٣٣٨-٣٥٣)",
      "method": "غرس أوائل كلمات التوحيد...",
      "steps": "1. لَقِّنه أول ما يقول... 2. ثم... 3. ..."
    }
  ],
  "foundations": [
    { "type": "آية", "text": "..." },
    { "type": "حديث", "text": "..." }
  ],
  "activities": [
    { "title": "...", "description": "..." }
  ]
}
```

## Stages (3 categories):
- التزكية (القلب) = tazkiyah (heart) - ~3 goals per week
- التصفية (العقل) = tasfiyah (mind) - ~5-6 goals per week
- التربية (الجوارح واللسان) = tarbiyah (limbs) - ~7-8 goals per week

## Goal types (13 types):
1. التربية العقدية
2. تربية العبادات
3. التربية الاجتماعية
4. التربية السلوكية
5. التربية الوجدانية
8. التربية الصحية
9. التربية الجنسية
11. التربية الإعلامية
13. تربية الوقت

## Year metadata:
- name: "السنة الأولى" etc.
- characteristics: developmental characteristics for this age
- distribution: how goals are distributed

## Translation:
- Source language is Arabic
- Dutch/English translated on-demand via LLM (server-side)
- Translated fields: goalTr, methodTr, stepsTr (added to goal object)

## Old format fields (NO LONGER USED):
- goalAR/goalEN, explanationAR/explanationEN, methodAR/methodEN, werkvorm/werkvormAR/werkvormEN
- These are replaced by: goal, method, steps (Arabic source) + goalTr, methodTr, stepsTr (translated)
