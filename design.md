# Opvoedadvies App — Design Document

## Concept

Een islamitische opvoedadvies-app die ouders begeleidt met gepersonaliseerde, wekelijkse behandelplannen per kind. De app combineert het Opvoedingsdoelen-werkboek (jaar 0-12), de methode van ta'dhiem Allaah per leeftijdscategorie, de vijf stappen voor foutcorrectie, en islamitische gezinskunde tot één geïntegreerd adviessysteem.

---

## Screen List

| # | Scherm | Doel |
|---|--------|------|
| 1 | **Onboarding** | Eerste keer: vraagt hoeveel kinderen, basisgegevens ouder |
| 2 | **Ouderprofiel** | Gedetailleerde vragen over ouders (gebed, hijaab, kennis, gezinskunde, psycholoog, school, lerarencontact) |
| 3 | **Kind toevoegen** | Per kind: naam, geboortedatum, geslacht |
| 4 | **Kind omgevingsanalyse** | Gedetailleerde vragen over omgeving kind (onderwijs, gezin, wijk, vrienden, media, structuur, eigenschappen, hobby's) |
| 5 | **Dashboard (Home)** | Overzicht van alle kinderen met huidige week-advies, algemene adviezen |
| 6 | **Kind detail** | Per kind: huidig weekplan, voortgang, behandelplan |
| 7 | **Weekplan** | 15 weekdoelen (tasfiyah, tazkiyah, tarbiyah) specifiek voor leeftijd+week |
| 8 | **Issue melden** | Ouder beschrijft een probleem/issue met een kind (vrije tekst) |
| 9 | **Behandelplan** | Gepersonaliseerd behandelplan startend bij 'aqiedah, op basis van issue + omgeving + leeftijd |
| 10 | **Instellingen** | Profiel bewerken, kinderen beheren |

---

## Primary Content and Functionality

### Onboarding Flow
- Vraag 1: Hoeveel kinderen heeft u?
- Vervolgens: basisgegevens per kind (naam, geboortedatum, geslacht) — mag later ingevuld worden
- Ouder MOET eerst eigen profiel invullen voordat dashboard toegankelijk is

### Ouderprofiel (verplicht)
Feitelijke vragen (geen oordelen):
1. Geslacht (man/vrouw)
2. Gebed: bidt u de vijf gebeden? (altijd/meestal/soms/zelden/nooit)
3. Al-Fajr apart: bidt u al-Fajr op tijd? (altijd/meestal/soms/zelden/nooit)
4. Hijaab: draagt u/uw vrouw de hijaab? (ja volledig/gedeeltelijk/nee)
5. Kennisvergaring: waar vergaart u islamitische kennis? (bij geleerden/moskee/boeken/media/sociale media/geen)
6. Verplichte kennis: heeft u de verplichte kennis gestudeerd? (ja/gedeeltelijk/nee)
7. Gezinskunde: heeft u gezinskunde gestudeerd? (ja/nee) — zo ja, waar?
8. Psycholoog/instanties: wordt u of uw kind behandeld? (ja/nee) — zo ja, welke?
9. Schoolsituatie kinderen: regulier onderwijs/thuisonderwijs/islamitisch onderwijs/anders
10. Contact met leraren: hoe vaak heeft u contact? (wekelijks/maandelijks/per kwartaal/zelden/nooit)
11. Denkwijze over opvoeding (open vraag)
12. Voelwijze over opvoeding (open vraag)
13. Spreekwijze in opvoeding (open vraag)
14. Werkwijze in opvoeding (open vraag)

### Kind Omgevingsanalyse (per kind, mag later)
Feitelijke vragen:
1. Onderwijssysteem + doorvragen
2. Gezinsleven (moeder, vader, broers/zussen, directe familie)
3. Wijk/buurt
4. Vrienden (type, invloed)
5. Islamitische scholing
6. Media-gebruik
7. Sociale media
8. Dagstructuur
9. Goede eigenschappen: denkwijze, voelwijze, spreekwijze, doewijze
10. Minder goede eigenschappen: denkwijze, voelwijze, spreekwijze, doewijze
11. Affiniteiten
12. Hobby's
13. Goede gewoontes
14. Slechte/minder goede gewoontes

### Validatie
- Elke vraag MOET beantwoord worden (ook open vragen)
- Bij poging door te gaan zonder alles in te vullen: melding "Er zijn nog X vragen niet beantwoord"
- Automatisch terugnavigeren naar eerste onbeantwoorde vraag
- Onbeantwoorde vraag krijgt rode rand/markering
- Uitzondering: kindprofielen mogen "later invullen" gemarkeerd worden

### Behandelplan Engine
- Begint ALTIJD bij 'aqiedah (geloofsleer)
- Bouwt daarop voort per leeftijd
- Houdt rekening met:
  - Huidige leeftijd en week (berekend vanaf geboortedatum)
  - Omgeving en invloeden
  - Goede eigenschappen (worden ingezet)
  - Issues en voorgeschiedenis
  - Band ouder-kind
  - Tijd nodig voor behandeling
- Gebruikt LLM met volledige kennisbank als context

---

## Key User Flows

### Flow 1: Eerste gebruik
1. App opent → Onboarding
2. Hoeveel kinderen? → Invoer
3. Ouderprofiel invullen (verplicht, alle vragen)
4. Per kind: basisgegevens (of "later invullen")
5. → Dashboard wordt ontgrendeld

### Flow 2: Wekelijks advies bekijken
1. Dashboard → Tik op kind
2. Kind detail → Huidige week wordt getoond
3. 15 weekdoelen zichtbaar (tasfiyah/tazkiyah/tarbiyah)
4. Specifiek voor leeftijd + week van dit kind

### Flow 3: Issue melden
1. Kind detail → "Issue melden" knop
2. Beschrijf het probleem (vrije tekst)
3. App genereert behandelplan via LLM + kennisbank
4. Plan begint bij 'aqiedah, bouwt op naar specifiek advies
5. Behandelplan wordt opgeslagen bij het kind

### Flow 4: Kindprofiel later invullen
1. Dashboard → Kind zonder profiel → "Profiel invullen"
2. Omgevingsanalyse-vragen
3. Na invulling: adviezen worden specifieker

---

## Color Choices

| Element | Kleur | Hex |
|---------|-------|-----|
| Primary (teal/groen) | Islamitisch groen | #1B7A5C |
| Primary Light | Licht groen | #E8F5F0 |
| Accent | Goud | #C4952B |
| Background | Warm wit | #FAFAF8 |
| Surface | Wit | #FFFFFF |
| Text Primary | Donkergrijs | #1A1A1A |
| Text Secondary | Middengrijs | #6B7280 |
| Error/Validatie | Rood | #DC2626 |
| Success | Groen | #16A34A |
| Border | Lichtgrijs | #E5E7EB |

---

## Typography

- Headers: System font, bold
- Body: System font, regular
- Arabische tekst: System Arabic font
- RTL-ondersteuning voor Arabische content

---

## Navigation Structure

```
Root Stack
├── Onboarding (modal, shown once)
│   ├── Welcome
│   ├── ParentProfile
│   └── ChildrenSetup
├── (tabs)
│   ├── Home/Dashboard
│   ├── Kinderen (lijst)
│   └── Instellingen
└── Modals
    ├── ChildDetail
    ├── ChildEnvironment
    ├── ReportIssue
    └── TreatmentPlan
```
