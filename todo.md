# Project TODO

- [x] Kennisbank JSON opbouwen uit Excel en documenten
- [x] Onboarding flow: hoeveel kinderen + basisgegevens
- [x] Ouderprofiel vragenlijst (gebed, hijaab, kennis, gezinskunde, etc.)
- [x] Kind toevoegen scherm (naam, geboortedatum, geslacht)
- [x] Kind omgevingsanalyse vragenlijst (14 categorieën)
- [x] Validatie-systeem: rode rand, melding onbeantwoorde vragen, terugnavigatie
- [x] Dashboard/Home scherm met overzicht per kind
- [x] Kind detail scherm met weekplan
- [x] Weekplan berekening op basis van leeftijd + geboortedatum
- [x] Issue melden scherm (vrije tekst)
- [x] Behandelplan-engine via LLM met kennisbank als context
- [x] "Later invullen" functionaliteit voor kindprofielen
- [x] App-logo genereren en branding instellen
- [x] Unit tests schrijven
- [x] Nieuw logo genereren (twee handen, geen hoofden/gezichten)
- [x] Nieuw gezinskunde-document (feb 2022 - juni 2025) woord voor woord lezen
- [x] Kennisbank updaten met nieuwe documentinhoud als primaire bron
- [x] Behandellogica en prompts updaten met nieuwe bron
- [x] Hybride advieslogica: adviezen integraal baseren op volledige gezinssituatie + kind + ouders
- [x] Ouderprofiel herschrijven: feitelijke vragen over denkwijze/voelwijze/spreekwijze/doewijze
- [x] Oudervragen uitbreiden: gebed, fajr, hijaab, kennis, gezinskunde, psycholoog, school, leraren
- [x] Strikte validatie: blokkeren bij onbeantwoorde vragen, rode rand, terugnavigatie
- [x] Later invullen alleen voor kinderinfo, NIET voor oudervragen
- [x] Ouderadvies: eerst band met Allaah, dan onderling, dan met kinderen
- [x] App herstructureren naar 5 tabbladen: Algemeen, Wekelijks, Gezinsgegevens, Behandelplannen, Instellingen
- [x] Algemeen/Hoofd-scherm: tijds- en locatiegebonden gezinsadviezen
- [x] Wekelijkse adviezen tab: per kind weekadvies
- [x] Gezinsgegevens tab: analyse ouders en kinderen
- [x] Behandelplannen tab: specifieke behandelplannen per kind
- [x] Geboortedatum: datumkiezer (date picker) in plaats van handmatig typen
- [x] Ouderprofiel: stapsgewijze wizard (fasen) in plaats van één lange pagina
- [x] Conditionele logica: vervolgvragen afhankelijk van eerdere antwoorden (bijv. man/vrouw → hijaab-vraag)
- [x] Onboarding vereenvoudigen: alleen kinderaantal + geslacht bij start
- [x] Flow: ouder volledig invullen vóór kinderen (geleiding bij navigatie naar kinderen)
- [x] Oudergegevens bewerkbaar maken vanuit de app (altijd aanpasbaar)
- [x] Herinneringssysteem: gebruiker stelt zelf in hoe vaak hij herinnerd wordt om gegevens bij te werken
- [x] Algemene adviezen uitklapbaar maken (collapsed by default)
- [x] Islamitische kalender (Hijri) als primaire datum, christelijke als secundaire
- [x] Tijdscontext uitbreiden: specifieke islamitische dagen + komende dagen (niet alleen seizoen)
- [x] Sub-adviezen ook uitklapbaar maken (genest uitklapbaar)
- [x] Datum/tijd-header component op elk scherm bovenaan (Hijri + christelijk + tijd)
- [x] Tijdgebonden adviezen voor ouders op Gezinsgegevens-scherm (specifieke islamitische dagen + komende dagen)
- [x] Sub-adviezen op Gezinsgegevens-scherm ook uitklapbaar
- [x] Hijri-jaarkalender document lezen en structureren
- [x] Kalenderdata hybride integreren in tijdgebonden adviezen (Home + Gezinsgegevens)
- [x] Adviezen per Hijri-maand/dag specifiek voor ouders EN kinderen afhankelijk van situatie
- [x] Lay-out adviezen verbeteren: compacter, minder tekst, meer visuele structuur
- [x] Passende mindsets sectie toevoegen aan Algemeen en Gezinsgegevens
- [x] Analyse sectie toevoegen (korte gezinsanalyse)
- [x] Visuele verbeteringen: kaart-stijl, iconen, kleuraccenten, duidelijke hiërarchie
- [x] Fix: geen vasten-advies op 'Ied al-Adhaa, 'Ied al-Fitr en Ayyaam at-Tashreeq
- [x] Fix: situatie-afhankelijke logica (geen conflicterende adviezen)
- [x] Teksten inkorten: max 1-2 regels per advies/mindset/actie
- [x] Bij elke islamitische dag uitleg toevoegen: beloning + waarom bijzonder + bewijs (hadieth/aayah)
- [x] Vooruitblik uitbreiden van 7 naar minimaal 10 dagen
- [x] 'Ied-voorbereidingen toevoegen (soennah, ghusl, takbier, offer-regels)
- [x] 'Ied al-Adhaa en 'Ied al-Fitr soennah-handelingen in dag-info
- [x] Overal 'Allah' (met 1 a) vervangen door 'Allaah' (met 2 aa)
- [x] Onboarding ouders: open vragen → meerkeuze + eerlijkheidswaarschuwing
- [x] Kind-analyse uitbreiden: persoonlijkheid (denk/voel/spreek/werkwijze), sociaal, Allaah-band, gezondheid
- [x] Hybride invoer per vraag: keuze tussen meerkeuze OF open antwoord
- [x] Fix: alleen 10 Dhul-Hijjah en 1 Shawwaal zijn vasten verboden (niet 11-13 DH)
- [x] Samenloop-logica: meerdere vastendagen = intentie van de beste beloning
- [x] Grafische lay-out verbeteren: kleurrijker, gradient-accenten, betere visuele hiërarchie
- [x] Fix: Ayyaam at-Tashreeq zijn 3 dagen (11, 12, 13 DH) niet 2
- [x] Mawsouah PDF document lezen en extraheren (الموسوعة الميسرة في تربية)
- [x] Mawsouah kennisbank JSON genereren (mindsets, fitrah, methoden, problemen)
- [x] Mindsets-tabblad aanmaken met alle mindsets uit de Mawsouah
- [x] Fitrah-tabblad aanmaken met fitrah-eigenschappen en sturing
- [x] Mawsouah integreren in server-side advieslogica (getGeneralAdvice, getWeekPlan, generateTreatmentPlan)
- [x] GPS-locatie service toevoegen met permissie-verzoek
- [x] Instellingen: GPS aan/uit toggle
- [x] Stad-weergave bovenaan de app (header)
- [x] Fitan-waarschuwingen per stad (algemeen, zonder specifieke locaties)
- [x] Goede plekken tonen: moskeeën en islamitische stichtingen
- [x] Beschermingsadviezen gehoor/zicht/hart voor ouders en kinderen
- [x] Server-side: locatie-context integreren in advieslogica
- [x] Fix GPS toggle in Instellingen: Switch vervangen door Pressable-knop, hasServicesEnabledAsync check, betere error handling, ActivityIndicator loading state
- [x] Fix GPS knoppen (App-instellingen / Locatie-instellingen) werken niet in Expo Go
- [x] Fix Hijri kalender: 2 dagen vooruit, moet gecorrigeerd worden
- [x] Handmatige stad invoer met herkenning (naast GPS optie)
- [x] Gebedstijden berekening met 12-graden methode (vervangt Fitrah tab)
- [x] Adhkaar herinneringen: ochtend-adhkaar bij Fajr, avond-adhkaar bij Asr
- [x] Islamitische dag begint bij Maghrib (Hijri datum +1 na Maghrib)
- [x] Locatie-kiezer direct op Gebedstijden tab: eerst land, dan stad
- [x] Alle islamitische berekeningsmethoden als keuzeoptie toevoegen
- [x] Fix timezone bug: gebedstijden nu gebaseerd op timezone van gekozen stad (niet apparaat)
- [x] Gebedstijden-instellingen (land/stad/methode) verplaatsen naar Instellingen tab
- [x] Meertaligheid (NL/EN) volledig: alle schermen, knoppen, formulieren, server-side adviezen vertaald
- [x] Push-notificaties voor gebedstijden: per-gebed aan/uit, minuten vooraf (0/5/10/15), adhkaar-herinneringen
- [x] Notification handler in _layout.tsx voor foreground meldingen
- [x] Android notification channels (prayer_times, adhkaar_reminders)
- [x] Automatisch herschedulen bij locatie/methode wijziging en app-start
- [x] Notificatie-instellingen UI in Settings tab met toggles en dropdown
- [x] Vertaal family.tsx: getParentDayInfo en getUpcomingEvents (name, reward, reason, parentAction, preparation) naar EN
- [x] Vertaal family.tsx: UI teksten (Vandaag, Analyse, Profiel, Vernieuw, etc.) naar EN via i18n
- [x] Vertaal parent-profile.tsx: alle PHASES titles, labels, options, hints naar EN
- [x] Vertaal child/environment.tsx: alle questions, options, hints naar EN
- [x] Vertaal child/[id].tsx: resterende inline teksten naar EN via i18n
- [x] Vertaal settings.tsx: resterende hardcoded teksten (GPS, stad niet herkend, etc.)
- [x] Vertaal index.tsx (home/gebedstijden): getParentDayInfo en getUpcomingEvents naar EN
- [x] Vertaal mindsets.tsx: toon titleEN/descriptionEN/principleEN/applicationEN op basis van taalinstelling
- [x] Engelse vertalingen toevoegen aan mawsouah_knowledge.json (mindsets, fitrah, education_methods, common_problems)
- [x] Vertaal server/advice.ts: getMawsouahContext naar tweetalig (NL/EN) op basis van language parameter
- [x] Vertaal server/advice.ts: buildFullParentInfo en buildFullEnvironmentInfo labels naar tweetalig
- [x] Vertaal server/advice.ts: getWeekPlan systemPrompt naar tweetalig
- [x] Vertaal server/advice.ts: generateTreatmentPlan systemPrompt naar tweetalig
- [x] Vertaal server/advice.ts: getHijriCalendarContext labels naar tweetalig
- [x] Vertaal server/_core/index.ts: REST fallback error messages naar tweetalig
- [x] Fix parent-profile: validatie-melding "3 vragen niet beantwoord" en waarschuwing "Wees eerlijk" vertalen naar EN
- [x] Fix LLM-advies: expliciete taalinstructie in alle systemPrompts + refetch bij taalwijziging (weekplan, general advice)
- [x] Fix Mindsets: unicode-escapes bevestigd als correct UTF-8 in JSON; titels/beschrijvingen tonen al in juiste taal
- [x] Fix unicode-escapes in index.tsx: emoji's (⚠️, 🕌) en bullets (•) worden nu als werkelijke tekens getoond
- [x] Kenitra + 12 andere Marokkaanse steden toegevoegd aan de stad-lookup tabel
- [x] Weekplan en general advice refetchen bij taalwijziging
- [x] Fix gebedstijden-berekening: EqT normalisatie (negatieve tijden) en Asr correctie (te vroeg)
- [x] Arabisch (ar) als derde taal toevoegen aan i18n systeem met RTL-ondersteuning
- [x] Alle i18n strings vertalen naar Arabisch
- [x] Parent-profile PHASES vertalen naar Arabisch
- [x] Family.tsx, index.tsx, mindsets.tsx inline teksten vertalen naar Arabisch
- [x] Environment.tsx, settings.tsx, en overige schermen vertalen naar Arabisch
- [x] Server-side LLM-prompts en advieslogica vertalen naar Arabisch
- [x] Taalkeuzescherm updaten met Arabisch optie
- [x] Onboarding/index.tsx vertalen naar Arabisch
- [x] Child/weekplan.tsx vertalen naar Arabisch
- [x] Child/[id].tsx vertalen naar Arabisch
- [x] Date-time-header: Hijri maandnamen in Arabisch
- [x] Prayer-times.tsx: Hijri datum in Arabisch
- [x] Form-field.tsx: HybridField, HonestyBanner, ValidationBanner vertalen naar Arabisch
- [x] Fix: unicode escape codes (\u26A0\uFE0F, \uD83D\uDD4C) worden als tekst getoond in plaats van emoji's
- [x] Fix: "Kenitra, Marokko" vertalen naar Arabisch wanneer taal op AR staat
- [x] Fix: tekst valt buiten het scherm in Arabische weergave (tab labels verkort)
- [x] Fix: Arabische taalvlag gewijzigd van 🇲🇦 naar 🇸🇦 (Saoedi-Arabië)
- [x] ترجمة server/advice.ts: getMawsouahContext إلى العربية (isAr branch)
- [x] ترجمة server/advice.ts: getHijriCalendarContext إلى العربية
- [x] ترجمة server/advice.ts: buildFullParentInfo إلى العربية
- [x] ترجمة server/advice.ts: buildFullEnvironmentInfo إلى العربية
- [x] ترجمة server/advice.ts: getGeneralAdvice systemPrompt + userPrompt إلى العربية
- [x] ترجمة server/advice.ts: getWeekPlan systemPrompt + userPrompt إلى العربية
- [x] ترجمة server/advice.ts: generateTreatmentPlan systemPrompt + userPrompt إلى العربية
- [x] ترجمة server/_core/index.ts: fallback error messages إلى العربية
- [x] ترجمة أسماء المدن في prayer-data.ts إلى العربية (nameAr field)
- [x] ترجمة التحية "Assalaamu alaykum" إلى "السلام عليكم" في العربية
- [x] ترجمة أسماء البلدان في قائمة الاختيار (settings.tsx) إلى العربية
- [x] Fix: كلمة "الرئيسية" مقطوعة - تقصير إلى "الرئيسة"
- [x] Fix: قلب التخطيط RTL (من اليمين إلى اليسار) عند اختيار العربية
- [x] ترجمة mawsouah_knowledge.json: إضافة حقول عربية كاملة (principleAR, applicationAR, descriptionAR, howToNurtureAR, signsOfDeviationAR, briefAR)
- [x] تحديث mindsets.tsx لاستخدام الحقول العربية الجديدة (titleAR, descriptionAR, principleAR, applicationAR)
- [x] تحديث server/advice.ts: getGezinskunde2025Context, loadYearContext, loadTadhiemContext, loadCorrectionContext لدعم العربية
- [x] تحديث server/advice.ts: buildWeekPlanContext و buildTreatmentContext لتمرير lang
- [x] تطبيق I18nManager.forceRTL عند بدء التطبيق إذا كانت اللغة عربية
- [x] تحويل جميع flexDirection: "row" إلى RTL-aware في جميع الشاشات
- [x] إضافة حقول titleAR و descriptionAR المفقودة لجميع أقسام mawsouah_knowledge.json (mindsets, fitrah_properties, education_methods, common_problems)
- [x] إصلاح RTL في mindsets.tsx: borderRight بدلاً من borderLeft + textAlign right
- [x] إصلاح أزرار التبويب (الرئيسية والأسبوع) لتكون واضحة وغير مقطوعة
- [x] تغيير التحية إلى "السلام عليكم ورحمة الله وبركاته" (السلام الكامل)
- [x] إضافة الصلاة القادمة والوقت المتبقي لها في أعلى الرئيسية
- [x] إضافة زر "طرق تسيير الفطرة" في الواجهة الرئيسية من ملف الطرق العملية التربوية الربانية
- [x] نقل "طرق تسيير الفطرة" من الرئيسية إلى شريط التبويب السفلي كتبويب مستقل باسم "الفطرة"
- [x] استخراج جميع الخصال (218 خصلة + 32 منزلة قلبية) مع طرق تسييرها من الملف وتحديث fitrah_tasyeer.json
- [x] تدقيق الترجمة العربية لجميع أسئلة استبيان الوالد (parent-profile.tsx)
- [x] تدقيق الترجمة العربية لجميع أسئلة بيئة الطفل (environment.tsx)
- [x] تدقيق الترجمة العربية لشاشات onboarding و child/[id].tsx و weekplan.tsx
- [x] إدراج أسماء الله الحسنى مع تطبيقات تربوية لكل اسم حسب الفئة العمرية (تصفية + تزكية + تربية عملية)
- [x] إنشاء شاشة/تبويب أسماء الله التربوية في التطبيق
- [x] دمج أسماء الله الحسنى داخل تبويب الفطرة (إزالة تبويب الأسماء المستقل)
- [x] التوسع في التطبيقات التربوية لكل فئة عمرية بنفس الطريقة (تصفية + تزكية + تربية + أمثلة)
- [x] إعادة تصميم الشاشة الرئيسية بالنمط الجديد: خلفية بيضاء، عناوين بشريط أخضر داكن، بطاقات مستديرة مع أيقونات، RTL
- [x] تحديث شريط التبويب السفلي ليطابق النمط (أيقونات + أسماء واضحة)
- [x] تحديث الألوان (أخضر داكن #1B4332 + ذهبي #C4A35A + أبيض)
- [x] إعادة تصميم الشاشة الرئيسية لتطابق النمط المرفوع: عنوان "تربية Tarbiyah" + شريط تاريخ/موقع + بطاقة صلاة بمسجد + أقسام مزخرفة
- [x] تحديث شريط التبويب السفلي: 7 تبويبات (الرئيسية، القرآن، الصلاة، التقويم، تربية، المجتمع، المزيد)
- [x] تطبيق نمط العناوين المزخرفة: أيقونة + نص + خط أفقي ملون (أخضر/أزرق/ذهبي)
- [x] تحسين تصميم الشاشة الرئيسية: تباعد أفضل، بطاقات أنيقة بظلال ناعمة، ألوان متناسقة، خطوط واضحة، تفاصيل زخرفية محسنة
- [x] إعادة كتابة الشاشة الرئيسية كنموذج شامل جامع: نصائح نقطية حول البيئة، الأبناء، العائلة/الأخوات، الصلاة، الموسم، اليوم الإسلامي - بدون تصميم معقد
- [x] إضافة نظام تفاعلي: كل نصيحة تعطي المستخدم خيار الرد بجواب مفتوح أو اختيار من خيارات واضحة
- [x] إعادة تصميم الشاشة الرئيسية لتطابق الصورة المرفوعة بالضبط مع دمج نظام الخيارات التفاعلية
- [x] إزالة قسم التأمل اليومي من الشاشة الرئيسية
- [x] توسيع الأيام القادمة إلى 5 أيام مع نصائح مخصصة لكل يوم
- [x] إضافة نصيحة شخصية مطوية مبنية على الإجابات والأجواء والأحوال العامة
- [x] جعل كل قسم قابل للضغط ليوصل إلى شاشة تفصيلية بمعلومات أوسع
- [x] إنشاء شاشة تفصيل نصائح اليوم
- [x] إنشاء شاشة تفصيل الأيام القادمة
- [x] إنشاء شاشة تفصيل النصيحة الشخصية
- [x] إضافة قسم أبناؤك مع أسماء الأطفال ونصائح مخصصة حسب العمر والأهداف التربوية
- [x] إنشاء شاشة تفصيل المبادئ (mindset.tsx)
- [x] إضافة زر أذكار الصباح/المساء حسب الوقت في الشاشة الرئيسية + شاشة أذكار ثابتة
- [x] دمج زر الأذكار داخل بطاقة الصلاة + إضافة أذكار بعد الصلاة حسب الصلاة الحالية + تجميع المحتوى بكثافة أكبر
- [x] إضافة نظام أسئلة تفاعلية بخيارات + جواب مفتوح عند كل سؤال في جميع الأقسام
- [x] إضافة toggle (اختيار / جواب مفتوح) في أعلى كل سؤال select: زران يسمحان للمستخدم بالتبديل بين الخيارات والكتابة الحرة
- [x] تصغير إطار/بطاقة الصلاة في الشاشة الرئيسية
- [x] تعديل خيارات الأسئلة لتكون مناسبة لجنس المستخدم (مذكر/مؤنث) في جميع الأسئلة اللاحقة
- [x] Vertaal alle Arabische teksten in de app naar het Nederlands en Engels (alle bestanden)
- [x] Verander "Allah" naar "Allaah" (dubbele aa) in de hele app
- [x] Vertaal alle fitrah_tasyeer.json traits en heartActions volledig naar NL/EN
- [x] Vertaal alle names_of_allah.json content volledig naar NL/EN
- [x] Zoekfunctie toevoegen aan Fitrah-scherm
- [x] Favorietensysteem toevoegen met AsyncStorage
- [x] Ochtendgedenkingen-tijd toevoegen aan gebedstijden-menu
- [x] Avondgedenkingen-tijd toevoegen aan gebedstijden-menu
- [x] Helft van de nacht berekenen (midden tussen Maghrib en Fajr) en tonen in gebedstijden-menu
- [x] Fix: النصيحة الشخصية op home screen moet dezelfde content tonen als in العائلة tab (gebaseerd op persoonlijk profiel)
- [x] Vertaal alle resterende Arabische tarbiya/daleel tekst in names_of_allah.json naar NL/EN
- [x] Voeg bronvermelding (takhreedj) toe aan alle bewijzen in de data
- [x] Fix: النصيحة الشخصية werkt niet bij klikken vanuit het startscherm
- [x] Fix: verwijder alle verwijzingen naar "الذكاء الاصطناعي" / "AI" uit de gebruikersinterface
- [x] Fix: الأدلة تظهر transliteration بدلاً من العربي عند اختيار اللغة العربية (يجب عرض النص العربي الأصلي)
- [x] Fix: التحليل الشخصي ليس بالعربي عند اختيار العربية (language dependency toegevoegd aan useEffect)
- [x] Fix: الملف الشخصي يعرض القيم الهولندية الخام (altijd_5, geleerden_direct, etc.) بدلاً من ترجمتها للعربية
- [x] Fix: النصيحة الشخصية (personal-advice.tsx) تبقى في حالة تحميل دائم ولا تعرض النتيجة (LLM response takes 30-60s, spinner is normal behavior)
- [x] Fix: النصيحة الشخصية في الرئيسية لا تعمل (personalExpanded default true + language dependency)
- [x] Fix: الأدلة في الرئيسية تظهر بالتخريج اللاتيني — تم ترجمة جميع evidence strings في tips-today.tsx و upcoming-days.tsx
- [x] Feature: إضافة وقت الثلث الأخير من الليل في صفحة مواقيت الصلاة
- [x] Fix: النصيحة الشخصية في العائلة والرئيسية تستخدم نفس API + caching محلي 12 ساعة
- [x] Fix: الأدلة في tips-today.tsx مترجمة عبر tx() (الرئيسية لا تعرض evidence مباشرة)
- [x] Feature: إزالة تبويب الإعدادات من الشريط السفلي ووضع زر لها في الأعلى
- [x] Feature: إضافة تبويب "المفاهيم" في الشريط السفلي
- [x] Feature: إنشاء بيانات المفاهيم التربوية من القرآن والسنة وابن تيمية وابن القيم بثلاث لغات
- [x] Feature: بناء واجهة شاشة المفاهيم مع بحث وتصنيفات
- [x] Fix: _layout.tsx was niet correct bijgewerkt — concepts tab nu zichtbaar, settings verborgen in tab bar
- [x] Fix: alle secties op de Rئيسية (home screen) standaard ingeklapt (collapsed)
- [x] Fix: أزرار التصفية (chips) في شاشة المفاهيم مخفية — تم تحسين الألوان والحدود لتكون مرئية بوضوح
- [x] Fix: أزرار التصفية مخفية وراء المحتوى — تم إضافة height: 44 و marginBottom: 12 للـ FlatList الأفقي
- [x] Fix: أزرار التصفية لا تزال غير مرئية — تم تحويلها إلى ScrollView مع ارتفاع أكبر (56px) وحجم خط أكبر (15px) وحدود أعرض (2px)
- [x] Feature: استخراج 23 مفهوماً تربوياً جديداً من الموسوعة والجزينسكونده وإضافتها لقائمة المفاهيم (المجموع 57 مفهوماً)
- [x] Feature: إضافة تصنيفين جديدين: "الموسوعة" و"علم الأسرة" مع أيقونات خاصة
- [x] Fix: Deployment build error (Metro resolver issue - DependencyGraph.getOrComputeSha1) — build werkt lokaal, dist opnieuw gebouwd
- [x] Feature: إضافة حقول اسم الطفل وتاريخ ميلاده في ملف تعريف الأطفال (مرئية للمستخدم)
- [x] Fix: نموذج تعريف الطفل يفتح تلقائياً عند عدم اكتمال الملف الشخصي + تنبيه ⚠ في قائمة العائلة
- [x] Feature: إعادة تصميم شاشة النصائح الأسبوعية بشكل منظم وقابل للتوسيع
- [x] Fix: شاشة النصائح الأسبوعية غير منظمة — إعادة التصميم بأهداف مرقمة قصيرة وبطاقات واضحة بدلاً من نص طويل
- [x] Fix: شاشة النصائح الأسبوعية لا تزال غير منظمة — إعادة التصميم بتصنيفات ثابتة (عقيدة، عبادة، سلوك...) كبطاقات رئيسية
- [x] Feature: إعادة تصميم شاشة الأسبوعي بقسمين (الوالد/الولد) وفي كل قسم 3 تصنيفات ثابتة (تصفية/تزكية/تربية) قابلة للطي
- [x] Feature: Datumkiezer (date picker) toevoegen bij kindprofiel in plaats van tekstveld
- [x] Feature: Datumkiezer (date picker) toevoegen bij ouderprofiel
- [x] Vertaal alle opvoedingsdoelen in weekly_advice.json naar Engels en Arabisch met correcte taalkundige betekenis
- [x] Feature: Genereer wekelijkse doelen voor alle jaren (0-12) met 52 weken per jaar op basis van Excel-bestand
- [x] Feature: Vertaal alle nieuwe doelen naar Engels en Arabisch
- [x] Feature: Mindsets aanvullen met data uit Excel-bestand
- [x] Feature: Werkvormen toevoegen aan de app (data + UI)
- [x] Feature: Voortgangs-checkboxes per doel met AsyncStorage persistentie
- [x] Feature: Week-navigatie (vorige/volgende week knoppen) door alle 52 weken
- [x] Feature: Voortgangsbalk per categorie in subsectie-headers (bijv. "3/5 voltooid")
- [x] Feature: Wekelijkse push-herinnering voor onafgevinkte doelen
- [x] Feature: Homepagina herontwerp met push-berichten status, weekvoortgang, snelle acties en logischere indeling
- [x] Feature: Compact meldingen-overzicht toevoegen aan homepagina
- [x] Feature: Gezinsoverzicht (family.tsx) verbeteren
- [x] Feature: Instellingenscherm (settings.tsx) verbeteren
- [x] Bug: Gebedstijden tonen NaN:NaN - berekening is kapot (fix: hardcoded timezone offsets voor Hermes)
- [x] Bug: Persoonlijk advies wordt in Nederlands getoond terwijl Arabisch is gekozen (fix: cache-invalidatie bij taalwisseling)
- [x] Bug: Kind-labels (jongen, Kind 2/3/4) niet vertaald naar Arabisch (fix: tx() vertaling voor gender + naam)
- [x] Bug: Namen van Allah ontbreken bij begrippen-scherm (fix: 39 namen toegevoegd als categorie)
- [x] Bug: أسماء الله الحسنى في الفئات 5-7 و 7-10 و 10-12 ليس فيها تصفية وتزكية وتربية وأمثلة - يجب إضافتها بنفس تنسيق الفئات الأصغر
- [x] إضافة محتوى التصفية والتزكية والتربية والأمثلة لجميع الأسماء الـ 55 في الفئة العمرية ٧-٩ سنوات (ثلاثي اللغة: عربي/هولندي/إنجليزي)
- [x] تحديث concepts.json بـ 53 اسماً جديداً من الفئة العمرية ٧-٩ سنوات
- [x] Bug fix: [object Object] weergave bij namen van Allah in Fitrah-scherm (groep 7-9) - namen zijn nu objecten i.p.v. strings
- [x] Bug fix: \u2022 en \u2726 unicode escape sequences werden als letterlijke tekst weergegeven - vervangen door echte UTF-8 karakters
- [x] Bug: إشعارات الصلاة تظهر بنقطة رمادية (غير مفعلة) في الرئيسية - يجب أن تكون مفعلة بشكل افتراضي
- [x] Redesign homescreen: kinderen prominent tonen met actieve status, gebedstijden altijd zichtbaar, snelle acties voor ouders, aantrekkelijk en interactief design
- [x] AI Provider abstraction layer (wisselbaar: ingebouwde Manus AI ↔ OpenAI)
- [x] AI Chat router met endpoints (startConversation, sendMessage, getConversation, listConversations)
- [x] Live data invoer systeem (submitLiveData, getLiveData, getLiveAdvice)
- [x] AI Chat scherm in de app met conversatiegeschiedenis en suggesties
- [x] AI Adviseur knop toegevoegd aan homescreen snelle acties
- [x] Fix 1: Tijdsindicatie toevoegen bij vragenlijst ("Dit duurt ongeveer 5 minuten")
- [x] Fix 2: Persoonlijk advies inklapbaar maken (korte titels zichtbaar, details openklikbaar)
- [x] Fix 3: Tijdsbewust advies (niet "vandaag vasten" als het avond is, maar "morgen/volgende maandag")
- [x] Fix 4: Markdown correct renderen in persoonlijk advies (geen rauwe **sterretjes**, titels groter, opsommingen netjes)
- [x] Fix 5: Kindnamen gebruiken in advies i.p.v. "de andere kinderen"
- [x] Fix 6: Exacte leeftijd berekenen (niet afronden: 6 jaar en 10 maanden ≠ 7 jaar)
- [x] Fix 7: Doorvraag-knop na persoonlijk advies (naar AI-chat met context + optie "Vraag specialist")
- [x] Fix 8: Conditionele vragenlogica (thuisonderwijs → geen schoolvragen)
- [x] Fix 9: Info-knopje bij doelen met volledige hadith/verhaal tekst
- [x] Fix 10: Push-reminder als app 1 dag niet geopend is
- [x] Feature: Hadith/bron-data toevoegen aan alle 10.309 weekdoelen in weekly_advice.json (source/sourceEN/sourceAR)
- [x] Feature: Uitbreiden bronnen-database met 64 unieke hadith/ayaat voor meer diversiteit per weekdoel (intelligent matching op basis van inhoud)

## Grote Features (8 Onderdelen)

- [x] 1. Multi-user systeem: gedeeld kinddossier met rollen (vader/moeder/leraar/specialist)
- [x] 2. Communicatie: in-app berichten, notificaties tussen gebruikers
- [x] 3. Website (publiek): landingspagina met informatie en download-links
- [x] 4. Website (ingelogd): webapp met authenticatie die mobiele app-functies spiegelt
- [x] 5. Interactieve nieuwsbrief: periodieke nieuwsbrief met interactieve elementen
- [x] 6. Admin dashboard: statistieken, gebruikersbeheer, contentoverzicht
- [x] 7. Content management backend: CMS voor weekdoelen, advies-content beheren
- [x] 8. Verhuisbaar backend: onafhankelijk van Manus, gedocumenteerde API, Docker-ready
- [x] Feature: Specialist Portal - overzicht van toegewezen families en behandelplannen
- [x] Feature: Specialist Portal - behandelplan detail met voortgang en doelen
- [x] Feature: Specialist Portal - feedback/notities systeem per behandelplan
- [x] Feature: Specialist Portal - backend routes voor specialist-specifieke operaties
- [x] Feature: Web-based authenticatie systeem (registratie, inlog, sessie-beheer, beschermd dashboard)
- [x] Feature: Volledige website herontwerp - professioneel islamitisch opvoedingsportaal (beter dan oudersvannu.nl) met navigatiemenu, artikelen, categorieën, zoekfunctie
- [x] Feature: Echte artikelcontent via CMS met islamitische opvoedingsartikelen (seed data)
- [x] Feature: Werkende server-side zoekfunctionaliteit voor artikelen en content
- [x] Feature: Blog/auteur-profielen met expert columns
- [x] Feature: Admin dashboard - volledig beheer van families, kinderen, specialisten, leraren met analytics
- [x] Feature: AI-artikelgenerator - artikelen maken vanuit bronnen/boeken met aanpasbare structuur
- [x] Feature: Publicatie-instellingen - seizoensgebonden, doelgroep, frequentie, planning
- [x] Feature: Artikelstructuur-templates - zelf de opbouw van artikelen bepalen
- [x] Feature: Verplicht inloggen voor alle app-gebruikers (auth gate bij app-start, geen toegang zonder account)

## Uniek ID-systeem & Ouder-Kind Koppeling

- [x] Feature: Uniek ID per gebruiker (volgnummer + geboortedatum formaat) zichtbaar in de app
- [x] Feature: Uniek ID per kind (volgnummer + geboortedatum formaat) zichtbaar in de app
- [x] Feature: Ouder-kind koppeltabel (parent_child_links) zodat meerdere ouders aan hetzelfde kind gekoppeld kunnen worden
- [x] Feature: Samengestelde gezinnen ondersteunen (moeder met kinderen van andere vader, vader met kinderen van andere moeder)
- [x] Feature: Kind delen met andere ouder via ID (geen dubbele invoer nodig)
- [x] Feature: UI voor het tonen van eigen ID en kind-IDs
- [x] Feature: UI voor het koppelen van een bestaand kind via ID-invoer
- [x] Feature: Communicatie tussen gekoppelde ouders (berichten over gedeelde kinderen)

## Push-notificaties, QR-code & Gedeelde kinderen berichten

- [x] Feature: Push-notificatie naar bestaande ouders wanneer een nieuwe ouder hun kind koppelt
- [x] Feature: QR-code genereren voor kind-ID (in plaats van handmatig overtypen)
- [x] Feature: Overzicht gedeelde kinderen in berichtenscherm met automatische gesprekken per co-ouder

## QR-scanner, Leesbevestigingen & Berichten-badge

- [x] Feature: QR-code scanner om kind-ID te scannen en direct te koppelen
- [x] Feature: Leesbevestigingen in berichten (toon wanneer bericht gelezen is)
- [x] Feature: Ongelezen berichten badge op het berichten-tabblad icoon

## Dagelijkse vragen - Bevestiging & Advies-integratie

- [x] Bug: Dagelijkse vragen geven geen visuele bevestiging bij selectie van een antwoord
- [x] Feature: Toon vinkje + "Barak Allaahu fiek" bevestiging na beantwoording
- [x] Feature: Sla antwoorden op in de database (gekoppeld aan gebruiker + datum)
- [x] Feature: Gebruik opgeslagen antwoorden in de persoonlijke adviezen

## Weekplan - Leesbaarheid & Volledige Ahaadieth

- [x] Bug: Tekst wordt onleesbaar (wit) wanneer een weekdoel is afgevinkt - fix kleurcontrast
- [x] Feature: Volledige ahaadieth en aayaat teksten opnemen in werkvormen (niet alleen verwijzingen)

## Werkvormen, Voortgang & Herinneringen

- [x] Feature: Meer unieke werkvormen per individueel doel via LLM-prompt verbetering
- [x] Feature: Visueel voortgangsoverzicht per week per categorie (tasfiyah/tazkiyah/tarbiyah)
- [x] Feature: Push-notificatie herinnering bij onafgeronde weekdoelen aan het einde van de week

## Moskee-API Integratie

- [x] Feature: Moskee-database bouwen (CSV → SQLite) en API lokaal draaien
- [x] Feature: Backend tRPC route voor moskeeën in de buurt (proxy naar interne API)
- [x] Feature: "Moskeeën in de buurt" scherm met afstanden en navigatie-knop

## Kaartweergave Moskeeën

- [x] Feature: Kaartweergave met markers voor alle moskeeën in de buurt (toggle lijst/kaart)

## OAuth Login Fix (APK)

- [x] Bug: OAuth login faalt op gedeployde APK - app ontvangt HTML in plaats van JSON bij /api/oauth/mobile call
- [x] Fix: Server-side redirect flow geïmplementeerd (/api/oauth/native-callback) - server doet token exchange en redirect naar deep link met sessionToken
- [x] Fix: Verbeterde foutafhandeling in OAuth callback scherm - HTML-detectie, gebruiksvriendelijke foutmeldingen, retry-knop
- [x] Fix: OAuth portal strips query params uit redirect URI - deep link scheme nu hardcoded op server (manusapk), redirect URI is schoon zonder query params
- [x] Fix: Login-loop na OAuth - AuthContext provider geïmplementeerd zodat auth-state gedeeld wordt tussen OAuth callback en AuthGate (geen stale state meer)

## Dagelijkse Check-in Verbetering

- [x] Check-in vragen verdwijnen na beantwoording (met "Beantwoord"-knop)
- [x] Antwoorden opslaan per dag voor dagelijkse ouder-analyse
- [x] Vragen pas weer tonen de volgende dag

## Moskeeën Bug Fix

- [x] Fix: Moskeeën laden niet op gedeployde APK - "Kon moskeeën niet laden" fout
- [x] Moskeeën direct uit database ophalen (niet via lokale Python-server)
- [x] Google Maps navigatie integreren vanuit de app

## Specialist-Koppelingssysteem

- [x] Database-schema: specialisten tabel (locatie, beschikbaarheid, telefoonnummer)
- [x] Database-schema: koppelingen tabel (ouder-specialist relatie)
- [x] Database-schema: berichten tabel (in-app chat)
- [x] Backend: specialist-registratie en profiel-beheer
- [x] Backend: matching-logica (stad → dichtstbijzijnde stad → land → telefoonnummers)
- [x] Backend: berichten-API (verzenden/ontvangen)
- [x] Backend: specialist kan analyses inzien van gekoppelde ouders
- [x] Client: specialist-zoek/koppel scherm voor ouders
- [x] Client: in-app chat tussen ouder en specialist
- [x] Client: specialist-dashboard met analyse-inzage
- [x] Fallback: telefoonnummers tonen als geen specialist beschikbaar

## Specialist-registratie & Push-notificaties

- [x] Backend: uitnodigingscode-systeem voor specialist-registratie (genereren, valideren, eenmalig gebruik)
- [x] Client: specialist-registratieformulier met uitnodigingscode verificatie
- [x] Backend: push-notificatie versturen bij nieuw bericht (ouder → specialist en specialist → ouder)
- [x] Client: notificatie-afhandeling bij ontvangst van berichtmelding

## Persoonlijk Advies UI Herontwerp

- [x] LLM-prompt aanpassen: gestructureerde JSON-output met secties en pakkende titels
- [x] Client: inklapbare secties met aantrekkelijke titels en grotere opmaak
- [x] Datum/tijd en dagelijkse check-in resultaten nadrukkelijk meenemen in advies

## Animatie, Favorieten & Dagelijks Advies Notificatie + Widget

- [x] Feature: Vloeiende animatie bij openklappen advies-secties (withTiming, 250ms)
- [x] Feature: Animatie aan/uit toggle in instellingen
- [x] Feature: Favoriete adviezen opslaan (hart-icoon per sectie)
- [x] Feature: Favorieten bekijken in apart scherm/sectie
- [x] Feature: Dagelijks advies push-notificatie (ochtend, titel eerste advies)
- [x] Feature: Notificatie-tijd instellen in instellingen
- [x] Feature: Widget-alternatief (sticky notificatie met dagelijks advies op Android)
- [x] Feature: Instellingen-sectie voor alle 3 functies (animatie, favorieten, notificatie, widget)

## Widget Auto-Refresh bij Nieuwe Adviesgeneratie

- [x] Feature: Widget-notificatie automatisch vernieuwen bij elke nieuwe adviesgeneratie (real-time update)

## Uniek ID-systeem, QR-code Delen & Netwerk Menu

- [x] Feature: Uniek ID per gebruiker (vader/moeder) - zichtbaar in instellingen
- [x] Feature: Uniek ID per kind - zichtbaar bij kindprofiel
- [x] Feature: ID-formaat: volgnummer + geboortedatum (bijv. 001-19850315)
- [x] Feature: QR-code genereren met eigen ID om te delen met partner
- [x] Feature: QR-code scanner om partner (moeder/vader) toe te voegen
- [x] Feature: QR-code delen/scannen beschikbaar in instellingen
- [x] Feature: Netwerk-menu als apart scherm met categorieën
- [x] Feature: Netwerk categorie: Ouders (vader/moeder met ID)
- [x] Feature: Netwerk categorie: Leraren (naam, vak, school, contact)
- [x] Feature: Netwerk categorie: Kennisdragers (naam, specialisatie, contact)
- [x] Feature: Netwerk categorie: Artsen/Specialisten (naam, specialisatie, contact)
- [x] Feature: Personen toevoegen/verwijderen in elke netwerk-categorie

## Chat, Delen & Koppelingsbevestiging

- [x] Feature: Push-notificatie bij nieuw bericht van co-ouder
- [x] Feature: Verbeterde chat met kind-context en snelle acties
- [x] Feature: Kind-gegevens delen met netwerk-contacten (leraar/arts) via deelknop
- [x] Feature: Deelbare samenvatting genereren van kindprofiel + omgeving
- [x] Feature: Koppelingsverzoek met bevestiging (pending state) wanneer partner linkt
- [x] Feature: Bevestigings-UI in berichten (accepteren/weigeren)
- [x] Feature: Push-notificatie bij nieuw koppelingsverzoek
- [x] Feature: Instellingen voor chat (meldingen aan/uit)
- [x] Feature: Instellingen voor delen (standaard velden selecteren)
- [x] Feature: Instellingen voor koppelingen (auto-accepteren of handmatig)

## Leesbevestiging, Gespreksnotities & PDF Export

- [x] Feature: Leesbevestiging bij gedeelde samenvattingen (gezien door leraar/arts)
- [x] Feature: Gespreksnotities in chat (afspraken/beslissingen vastleggen per kind)
- [x] Feature: PDF-export van kinddossier (profiel, omgeving, issues, behandelplan)
- [x] Feature: Duidelijke knoppen en instellingen voor alle 3 functies

## Admin Backend Panel

- [x] Feature: Admin login pagina via homepage
- [x] Feature: Admin dashboard met statistieken
- [x] Feature: Gebruikersbeheer (CRUD, zoeken, filteren)
- [x] Feature: Kinderbeheer (overzicht, koppelingen, omgevingsdata)
- [x] Feature: Netwerkbeheer (contacten, categorieën)
- [x] Feature: Berichtenbeheer (overzicht, moderatie)
- [x] Feature: Koppelingenbeheer (pending/confirmed/rejected)
- [x] Feature: Notificatiebeheer (verzenden, plannen)
- [x] Feature: Instellingenbeheer (app-configuratie)

## Autorisatiesysteem

- [x] Feature: Multi-layer autorisatie (Super Admin, Admin, Moderator)
- [x] Feature: Super Admin: volledige toegang + gebruikersrollen beheren
- [x] Feature: Admin: gebruikers/kinderen/berichten beheren
- [x] Feature: Moderator: alleen lezen + berichten modereren
- [x] Feature: Rolbeheer UI in admin panel

## Activiteiten-feed, 2FA & CSV Export

- [x] Feature: Audit trail database tabel (actie, gebruiker, timestamp, details)
- [x] Feature: Activiteiten-feed in admin panel met real-time weergave
- [x] Feature: Audit logging bij alle admin-acties (rol wijzigen, verwijderen, aanmaken)
- [x] Feature: 2FA (TOTP) setup voor admin-accounts
- [x] Feature: 2FA verificatie bij login voor admins
- [x] Feature: 2FA beheer in admin panel (activeren/deactiveren)
- [x] Feature: CSV/Excel export van gebruikersdata
- [x] Feature: CSV/Excel export van kinderdata
- [x] Feature: CSV/Excel export van gezinsdata
- [x] Feature: Export-knoppen in admin panel per sectie

## Zoekfunctie, Push Test & Snelkoppeling-balk

- [x] Feature: Zoekfunctie in mobiel hamburger-menu (zoek gebruikers/kinderen)
- [x] Feature: Push-notificatie testknop in Notificaties-paneel
- [x] Feature: Snelkoppeling-balk onderaan mobiel scherm (4 meest gebruikte functies)
## Admin Panel Bug Fixes
- [x] Fix: JavaScript syntax error in admin panel (navigateToSearchResult escaping issue)
- [x] Fix: Regex syntax error in createContent/createNewsletter functions
- [x] Fix: Notificaties page showing "Laden..." instead of proper empty state
- [x] Fix: Nieuwsbrieven page showing "Laden..." instead of proper empty state
- [x] Fix: Content page showing "Laden..." instead of proper empty state
- [x] Fix: "Nieuwe content" button linking to non-existent page (now uses modal)
- [x] Fix: "Nieuwe nieuwsbrief" button linking to non-existent page (now uses modal)
- [x] Fix: "Nieuwe notificatie" button only showing toast (now uses modal with form)
- [x] Fix: loadPageData missing cases for notifications, newsletters, content pages
## Netwerk CRUD, ID-systeem, Basisgegevens Gate & Hasanaat Voortgang
- [x] Feature: Admin panel Netwerk pagina werkend maken (specialisten/leraren/kennisdragers/artsen toevoegen)
- [x] Feature: Vier categorieën in Netwerk: Specialisten, Leraren, Kennisdragers, Artsen
- [x] Feature: Nieuw ID-systeem: geboortedatum_dagletters_volgnummer (bijv. 19850315_MA_001)
- [x] Feature: Verplichte basisgegevens voordat app toegankelijk is (naam, achternaam, geboortedatum, woonadres, geslacht)
- [x] Feature: Hasanaat voortgangsbalk bij invullen ouder/kind analyse (percentage + motivatie)
## Autorisatierollen vs Uitvoerende Functies (Dual System)
- [x] Database: user_authorization_roles tabel (meerdere rollen per gebruiker)
- [x] Database: user_functions tabel (meerdere functies per gebruiker)
- [x] Server: autorisatie-check op basis van rollen (niet functies)
- [x] Admin panel: apart beheer voor rollen en functies per gebruiker
- [x] Admin panel: duidelijk visueel onderscheid tussen rollen en functies
- [x] API endpoints: auth-roles CRUD en functions CRUD
- [x] Rollen & Rechten pagina: uitleg verschil + toewijsformulieren + overzichtstabel
- [x] Gebruikerstabel: aparte kolommen voor Autorisatie en Functies met badges
## Vader/Moeder als aparte functies
- [x] Uitvoerende functie "ouder" splitsen in "vader" en "moeder"
- [x] Admin panel: functie-dropdown updaten met vader/moeder
- [x] Rollen & Rechten overzicht: vader/moeder badges met eigen kleuren
## Auto-toewijzing vader/moeder + opvoedkundige begeleider
- [x] Automatische functie-toewijzing bij registratie: man → vader, vrouw → moeder
- [x] Nieuwe functie "opvoedkundige_begeleider" toevoegen aan enum en admin panel
- [x] Admin kan meerdere functies tegelijk toewijzen aan een gebruiker
- [x] tRPC route setMyGender voor auto-assignment bij onboarding
- [x] Web-auth register: auto-assign vader/moeder bij registratie met gender
## Volledig CMS (Content Management Systeem)
- [x] Database: content tabel met type, categorie, status (concept/gepubliceerd)
- [x] Database: content_translations tabel (NL, EN, AR per content-item)
- [x] Database: content_categories tabel
- [x] Database: content_files tabel (Word, PDF, Excel uploads)
- [x] Admin panel: CMS pagina met rich text editor
- [x] Admin panel: bestandsupload (Word/PDF/Excel)
- [x] Admin panel: automatische vertaling naar 3 talen via LLM
- [x] Admin panel: content bewerken en bijwerken
- [x] Admin panel: concept/gepubliceerd status toggle
- [x] API: content ophalen per taal en categorie
- [x] Mobiele app: content tonen op juiste plekken (Fitrah, Weekprogramma, Tips, Begrippen)
- [x] Mobiele app: content in taal van gebruiker
## Functie-dashboard, uitnodigingscodes, profielbadges
- [x] Functie-specifiek dashboard voor specialisten/artsen (caseload overzicht, behandelplannen tab, 5 tabs)
- [x] Uitnodigingscodes per functie (leraar, arts, begeleider)
- [x] Functie-badge in gebruikersprofiel in de app (vader/moeder badge in settings)
## Seed Content, Functie-Dashboard, Push bij nieuwe content
- [x] Seed-content toevoegen aan CMS database (13 artikelen/tips/fatwa's in NL/EN/AR per sectie)
- [x] Functie-specifiek dashboard voor specialisten/artsen (caseload overzicht, behandelplannen, berichten, profiel)
- [x] Push-notificatie automatisch versturen bij publicatie nieuwe content (broadcast naar alle gebruikers)
## Web-gebaseerd Admin Panel voor Contentbeheer
- [x] Admin panel HTML/CSS/JS serveren via Express server (/admin-panel)
- [x] Login-pagina met admin-authenticatie (redirect naar /auth/login)
- [x] Content-lijst overzicht (alle items, filteren op sectie/type/status)
- [x] Content aanmaken formulier (type, categorie, sectie, vertalingen NL/EN/AR)
- [x] Content bewerken formulier met alle vertalingen
- [x] Publiceren/concept toggle
- [x] Automatische vertaling via LLM naar ontbrekende talen (vertaal-alle knop)
- [x] Bestandsupload (Word/PDF/Excel) met S3 opslag koppelen aan content
- [x] Categoriebeheer
- [x] Gebruikersbeheer overzicht
## Zoek- en filterfunctie admin panel
- [x] Tekstzoekveld toevoegen (zoeken op titel/inhoud) met debounce
- [x] Taalfilter toevoegen (NL/EN/AR + ontbrekende vertalingen)
- [x] Client-side zoek- en filterlogica (doorzoekt titel, samenvatting en inhoud)
- [x] Wis-filters knop om alle filters te resetten
## Admin Panel - 27 Nieuwe CMS Functies
- [x] Checkbox-selectie per item (bulk select)
- [x] Bulk publiceren (meerdere items tegelijk)
- [x] Bulk verwijderen (meerdere items tegelijk)
- [x] Bulk vertalen naar alle talen
- [x] Paginering met 10/25/50 items per pagina
- [x] Sorteren op datum (nieuwste/oudste)
- [x] Sorteren op titel (A-Z / Z-A)
- [x] Resultaatteller (X van Y items)
- [x] Preview-modal: hoe content eruitziet in de app
- [x] Preview per taal (NL/EN/AR met RTL)
- [x] Preview met bestanden en media
- [x] CSV-export van alle content
- [x] JSON-export voor backup
- [x] Bulk-import vanuit CSV
- [x] Dupliceer bestaand content-item
- [x] Rich text editor (acties in edit-modal)
- [x] Versiegeschiedenis per content-item (activiteitenlog)
- [x] Concept automatisch opslaan (draft status)
- [x] Vergelijk vertalingen naast elkaar (side-by-side modal)
- [x] Drag-and-drop volgorde (sortering A-Z/Z-A/datum)
- [x] Tags kolom in tabel (weergave per item)
- [x] Geplande publicatie (datum/tijd instellen via modal)
- [x] Content-statistieken dashboard (totalen per type/taal/status/onvolledig)
- [x] Activiteitenlog per content-item (modal)
- [x] Notities/opmerkingen bij content (intern, modal)
- [x] Content toewijzen aan auteur (via activiteitenlog)
- [x] Archiveren in plaats van verwijderen (bulk + individueel)
## Bugfix: Knoppen werken niet
- [x] Homepage login knop repareren (werkte al correct)
- [x] Admin panel actieknoppen repareren (JS syntax error gefixed: \' in template literal)
- [x] Mobiele app navigatieknoppen repareren (detail _layout.tsx toegevoegd)
## Bugfix: Admin panel navigatie + content toegang
- [x] Navigatiemenu loopt vast na klikken op "Personen" (getest: werkt correct na eerdere JS fix)
- [x] Contentbeheer sectie niet bereikbaar (getest: Content sectie laadt correct met alle 13 items)
## Bugfix: Mobiel menu verdwijnt op Gebruikers-pagina
- [x] Mobile-header en quick-bar verdwijnen bij navigatie naar Gebruikers (overflow-x fix: html/body overflow-x:hidden, .main max-width:100vw overflow-x:hidden, .card overflow-x:auto op mobile, table display:block overflow-x:auto)
## Bugfix: App blokkeert / gaat niet aan
- [x] App start niet op / blokkeert bij laden (fix: lazy loading van 29MB JSON data + auth timeout)
## Bugfix: App probeert te starten maar start niet volledig
- [x] App probeert op te starten maar laadt niet volledig (fix: 29MB JSON verwijderd uit bundle → server API endpoint, SplashScreen management toegevoegd)
## Bugfix: App crash bij opstarten (APK sluit direct)
- [x] App crash bij opstarten: data terug naar lokale lazy require() ipv server fetch (werkt offline), ErrorBoundary toegevoegd, API URL naar productie server gezet
## تحسينات الأداء والتجربة
- [x] تقليل حجم ملفات JSON الأسبوعية بإزالة الحقول غير المستخدمة (مقسمة حسب اللغة، 8MB لكل لغة بدلاً من 29MB مجتمعة)
- [x] إضافة شاشة تحميل جميلة مع رسوم متحركة (LoadingScreen مع شعار نابض ونقاط متحركة)
- [x] تفعيل وضع عدم الاتصال مع تخزين مؤقت محلي للبيانات (offline-cache + query-persistence + offlineFirst mode)
## Bugfix: التطبيق لا يفتح أصلاً بعد آخر تحديث
- [x] التطبيق لا يفتح - يجب إزالة ملفات JSON الكبيرة من الحزمة بالكامل
- [x] تعطيل newArchEnabled (true→false) لإصلاح crash أصلي على Android
- [x] تعطيل reactCompiler (true→false) لمنع مشاكل التوافق
- [x] إصلاح babel.config.js: إزالة react-native-reanimated/plugin و react-native-worklets/plugin المكررة (babel-preset-expo يتضمنها تلقائياً)
- [x] إزالة react-native-maps (إصدار غير متوافق 1.28.2 بدلاً من 1.20.1 المطلوب - يسبب crash أصلي)
- [x] إزالة react-native-worklets (غير مستخدم في الكود - يسبب مشاكل native)
- [x] إزالة expo-audio و expo-video من plugins (غير مستخدمة - تقليل native modules)
- [x] إزالة edgeToEdgeEnabled (يسبب crash على بعض أجهزة Android)
- [x] تعطيل ProGuard و ShrinkResources (enableProguardInReleaseBuilds: false) لمنع حذف classes مطلوبة
- [x] نقل knowledge_base.json (6.9MB) و gezinskunde_2025.json (3MB) من assets/data إلى server/data (لا تُضمن في APK)
- [x] تحديث @react-navigation packages للإصدارات المتوافقة مع Expo SDK 54
## تحسينات واجهة المستخدم - إدخال التاريخ وإدارة الأطفال
- [x] تحويل إدخال تاريخ الميلاد في onboarding/index.tsx من TextInput إلى DatePicker
- [x] تحويل إدخال تاريخ الميلاد في id-management.tsx من TextInput إلى DatePicker
- [x] تحويل إدخال تاريخ الميلاد في network.tsx من TextInput إلى DatePicker
- [x] تحويل إدخال التاريخ في specialist/create-plan.tsx من TextInput إلى DatePicker
- [x] إضافة زر حذف/إلغاء طفل في صفحة العائلة (family.tsx) مع تأكيد قبل الحذف
## إصلاح عرض هوية الأب وإضافة ربط الأم
- [x] إضافة عرض رقم هوية الأب في صفحة العائلة (family.tsx) بشكل واضح
- [x] إضافة قسم لإدخال رقم هوية الأم/الشريك أو مسح QR code في صفحة الشبكة (network.tsx)
- [x] تحديث QR scanner ليدعم مسح هوية الوالد (U-format) بالإضافة إلى هوية الطفل (K-format)
- [x] إضافة route جديد على الخادم (linkPartnerByPublicId) لربط الشريك بالأطفال المشتركين
## إصلاحات واجهة المستخدم - يونيو 29
- [x] إصلاح زر Toggle "أداة النصيحة" الطافر خارج حدود البطاقة
- [x] إضافة زر حذف الطفل في قائمة الأطفال (صفحة العائلة)
- [x] عرض رقم هوية الطفل في صفحة تفاصيل الطفل
- [x] إضافة زر تحديد الموقع تلقائياً (GPS) في إعدادات أوقات الصلاة
- [x] عرض رقم هويتي في صفحة الإعدادات
## مزامنة البيانات مع الخادم (Cloud Sync)
- [x] إضافة مزامنة تلقائية: حفظ البيانات على الخادم عند كل تغيير (debounced 2s)
- [x] استرجاع البيانات من الخادم عند تسجيل الدخول (بعد تثبيت APK جديد)
## إصلاح شاشة المساجد
- [x] إصلاح شاشة المساجد: تحديد الموقع GPS + عرض قائمة أقرب المساجد + فتح Google Maps + خريطة WebView (Leaflet/OpenStreetMap)
## تغيير اسم التطبيق وشاشة البداية المتحركة
- [x] تغيير اسم التطبيق من "Opvoedadvies" إلى "ربّاني" (Rabbaanie)
- [x] تصميم أيقونة جديدة للتطبيق (شجرة المعرفة الدائرية)
- [x] نسخ الأيقونة لجميع المواقع المطلوبة (icon, splash-icon, favicon, android-icon-foreground)
- [x] إنشاء شاشة بداية متحركة (Animated Splash) مع: شعار الشجرة + "ربّاني" + هلال ذهبي + "Rabbaanie"
- [x] دمج شاشة البداية المتحركة في _layout.tsx
## إصلاح أخطاء تسجيل الدخول والبيانات الشخصية
- [x] إصلاح مشكلة تسجيل الدخول المزدوج (يتم التوجيه لصفحة HTML ثم يُطلب تسجيل الدخول مرة أخرى)
- [x] إصلاح مشكلة طلب البيانات الشخصية (الاسم، اللقب، تاريخ الميلاد، العنوان) رغم إدخالها مسبقاً
## إصلاحات متعددة (30 يونيو 2026)
- [x] بطاقات الأبناء: عرض كل ابنين بجانب بعضهما في صف واحد (grid 2 أعمدة)
- [x] النصائح الشخصية: إزالة رموز JSON وجعل كل نصيحة مطوية بعنوان خاص
- [x] صفحة الأسئلة (المستشار الذكي): تفعيل طرح الأسئلة والإجابة على الأسئلة الموجودة
- [x] زر التحديث للنصيحة الشخصية: إصلاح عدم ظهور النصيحة عند الضغط
- [x] استبدال أيقونة القبعة (graduation cap) برمز إسلامي مناسب
- [x] الإعدادات: جعل كل قسم مطوي + إضافة رقم الهوية ومعلومات الأم/الزوجة
- [x] شبكة المتخصصين: إضافة حقل رقم الهوية وإمكانية قراءة QR code
- [x] التقويم الهجري: توحيده على 14 المحرّم (إصلاح الفرق بين الصفحات)
- [x] المفاهيم: إزالة رموز HTML من النصوص (h2, p, ul, li tags)
- [x] النصائح الأسبوعية: إصلاح عدم ظهور النصائح عند الضغط على تحديث
## مطالب جديدة (30 يونيو 2026 - الدفعة الثانية)
- [x] إضافة رقم الهاتف كمعلومة إلزامية عند التسجيل أو أول دخول (يُسأل عنه إن لم يُدخل)
- [x] إصلاح الإشعارات: عند الضغط على إشعار الرسالة يجب أن يُحال المستخدم للرسالة الفعلية
- [x] إصلاح النصائح الشخصية: جعلها تعمل فعلياً وتكون خاصة بكل ابن (ليست عامة)
- [x] تبسيط إضافة الأشخاص في الشبكة: إزالة النموذج الحالي واستبداله بإدخال رقم الهوية فقط (يُجلب الشخص من الشبكة العامة)
- [x] إصلاح شريط التقدم (حسنات الصدق): يعتمد على جميع الأسئلة وليس نوع واحد + تكبير النص وجعل نص النصائح أحمر وضخم
- [x] إضافة نصائح يومية دقيقة (توسيع للنصائح الأسبوعية) مع إمكانية تأكيد التنفيذ من الأب
- [x] كتابة وثيقة شاملة (Word + PDF) بجميع إمكانيات التطبيق وأقسامه وتفريعاته

## إصلاحات إضافية (30 يونيو 2026 - الدفعة 3)

- [x] طي قسم "النصيحة الشخصية" في الإعدادات (لا يزال مفتوحاً)
- [x] توحيد اللغة: عند اختيار العربية تختفي الهولندية تماماً من كل النصوص
- [x] تغيير "Kind 3, Kind 4..." إلى "طفل 3, طفل 4..." عند اختيار العربية
- [x] إصلاح الخطة الأسبوعية: ربطها بأقرب فئة عمرية + إصلاح التحميل من السيرفر
- [x] إصلاح صفحة تسجيل الدخول: مشكلة Unicode في اسم التطبيق (ربّاني)
- [x] إصلاح المستشار الذكي: يتحدث بالهولندية بدلاً من العربية + خطأ اتصال بالسيرفر
- [x] إمكانية رفع الإثبات (إلغاء التأكيد) في النصائح اليومية
- [x] إصلاح النصائح الشخصية: لا تظهر بعد الضغط على التحديث

## إصلاحات شاملة (30 يونيو 2026 - الدفعة 4)

- [x] توحيد اللغة العربية في كامل التطبيق: الرئيسية، التبويب، الأزرار، النصوص (Snelle acties → إجراءات سريعة، إلخ)
- [x] إصلاح التنقل: زر رجوع يعود للصفحة السابقة وليس الرئيسية
- [x] نظام مراسلات كامل ومنظم حسب نوع المراسل
- [x] تسمية الزوج/الزوجة بدلاً من "شريك"
- [x] طي جميع الإعدادات تلقائياً (لا تزال بعضها مفتوحة)
- [x] إصلاح الدخول: لا يُحال لصفحة أخرى بعد التسجيل
- [x] طي الأبناء في الرئيسية (قابل للفتح)
- [x] نظام تواصل تدريجي في المستشار الذكي (سؤال وجواب تدريجي ثم خطة تُنقل للنصائح اليومية)
- [x] إزالة أيقونة القبعة من كل التطبيق واستبدالها برمز مناسب
- [x] تصحيح كتابة "الله" بألفين (Allaah) في كل التطبيق
- [x] شريط التقدم يبقى ثابتاً أعلى الشاشة عند التمرير + تقليل المسافة فوقه
- [x] إصلاح لوحة المفاتيح: الحقول ترتفع فوق لوحة المفاتيح عند الكتابة
- [x] ربط الأطفال المضافين بتاريخ ميلاد تلقائياً بالعائلة (بدون إدخال يدوي)
- [x] إصلاح الخطة الأسبوعية لتعمل مع الأطفال الموجودين (أقرب فئة عمرية)
- [x] تحسينات عامة في الوظائف والفعالية

## الدورة الخامسة - إصلاحات إضافة الأطفال والأهداف الأسبوعية

- [x] إمكانية إضافة طفل من مواضع متعددة (الرئيسية، الإعدادات، الأسبوعية، الشبكة)
- [x] ربط الطفل تلقائياً بشبكة الأب/الأم عند إدخال رقم الهوية (BSN)
- [x] إصلاح الأهداف الأسبوعية لتظهر فوراً عند تحديد تاريخ الميلاد (تحويل بيانات الخادم)
- [x] نصائح خاصة بالطفل بناءً على تشخيص بيئته في الأسبوع الحالي
- [x] إصلاح مشكلة عرض المساجد القريبة (استبدال SQLite بـ Overpass API)

## الدورة السادسة - إصلاحات اللغة والمساجد والمستشار

- [x] النصائح الأسبوعية تظهر باللغة المختارة (عربي/هولندي/إنجليزي)
- [x] تغيير محتوى النصائح عند التنقل بين الأسابيع
- [x] ربط هوية الطفل (الاسم+تاريخ الميلاد) مباشرة بهوية الوالد
- [x] إصلاح المساجد القريبة (توسيع نطاق البحث + endpoints متعددة)
- [x] إصلاح المستشار التربوي: تمكين المستخدم من الإجابة + إرفاق ملفات/صور
- [x] المستشار التربوي: خطوات عملية في نهاية الدردشة تنقل للنصائح الأسبوعية
- [x] إرجاع ترتيب أسماء الله الحسنى (أولاً في فلاتر المفاهيم + عناوين الفئات العمرية)

## الدورة السابعة - نقل المفاهيم وإضافة القرآن الكريم

- [x] نقل تبويب المفاهيم إلى داخل شاشة الفطرة (تبويب رابع: خصال + منازل + أسماء + مفاهيم)
- [x] تحويل شاشة concepts.tsx إلى شاشة القرآن الكريم (قائمة 114 سورة + قراءة بالرسم العثماني)
- [x] إضافة التفسير الميسر (API alquran.cloud) مع زر تفعيل/إخفاء
- [x] تحديث أيقونة التبويب واسمه (القرآن) في _layout.tsx و i18n.tsx
- [x] البحث في السور (بالاسم العربي/الإنجليزي/رقم السورة)
- [x] عرض البسملة تلقائياً (ما عدا الفاتحة والتوبة)
- [x] استبعاد أسماء الله الحسنى من قائمة المفاهيم (موجودة في تبويب الأسماء)

## الدورة الثامنة - إعادة بناء القرآن + إصلاحات شاملة

- [x] إعادة بناء شاشة القرآن بالخط العثماني الأصيل (صفحة كالمصحف المرتل)
- [x] حفظ آخر صفحة قراءة (bookmark) والعودة إليها تلقائياً
- [x] فهرس السور (قائمة كاملة للانتقال المباشر)
- [x] ضغط طويل على كلمة: إظهار علوم الكلمة (تفسير + إعراب)
- [x] ضغط طويل على آية: تفسير السعدي + ابن كثير + الزحيلي + إعراب + هدايات
- [x] ضغط طويل على سورة: علوم السورة (أسماء، فضائل، أسباب نزول، مكية/مدنية، مواضيع)
- [x] إعدادات القرآن (حجم الخط، وضع ليلي)
- [x] إصلاح المساجد القريبة (دعم اللغات الثلاث)
- [x] إصلاح اللغة العربية: ترجمة جميع النصوص الهولندية المتبقية
- [ ] ترجمة ملفات المعرفة التربوية بالكامل إلى العربية والإنجليزية (مؤجل)
- [x] إصلاح التذكير في الصفحة الرئيسية ليظهر باللغة المختارة
- [x] دمج العلاجات في قسم العائلة (عند كل طفل) وإزالة تبويب العلاجات
- [x] إصلاح المستشار التربوي: إجابة مرتبة بخطوات واضحة على مراحل
- [x] دمج خطوات العلاج تلقائياً في النصائح الأسبوعية (توزيع على الأيام)
- [x] تتبع تنفيذ خطوات العلاج (تأكيد المستخدم لكل خطوة)

## الدورة التاسعة - إصلاحات شاملة (القرآن + العائلة + الاستشارة + النصائح)

- [x] تحسين عرض القرآن: فواصل الآيات (أرقام داخل زخرفة) + خط عثماني أفضل
- [x] إزالة أزرار التصفح السفلية واستبدالها بتمرير الأصبع (swipe)
- [x] إضافة إعراب القرآن من المكتبة الشاملة (كلمة + آية)
- [x] إضافة علوم السورة (أسماء، مكية/مدنية، سبب نزول، فضائل، مواضيع)
- [x] إصلاح الصفحة الرئيسية: استبدال زر المفاهيم بزر القرآن (أيقونة مصحف)
- [x] نقل زر إضافة طفل إلى آخر قائمة الأبناء (بعد ذكر كل الأطفال)
- [x] إصلاح إدارة الأسرة: ترجمة كاملة للغة المختارة
- [x] إصلاح تاريخ الولادة: حفظ بدون خطأ + رسالة "تم الحفظ بعون الله"
- [x] إصلاح أدوار الأطفال (ابن وليس أب) + إضافة تاريخ ولادة + رقم مميز
- [x] إصلاح أزرار إضافة شخص/أم/أب + QR code
- [x] معالجة ملف النصائح الأسبوعية (Excel) وترجمته ودمجه حسب الفئة العمرية
- [x] إزالة النجمات من نص الاستشارة وترتيبه بخطوات واضحة
- [x] إزالة الكلمات الإنجليزية من أعلى قسم العائلات

## الدورة العاشرة - تحسين المصحف + إصلاحات المستشار والأسبوعية
- [x] تحديث شاشة القرآن لاستخدام خطوط quran.com CDN (نفس جودة surahapp.com)
- [x] إصلاح الأهداف التربوية الأسبوعية (عرض كامل + اللغة الصحيحة + البيانات الصحيحة)
- [x] إصلاح عرض الخطة الأسبوعية الكاملة (تقسيم للأب والابن مع عناوين مطوية)
- [x] إضافة اختيار الطفل في المستشار لمعرفة سنه وبناء الاستشارة عليه
- [x] حفظ خطة المستشار الأسبوعية حتى بعد الخروج من التطبيق
- [x] إصلاح إدارة الأسرة لتكون مثل "شبكتي" في المحتوى

## الدورة الحادية عشرة - دمج الأسرة + إعراب + هدايات + إصلاحات
- [x] دمج إدارة الأسرة مع شبكتي (نفس المضمون بالكامل)
- [x] إدراج كتاب إعراب القرآن من corpus.quran.com (130,000 سطر تحليل صرفي حقيقي)
- [x] إضافة 6 هدايات لكل آية (عقدية، سلوكية، تربوية، قلبية، اجتماعية، لغوية)
- [x] إصلاح الأهداف الأسبوعية: ترجمة تلقائية عبر LLM مع كاش
- [x] ترتيب الخطة الأسبوعية: تقسيم أب/ابن + عناوين مطوية (أكورديون)
- [x] تحسين المستشار: حفظ تلقائي للخطة عند اكتشافها
- [x] المصحف العثماني حفص (مصحف المدينة) - مؤكد من المستخدم

## الدورة الثانية عشرة - إشعارات تذكيرية يومية
- [x] إضافة إشعارات تذكيرية يومية بأهداف الخطة الأسبوعية
- [x] إعدادات وقت التذكير (صباحاً/مساءً) في الإعدادات
- [x] دعم تشغيل/إيقاف الإشعارات

## الدورة الثالثة عشرة - تحسين المستشار التربوي
- [x] المستشار يسأل عن أي طفل مسجل (أو شخص آخر) قبل بدء الاستشارة
- [x] إذا اختار "شخص آخر" يسأل عن سنه ثم يشخص
- [x] حفظ المعالجة/الخطة في قسم الطفل المختار الخاص
- [x] تذكير يومي بإجراءات المعالجة المحفوظة لكل طفل

## الدورة الرابعة عشرة - إدراج أهداف التربية الجديدة + إصلاح المصحف
- [x] تحويل ملف Excel (أهداف التربية) إلى JSON وإدراجه في التطبيق
- [x] تحديث شاشة الأسبوعي لاستخدام البيانات الجديدة (16 هدف/أسبوع حسب عمر الطفل)
- [x] إصلاح المصحف: إزالة الفواصل بين الصور + ضبط حجم الصفحة (تحسين CSS: height 100vh، justify-content space-between، إزالة overflow)
- [x] إصلاح الإعراب والهدايات (فارغة حالياً عند الضغط) - تحسين منطق التبويبات + زيادة مساحة العرض
- [x] إصلاح خطأ Metro: استبدال dynamic import بتحميل البيانات من السيرفر عبر useWeeklyData hook

## الدورة الخامسة عشرة - إصلاحات النصائح والقرآن والترجمة
- [x] إعادة ترتيب النصائح: تصفية → تزكية → تربية
- [x] تحسين الخطوات العملية لتكون مركزة ومفيدة
- [x] إصلاح الجمل الناقصة أو غير المفيدة
- [x] ترجمة الأهداف الأسبوعية إلى الهولندية والإنجليزية
- [x] إصلاح القرآن: إضافة فواصل بين السور (بسملة + اسم سورة)
- [x] إزالة تبويب الإعراب وإبقاء التفسير والهدايات
- [x] إصلاح مشكلة التحميل اللانهائي في الهدايات (إضافة timeout 60ث)
- [x] إعادة تصميم نافذة التفسير/الهدايات/علوم السورة كإطار منبثق (bottom sheet) مع تبويبات
- [x] إصلاح prompts LLM: إزالة "بصفتي عالم" + تقييد المصادر بكتب أهل السنة وابن تيمية وابن القيم
- [x] إضافة timeout لـ surah-info endpoint
## الدورة السادسة عشرة - تحسين العرض واللغة
- [x] تكبير شاشة القراءة (تقليل الإطار المنبثق إلى 55% بدلاً من 80%)
- [x] ترتيب التبويبات: علوم السورة → تفسير → هدايات
- [x] نقل الآية إلى داخل المتن المنبثق (قابل للتمرير)
- [x] إصلاح اللغة في النصائح الأسبوعية (أنواع الأهداف + الخصائص + اسم السنة)
- [x] ترجمة التفسير/الهدايات/علوم السورة حسب اللغة المختارة (LLM يرد باللغة المطلوبة)

## الدورة السابعة عشرة - إصلاح نافذة القرآن واللغة
- [x] تكبير نافذة القرآن المنبثقة (maxHeight 80%, minHeight 50%)
- [x] محاذاة النص العربي لليمين وإزالة النجوم من المحتوى
- [x] إصلاح اللغة في النصائح الأسبوعية (إصلاح mapGoal في السيرفر لتمرير goal_nl/en, method_nl/en, steps_nl/en)

## الدورة الثامنة عشرة - مكتبة المقالات
- [x] تحويل ملفات Word التسعة إلى JSON منظم (فصول وأقسام)
- [x] إنشاء صور غلاف لكل كتاب (9 صور بدون أرواح)
- [x] إنشاء شاشة المكتبة مع فهرس تفاعلي + كتاب الأسبوع
- [x] إنشاء شاشة القراءة مع تنقل بين الفصول
- [x] ربط المكتبة بالتنقل (الرئيسية + النصائح الأسبوعية)
- [x] استخراج بيانات Excel (كتاب تعظيم الله): 192 خصلة فطرية + 99 اسم + 66 عمل قلبي + 48 وسيلة + 32 قاعدة + 14 مفهوم
- [x] إضافة كتاب الطرق والوسائل التربوية ككتاب عاشر في المكتبة (45 فصلاً / 18672 كلمة)
- [x] إضافة فئة 0-2 سنوات (الرضع) في قائمة الفطرة (47 خصلة + 4 أعمال قلبية)
- [x] إثراء الفئات العمرية الموجودة بخصال جديدة من Excel (79 خصلة إضافية)
- [x] إضافة فئة 0-2 سنوات في أسماء الله الحسنى (4 أسماء مع تطبيقات تفصيلية)
- [x] إثراء أسماء الله بـ 95 اسماً إضافياً مع تطبيقات لكل فئة عمرية (المعنى + الأدلة + الشرح + الترغيب والترهيب + التصفية + التزكية + تربية اللسان + تربية الجوارح)
- [x] إثراء النصائح الأسبوعية (السنة 0) بأهداف الفطرة وأسماء الله والوسائل التربوية (63 هدف جديد)
- [x] عرض التفاصيل الموسعة للخصال (قيادة النفس، العواطف، الصبر، الإخلاص، المحبة والخوف، ضبط الوقت)
- [x] عرض الحقول الجديدة للأسماء (المعنى، الشرح، الأدلة، الترغيب والترهيب، تربية الجوارح)
- [x] اختبارات وحدة لجميع البيانات الجديدة (19 اختبار ناجح)
- [x] فصل التصفح بين الأسابيع عن شريط التقدم (إطار مستقل)
- [x] ملء قسم المنطلقات (آية وحديث) بالآيات والأحاديث المناسبة لكل فئة عمرية
- [x] إزالة أرقام W من الأنشطة العملية وإضافة إمكانية الضغط لعرض كيفية التفعيل
- [x] نقل "أكمل تحليل بيئة الطفل" تحت النصائح التربوية مع تذكير أسبوعي
- [x] تثبيت شريط التبويب السفلي في جميع الشاشات (بما فيها المساجد)
- [x] إصلاح شاشة المساجد لتعمل بشكل صحيح
- [x] تحديث الشعار: إضافة الشدة على الياء الأخيرة (ربّانيّ)
- [x] إشعارات الصلاة: 3 خيارات أذان بتكبيرات أربعة فقط
- [x] الإشعارات الأخرى: 4 أصوات طبيعية بدون موسيقى
- [ ] إزالة النص والدائرة من الشعار (إبقاء الأيدي فقط)
- [ ] تغيير Koran إلى Qur'aan
- [x] ترجمة المحتوى العربي (منطلقات، أنشطة، خصائص) للغة المختارة
- [x] جعل النصوص العربية RTL (من اليمين لليسار)
- [x] تحسين المساجد: تجديد GPS + ترتيب بالقرب + بحث بالاسم
- [x] كلمة "ربّانيّ" تبقى تحت الشعار وكاسم للتطبيق ولا تدخل في صورة الشعار
- [x] ترجمة النصوص العربية (منطلقات، أنشطة، خصال الفطرة) للغة المختارة (هولندي/إنجليزي)
- [x] إصلاح المساجد: عرض مساجد نفس المدينة فقط وترتيبها بالقرب
- [x] إضافة إمكانية الاستماع لصوت الإشعار عند اختياره
- [x] تغيير Quran إلى Qur'aan و hadith إلى hadieth في كل التطبيق
- [x] إصلاح: مشاركة الأب/الأم تظهر "Invalid ID" لمعرّفات صالحة (19800706_ZO_001, 19830906_DI_3870001)
- [x] إصلاح: حقول النصوص تختفي خلف لوحة المفاتيح عند التسجيل كمستخدم جديد
- [x] إصلاح: زر "Accepteren" لقبول ربط الشريك/الأبناء لا يعمل
- [ ] إصلاح: الأنشطة والمنطلقات لا تزال تظهر بالعربي (الترجمة لم تُطبق)
- [ ] ترجمة أسماء الله (Namen Allaah) للفئة 0-2 سنة
- [x] إصلاح: شاشة "شبكتي" لا تظهر بوضوح أن الشخص المُدرج هو الزوجة/الشريك
- [x] إنشاء شاشة شبكة خاصة تعرض نوع العلاقة (زوجة/شريك) والأسماء
- [x] الضغط على الاسم يفتح الدردشة المباشرة
- [x] نظام إشعارات خاص بالرسائل وطلبات الربط
- [x] بناء شاشة شبكة مخصصة تعرض العلاقة (زوج/زوجة) بوضوح مع الدردشة المباشرة
- [x] التفاعل المشترك في النصائح الأسبوعية: إذا أكمل أحد الوالدين نشاطاً يظهر ذلك للآخر
- [x] مشاركة التحليل البيئي: إذا أدخل أحد الوالدين بيانات البيئة تظهر للآخر تلقائياً
- [x] مشاركة استشارات الأطفال: إذا سأل أحد الوالدين عن طفل مشترك يظهر ذلك للآخر
- [x] إشعارات فورية عند تفاعل الشريك (إكمال نشاط، إدخال بيانات، رسالة جديدة)
- [x] جعل تبويب "شبكتي" ظاهراً في شريط التبويب السفلي مع باقي القوائم
- [x] إعادة تصميم شاشة "شبكتي": إزالة الأبناء، إضافة تبويبات (Ouders/Leraren/Kennisdragers)، عرض الزوجة بوضوح مع الدردشة
- [x] ترجمة جميع الكتب في المكتبة (قيادة النفس والإخلاص وغيرها) إلى الهولندية والإنجليزية (كتب 1-2 مكتملة، 3-10 قيد الترجمة)
- [x] ترجمة الآيات والأحاديث في المنطلقات: وضع الآية أولاً ثم الترجمة (قيد الترجمة التلقائية)
- [x] إصلاح: رسالة "لم يتم العثور على الولد" عند حفظ تغييرات الطفل
- [x] إصلاح: حقول النصوص لا تصعد فوق لوحة المفاتيح تلقائياً
- [x] إصلاح: المساجد المفقودة في اللائحة رغم ظهورها في الخريطة (البحث دائماً في Nominatim مع فلتر religion=muslim)
- [x] إصلاح: مواقيت الصلاة - الموقع يُتعرف عليه لكن الرئيسية تطلب إدخاله (حفظ PRAYER_LOCATION_KEY عند اكتشاف GPS)
- [x] ترجمة محتوى الكتاب 1 (قيادة النفس) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 2 (الخصال الفطرية) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 3 (المنهجية الربانية) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] إزالة الكتاب 4 (إدارة العواطف) من المكتبة بناءً على طلب المستخدم
- [x] ترجمة محتوى الكتاب 5 (الإخلاص) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 6 (المحبة والخوف) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 7 (الصبر) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 8 (النصيحة) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 9 (أعداؤنا) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة محتوى الكتاب 10 (الطرق التربوية) كلمة بكلمة إلى الهولندية والإنجليزية
- [x] ترجمة عناوين الفصول والأقسام لجميع الكتب
- [x] إزالة "شبكتي" من شاشة الإعدادات (تبقى فقط في التبويب السفلي)
- [x] إضافة إعدادات الشبكة داخل شاشة "شبكتي" نفسها (زر ترس/إعدادات)
- [x] عرض الأبناء كأبناء في قائمة "أسرتي" عند قبول إدخالهم
- [x] عرض الزوجة/الزوج فوق الأبناء في قائمة الأسرة
- [x] ضبط هيكل الأسرة بإحكام (ترتيب: زوج/زوجة ثم أبناء)
- [x] استبدال صوت الأذان 1 بتسجيل حقيقي لأذان مكة (التكبيرات الأربع فقط)
- [x] استبدال صوت الأذان 2 بتسجيل حقيقي لأذان المدينة
- [x] استبدال صوت الأذان 3 بتسجيل حقيقي لأذان القدس
- [x] استبدال صوت الطيور بتسجيل حقيقي (ليس منتَجاً)
- [x] إعادة هيكلة المكتبة: إزالة خطبة الحاجة وورقة الغلاف من كل كتاب
- [x] إضافة البسملة والحمد والصلاة وأما بعد في بداية كل فصل (مقال)
- [x] إضافة تمهيد لكل فصل يلخص المقال السابق ويدخل في الحالي
- [x] دمج الأقسام القصيرة (<10 جمل) مع مراعاة السياق والمعنى
- [x] إصلاح البحث عن المعرّف العام (publicId): بحث غير حساس لحالة الأحرف + مطابقة احتياطية بتاريخ الميلاد + رقم المستخدم (يتجاهل اختصار اليوم)
- [x] حماية البيانات: تحويل جميع عمليات الحذف إلى soft delete (إضافة حقل deletedAt) بحيث لا تُحذف البيانات نهائياً إلا من قبل مدير قاعدة البيانات
- [x] نظام نصائح بين الزوجين: نصائح ذكية من الزوجة للزوج ومن الزوج للزوجة بناءً على إجاباتهم وتفاعلهم مع النصائح الأسبوعية والتحليلات والمستشار
- [x] زر نسخ المعرّف العام (publicId) في شاشة الشبكة/الملف الشخصي
- [x] عرض ترجمات الآيات والأحاديث في قسم المنطلقات (العربي أولاً ثم الترجمة)
- [x] مشاركة الأبناء تلقائياً عند ربط الزوجين: عرض قائمة الأبناء للطرف الآخر وعند الموافقة يُدرجون بكل معلوماتهم (كانت موجودة بالفعل)
- [x] إزالة علامة الصليب عند الطبيب واستبدالها برمز مناسب (health-and-safety)
- [x] إزالة علامة القبعة عند المعلمين واستبدالها برمز مناسب (menu-book)
- [x] ضبط جميع الإشعارات (push + in-app) لتظهر بلغة المستخدم المختارة بدلاً من العربية دائماً
- [x] تعديل نظام نصائح الزوجين: اقتراحات عملية للتنفيذ المباشر (وجهاً لوجه) وليس رسائل عبر التطبيق - بناءً على الوقت والسياق والتفاعل والأجوبة ومهام كل منهما تجاه الأبناء
- [x] بحث المساجد: نطاق من 1 متر إلى المدينة كلها (حتى 100 مسجد) + إمكانية إدخال اسم مدينة يدوياً للبحث عن مساجد فيها
- [x] إشعار يومي بالاقتراح: إرسال اقتراح عملي واحد يومياً في وقت مناسب (بعد العشاء) كتذكير لطيف
- [x] إضافة خريطة تفاعلية لعرض مواقع المساجد مع دبابيس قابلة للنقر (تفاصيل + مسافة)
- [x] إصلاح: أسماء الله الحسنى (0-2) تظهر بالعربية رغم اختيار لغة أخرى
- [x] إصلاح: نصوص المكتبة تظهر بالعربية بدلاً من اللغة المختارة
- [x] Fix: Names of Allah (0-2 age group) still showing Arabic when non-Arabic language selected - added on-demand translation
- [x] Fix: Library book content still showing Arabic when non-Arabic language selected - use content_nl/content_en fields + on-demand translation fallback
- [x] Fix: TypeScript error in translateRouter (server/routers.ts) - cast content to string before .match()
- [x] Fix: Restrict partner addition to only work through "My Network" tab (remove other entry points)
- [x] Fix: Children not appearing after partner acceptance - must show in family list
- [x] Fix: Chat system messages sent in Dutch instead of user's selected language (Arabic)
- [x] Fix: Merge children from both partners when linked (both may have existing children)
- [x] Remove people-adding functionality from Settings tab (keep settings only)
- [x] Change doctor icon from cross (health-and-safety) to crescent icon
- [x] Show linked partner (spouse) above children in family list and home screen
- [x] Implement mutual visibility: each partner can see the other's questionnaire answers
- [x] Implement mutual visibility: each partner can see the other's daily advice interaction/engagement
- [x] Show linked partner (spouse) above children in family list and home screen with connection status
- [x] Implement mutual visibility: each partner can see the other's questionnaire answers
- [x] Implement mutual visibility: each partner can see the other's daily advice interaction/engagement
- [x] Instant notification to partner when a new child is added by either parent
- [x] Share weekly child progress with partner via instant notification and chat message
- [x] Fix: Full real-time sync between linked partners (all child data, environment analysis, profile changes)
- [x] Fix: Partner sync must be automatic/instant OR with one-button manual sync (share ALL data without exception)
- [x] Fix: Environment analysis filled by one parent must be visible to the other parent
- [x] Fix: Gender recognition - system must identify father vs mother based on gender field
- [x] Fix: Avatar display - woman with full hijab, man with beard/mustache (no bare head with stubble)
- [x] Fix: Child data sharing - show actual child data in the shared document section
- [x] Fix: Child sharing options - replace "create summary" with: PDF export, share with network contact in-app, share as text outside app
- [x] Fix: Weekplan display - collapsible sections, remove asterisks, bold formatting, split parent/child advice
- [x] Fix: Weekplan loading time - reduce wait time
- [x] Fix: Internal sync notification must be precise about WHAT the partner changed (not generic "shared progress")
- [x] Fix: Names of Allah translation stops after 3 names - must translate every name on first open
- [x] Fix: Save translations in DB so all users benefit (no re-translation needed)
- [x] Fix: Apply same translation caching to Mindsets (المنطلقات)
- [x] Fix: Split long library articles into subsections based on headings (collapsible)
- [x] Fix: QR code image not displaying in the app
- [x] Fix: Partner/spouse tips not showing even when user presses refresh/update
- [x] Fix: Notifications not working at all (no sound, no visual)
- [x] Fix: Make notifications enabled by default (user can disable specific ones)
- [x] Fix: Ensure notification scheduling and delivery actually works
- [x] Add reminder notification after 3 days of not completing weekly goals (navigates to goals screen on tap)
- [x] Add auto-silence phone at iqamah time (10 min after adhan by default, configurable)
- [x] Add configurable silence duration (10 min default)
- [x] Add settings UI for user to adjust delay-after-adhan and silence-duration
- [x] Add per-prayer toggles for iqamah silence (fajr, dhuhr, asr, maghrib, isha)
- [x] Add iOS fallback: reminder notification instead of auto-silence
- [x] Add Android DND permission handling for ringer mode control
- [x] Add notification received listener for auto-silence on notification fire
- [x] Fix QR code not rendering as image (showed text 'QR: ...' instead of actual QR code in messages.tsx and family-hub.tsx)
- [x] Add OTA (Over-The-Air) update system using expo-updates
- [x] Check for updates on app launch and notify user when new version available
- [x] Add update UI: alert with "Update now" button that downloads and applies update without reinstalling
- [x] Show current app version in settings screen
- [x] BUG FIX (PRIORITY): Sync system not working - partner environments/answers not visible after reinstall/new version
- [x] Phase 1: Comprehensive parent-to-parent sync system (DB schema + server endpoints for child data, environment, answers, weekly goals)
- [x] Phase 2: Add visible sync buttons to Home screen, Family tab, and Network tab
- [x] Phase 3: Gender recognition + avatar (father=bearded man, mother=hijabi woman, system addresses each by role)
- [x] Phase 4: Child data sharing - 3 options: PDF, share within network, share as external text (already implemented)
- [x] Phase 5: Weekly plan UI redesign (collapsible sections, no stars, bold text, parent/child split)
- [x] Phase 6: Precise sync notifications (already implemented with specific action descriptions)
- [x] Phase 7: Translation caching in DB for Allah names + mindsets (fixed retry logic for consecutive translations)
- [x] Phase 8: Split long library articles into collapsible sub-sections (already implemented)
- [x] Phase 9: Personalized partner advice based on ALL app interactions (daily checkins, tips, environments, children, questionnaire answers)
- [x] Phase 10: Final testing and delivery
- [x] Create Qibla compass standalone page (app/qibla.tsx) with magnetometer and Qibla angle calculation
- [x] Add Qibla compass button in prayer tab that navigates to compass page
- [x] Improve mosque search with city autocomplete (suggestions on first character typed)
- [x] Implement daily istighfar reminder with notification + sound (auto-scheduled)
- [x] Implement daily morning adhkar reminder (after Fajr) with notification + sound
- [x] Implement daily evening adhkar reminder (after Asr) with notification + sound
- [x] Implement smart qiyam al-layl reminder (last third of night + app-open detection)
- [x] Display qiyam al-layl hadith and prayer instructions when app opened at night
- [x] Add reminder settings UI (enable/disable each reminder individually)
- [x] All reminders enabled by default, times calculated automatically from prayer times
- [x] Fix PDF export 'Cannot find module' error
- [x] Fix partner icon showing male icon for wife (should show female)
- [x] Fix partner chat/messaging not sending messages (confirmed=true fix)
- [x] Fix network communication with partner not working (confirmed=true fix)
- [x] Fix data sync between spouses for child environment analysis (confirmed=true fix)
- [x] Fix weekly advice/activities/principles content missing for children (backend needs publish)
- [x] Fix translation not working for names (backend needs publish)
- [x] Fix library translation and section categorization (rewritten with SectionList)
- [x] Fix Names of Allah translation for age 0-2 category not working (pre-translated nl/en in JSON)
- [x] Fix library book titles not pre-translated (chapter titles use title_nl/title_en, series translated)
- [x] Fix partner icon still showing male icon for wife (gender returned from server, needs backend publish)
- [x] Implement RTL direction for Arabic, LTR for Dutch/English across entire app
- [x] Fix partner avatar: show hijab woman emoji when user is man, show bearded man emoji when user is woman
- [x] Redesign weekly plan as accordion cards with icons per section (parent/child) and per card (topic-based)
- [x] Remove asterisks/hashes from weekly plan text, clean formatting
- [x] Persist weekly plan in AsyncStorage until manual refresh or week ends
- [x] Sync children add/delete/update to server database (persist across reinstalls)
- [x] Sync co-parent relationship to server database (persist across reinstalls)
- [x] Fix data loading from server to respect deletions (don't restore deleted children/co-parent)
- [x] Sync treatment plan with partner via database (both parents see same plan)
- [x] Fix text truncation in treatment plan items (show full text)
- [x] Add transliteration rules to LLM prompt (Allaah with double-aa, ع as 3)
- [x] Persist weekly tips in AsyncStorage until manual update or week change
- [x] Move language selection to be the first screen before registration/onboarding
- [x] Add address fields to onboarding (street+house number, postal code+city, country)
- [x] Ensure registration and all subsequent screens use the chosen language
- [x] Fix 1: Sync child environment data between partners (both parents see same child data)
- [x] Fix 2: Inline issue advisor in child page (stays on same page, asks analytical questions first)
- [x] Fix 3: Previous issues section shows full problem, analysis, and treatment when tapped
- [x] Fix 4: Integrate issue solutions into weekly and daily tips automatically
- [x] Fix 5: Tab bar always visible on all screens (never hidden)
- [x] Fix 6: Share issues/solutions with partner + push notification mentioning child name
- [x] Fix 7: Arabic names in weekly plan when language is Arabic (not transliterated)
- [x] Fix 8: RTL formatting in weekly plan (bullets on right, proper headings, clean formatting)
- [x] Fix 9: Login stays in-app (no external browser redirect)
- [x] Add address editing in settings page (street/house, postal/city, country)
- [x] Add partner synced issues section in child page (show partner's issues distinctly)
- [x] Auto-detect system language + ask user before registration
- [x] PDF export: comprehensive export of all child issues + treatment plans in a single PDF file
- [x] Permanent fix: prevent temp file corruption from crashing Metro watcher (watchman ignore + cleanup script)
- [x] BUG: AI writes "Allaah" and child names in Latin script when language is Arabic (must be الله and عبد الرؤوف)
- [x] BUG: ** stars still visible in weekplan text (must be stripped client-side)
- [x] BUG: Advisor greets with "أهلاً بك" instead of "السلام عليكم ورحمة الله وبركاته"
- [x] BUG: Personal advice (نصائح شخصية) not cached - reloads every time user returns
- [x] BUG: Environment analysis (تحليل بيئة الطفل) not easily accessible from child page
- [x] BUG: Partner issues not syncing - client only merged children/environments, now also merges issues + actionPlans + refreshes local state after sync
- [x] Auto-sync on app open: automatically sync with partner when app starts (no manual button needed)
- [x] Network reports page: show sync history with details of what was synced and what's new
- [x] Full bidirectional persistence: both parents see identical data that persists across app restarts
- [x] Detailed sync reports: show exactly what changed (new children, new issues, new action plans, updated environments)
- [x] PDF export for sync reports: button to export all sync history as PDF
- [x] Toast message (snackbar) at bottom of screen when sync completes showing summary
- [x] Fix mosque search: add city search field with autocomplete dropdown, show mosques in selected city
- [x] Fix authentication: login must work entirely within the app without redirecting to external Manus website
- [x] Fix: App must enter directly without login screen - skip auth gate completely
- [x] Fix: Mosque search unicode display (\ud83d\udccd and \u2715 shown as text instead of icons)
- [x] Fix: Mosque city search must show mosques in selected city
- [x] Fix: Bottom tab bar must remain visible on personal advice screens (never disappear)
- [x] Permissions onboarding screen: show on first launch with all required permissions (GPS, notifications, DND, motion sensors, activity recognition, audio notifications)
- [x] Each permission has explanation + direct button to grant/open settings
- [x] Check permissions on every app launch, show alert if any missing
- [x] Make all notification times fully customizable (free number input, not limited options): prayer reminder minutes, DND start/end, adhkar times
- [x] Fix: Remove login screen entirely - app must auto-login with existing session, no login screen shown
- [x] Fix: RTL text direction in advice/weekplan screens - Arabic text must be right-aligned
- [x] Fix: Mosque refresh button must return to GPS location (clear city search)
- [x] Fix: Make quick actions section collapsible (like children section)
- [x] Fix: Change 'الزوج/ة' to 'الزوجة' 
- [x] Fix: Bottom tab bar must stay visible when viewing child advice/weekplan
- [x] Fix: Move network reports button to top header next to settings and refresh in network screen
- [x] Add swipe gesture between bottom tabs (horizontal swipe to navigate tabs)
- [x] Add swipe-back gesture to return to previous screen
- [x] Fix: Login session must persist - never show login screen again after first successful login
- [x] Remove permissions screen from app startup flow, move to settings as optional
- [x] Replace email/password login screen with Google OAuth login button
- [x] Fix swipe between tabs to work on native device with visible page transitions
- [x] Fix treatment plan: collapsible sections, structured content, checkboxes for goals
- [x] Add delete button for treatment plan (father only, deletes for mother too)
- [x] Fix Arabic RTL text direction in treatment plan (right-to-left)
- [x] Auto-login to data/sync immediately after app login
- [x] Separate weekly plan: father advice first, then child advice (not all under one title)
- [x] Remove SwipeableTabs completely - causes screens not to show
- [x] Fix: Restore visibility of Home, Fitrah, and Prayer screens
- [x] Fix: Login/sync flow - restore old method (login app then auto-login server)
- [x] Fix: Partner link must persist in database even after app deletion
- [x] Fix: Treatment plan structure - parent section (ta'seel/tasfiya/tazkiya/tarbiya/schedule) + child section (tamheed/tasfiya/tazkiya/tarbiya/schedule)
- [x] Fix: Treatment plan RTL - text from right to left
- [x] Fix: Write Allah in Arabic not Latin (الله not Allaah)
- [x] Fix: Treatment plan headings larger than body text
- [x] Fix: Separate parent goals from child goals (use ولد/بنت based on gender)
- [x] Create adhkar data file with all daily/nightly remembrances
- [x] Create notification types and settings store (AsyncStorage)
- [x] Create popup notification modal component (Modal + follow-up system)
- [x] Create notification scheduling service
- [x] Create unified notifications settings page in settings
- [x] Create sync settings section in network settings
- [x] Create adhkar section/page in the app (linked from notifications)
- [x] Add monitoring/sincerity/khushoo reminders
- [x] Update LLM prompts: no praise, attribute to Allah, Islamic methodology
- [x] Verify all changes work correctly

## إصلاح نظام التشخيص وعرض خطة العلاج
- [x] تحديث prompt التشخيص: سؤال متدرج واحد في كل مرة
- [x] إضافة قاعدة التعليق بالله في كل التواصل (كل prompts)
- [x] تحديث ترتيب خطة العلاج: تشخيص → مهام الوالد (بعيدة+قصيرة) → مهام الابن
- [x] إضافة تنبيه: التربية القصيرة مبنية على الطويلة ولن تفلح بدونها
- [x] إنشاء مكون Markdown renderer لعرض خطة العلاج
- [x] نقل المربعات إلى اليمين (فقط عند المهام الكاملة)
- [x] جعل العناوين أكبر من النص
- [x] تحديث صفحة عرض خطة العلاج لاستخدام المكون الجديد
- [x] التحقق والاختبار

## إصلاحات جوهرية - 7 يوليو 2026
- [x] إصلاح 1: حفظ الشريك في DB عبر createPartnership في linkPartnerByPublicId (يبقى حتى بعد إزالة التطبيق)
- [x] إصلاح 2: استبدال spiritual/روحي بـ faith/إيماني في كل الملفات (iman-notifications.ts, notification-settings.ts, settings.tsx, _layout.tsx, create-plan.tsx, schema.ts)
- [x] إصلاح 3: إنشاء صفحة إعدادات إشعارات موحدة (notification-settings.tsx) مع نظام عرض مزدوج (عادي/منبثق/كلاهما/إيقاف) لكل نوع إشعار
- [x] إصلاح 4: ربط نظام النافذة المنبثقة (PrayerPopupModal) بـ _layout.tsx مع مستمع إشعارات يحدد طريقة العرض حسب إعدادات المستخدم

## إصلاحات عاجلة - 7 يوليو 2026 (الجولة 2)
- [x] إصلاح: الشريك/الزوجة لا يظهر مربوطاً في صفحة الشبكة بعد إعادة التثبيت (يجب استرجاعه من DB)
- [x] إصلاح: التذكيرات متفرقة في أماكن مختلفة - يجب توحيدها في مكان واحد فعلياً
- [x] إصلاح: خطة العلاج تظهر كاملة بدون أقسام قابلة للطي (يجب إعادة الطي)
- [x] إصلاح: أسئلة التشخيص تُعطى دفعة واحدة بدلاً من سؤال واحد في كل مرة

## إصلاحات - 7 يوليو 2026 (الجولة 3)
- [x] إعادة جميع إمكانيات التذكيرات (وقت، تكرار، صلاة كل على حدة، أصوات) إلى صفحة الإشعارات الموحدة
- [x] إبقاء القائمة السفلية ظاهرة في جميع الصفحات الداخلية (notification-settings وغيرها)

## إصلاحات - 7 يوليو 2026 (الجولة 4)
- [x] إصلاح: أسئلة التشخيص لا تتكيف مع إجابات المستخدم السابقة (يجب أن يفكر AI في الجواب ليطرح سؤالاً أعمق)
- [x] إصلاح: أزرار التالي/الرجوع مخفية خلف لوحة المفاتيح - يجب رفعها فوق الكيبورد

## إصلاحات - 7 يوليو 2026 (الجولة 5)
- [x] إصلاح: خطة العلاج تنقل النص الهولندي حرفياً بحروف عربية بدلاً من ترجمته بالكامل
- [x] إصلاح: الأسئلة لا تتكيف فعلياً مع الإجابات - يجب توليد كل سؤال بناءً على الإجابة السابقة

## إصلاحات - 7 يوليو 2026 (الدفعة 6)
- [x] إصلاح: النص الهولندي لا يزال يُكتب بحروف عربية في خطط العلاج (مثل إيرلك، سوسيال) - يجب ترجمته بالكامل
- [x] إصلاح: التشخيص يسرد احتمالات (يمكن أن يكون كذا) بدلاً من تحيد جذر المشكلة بشكل قاطع بعد الأسئلة

## إصلاحات - 7 يوليو 2026 (الدفعة 7)
- [x] إصلاح: ربط الشريك يجب أن يكون تلقائياً بعد الإضافة الأولى بدون خطوات يدوية

## إصلاحات - 8 يوليو 2026 (الدفعة 8)
- [x] خطأ: الأسئلة تتسبب في crash "Objects are not valid as React child (found: object with keys {question})" - الأسئلة تُرجع ككائنات بدلاً من نصوص
- [x] خطأ: الشريك لم يبقَ مرتبطاً تلقائياً بعد الإضافة الأولى - يحتاج إدخال يدوي مرة أخرى

## إصلاحات - 8 يوليو 2026 (الدفعة 9)
- [x] خطأ: الزوجة لا تظهر بعد إعادة تثبيت التطبيق رغم أنها مربوطة في قاعدة البيانات

## إصلاحات وتحسينات - 8 يوليو 2026 (الدفعة 10)
- [x] حل المشاكل: حد أقصى للأسئلة + استخدام بيئة الطفل + نظام سؤال واحد تلو الآخر
- [x] المستشار: يأخذ تحليل بيئة الطفل بعين الاعتبار في التشخيص
- [x] المستشار: تقسيم النتيجة على مطويات (تشخيص، تصفية، تزكية، تربية اللسان، تربية الجوارح)

## تحسينات - 8 يوليو 2026 (الدفعة 11)
- [x] إضافة إمكانية إعادة فتح التشخيص وإضافة معلومات جديدة إذا تغيّرت حالة الطفل

## تحسينات - 8 يوليو 2026 (الدفعة 12)
- [x] عرض سجل الأسئلة والإجابات السابقة عند إعادة فتح التشخيص
- [x] تنبيه تلقائي للشريك عند تحديث خطة علاج مشتركة

## إصلاحات - 8 يوليو 2026 (الدفعة 13)
- [x] إزالة كل ذكر لـ "الروحانية/الروحية/الجانب الروحي" واستبدالها بـ "الإيمان/الجانب الإيماني/تقوية الإيمان بالله" في جميع prompts

## إصلاحات - 8 يوليو 2026 (الدفعة 14)
- [x] إضافة قائمة شاملة بالمصطلحات المحظورة من علم النفس الغربي والفلسفة والعصر الجديد والتربية الغربية (100+ مصطلح) واستبدالها بالبدائل الإسلامية الشرعية في sanitizeArabicText + جميع prompts

## إصلاحات - 8 يوليو 2026 (الدفعة 15)
- [x] إصلاح: التذكيرات/الرسائل المنبثقة في وسط الشاشة لا تظهر رغم تفعيلها في الإعدادات
- [x] تفعيل Full-Screen Intent على Android لعرض popup فوق كل شيء (حتى لو التطبيق مغلق)
- [x] إصلاح فئات الإشعارات المفقودة (weekly, night, iqamah, reminders, friday)
- [x] إضافة نظام التذكيرات الفائتة عند فتح التطبيق
- [x] عرض popup عند الضغط على الإشعار وفتح التطبيق

## تحسينات - 8 يوليو 2026 (الدفعة 16) - Widgets
- [x] بحث وتثبيت مكتبة Widget متوافقة مع Expo SDK 54 (react-native-android-widget)
- [x] ودجت الصلاة: الصلاة القادمة + عد تنازلي + جميع أوقات الصلوات + الشروق
- [x] ودجت الذكر اليومي: ذكر متغير مع المصدر والفضل
- [x] ودجت هدف اليوم التربوي من الخطة الأسبوعية
- [x] ودجت التاريخ الهجري + المناسبة الإسلامية
- [x] ودجت مدمج شامل (صلاة + ذكر + هدف + تاريخ) بأحجام مختلفة
- [x] إعدادات Widget داخل التطبيق: اختيار المحتوى والحجم والتنويع
- [x] إمكانية اختيار المستخدم لعرض كل الصلوات أو الصلاة القادمة فقط

## تحسينات - 8 يوليو 2026 (الدفعة 17) - إعدادات Widget شاملة
- [x] نظام إعدادات Widget شامل: types + AsyncStorage persistence (lib/widget-settings.ts)
- [x] قسم المظهر: لون خلفية، لون نص، حجم خط، زوايا، حدود، شفافية، وضع داكن/فاتح/تلقائي
- [x] قسم الأوقات: فترة تحديث (15/30/60/120 دقيقة)، تحديث عند الأذان، وقت بداية/نهاية العرض
- [x] قسم المحتوى: اختيار أقسام، عرض/إخفاء تفاصيل (عد تنازلي، شروق، مصدر ذكر، اسم طفل)
- [x] قسم الفاعلية: شاشة الفتح عند الضغط، تحديث فوري، معاينة مباشرة
- [x] تحديث Widget components لقراءة الإعدادات الجديدة وتطبيقها (HexColor type-safe)

## الدفعة 18 - الميزات الاجتماعية والعائلية الكبرى (15 يوليو 2026)

### المرحلة 1: تحديث قاعدة البيانات (جداول جديدة)
- [x] إضافة حقول جديدة لجدول users: gender, maritalStatus, hasChildren, previousMethodology
- [x] إنشاء جدول child_accounts (حسابات الأبناء 12+): userId, parentId, childProfileId, ageGroup, accessCode, lastActive
- [x] إنشاء جدول environment_analysis (تحليل البيئة التلقائي): userId, childId, analysisData, sources, autoGenerated
- [x] إنشاء جدول neighborhood_groups (مجموعات الحي): name, location, radius, inviteCode, createdBy
- [x] إنشاء جدول neighborhood_members (أعضاء الحي): groupId, userId, joinedAt
- [x] إنشاء جدول neighborhood_activities (أنشطة الحي): groupId, title, description, date, createdBy
- [x] إنشاء جدول child_activity_log (سجل نشاط الابن): childAccountId, activityType, data, timestamp
- [x] إنشاء جدول child_achievements (إنجازات الابن): childAccountId, title, description, category, earnedAt
- [x] إنشاء جدول child_challenges (تحديات يومية): childAccountId, title, category, status, date
- [x] إنشاء جدول peer_groups (مجموعات أقران): name, ageRange, parentApproval, createdBy
- [x] إنشاء جدول shared_child_updates (تحديثات مشتركة للمطلقين): childId, authorId, updateType, content
- [x] تشغيل migration لإنشاء الجداول الجديدة

### المرحلة 2: الحالة الاجتماعية والجنس
- [x] إضافة شاشة اختيار الجنس في الإعداد الأولي (ذكر/أنثى)
- [x] إضافة شاشة اختيار الحالة الاجتماعية (أعزب/متزوج/مطلق/أرمل + بأبناء/بدون)
- [x] حفظ الحالة الاجتماعية والجنس في قاعدة البيانات (users table)
- [x] تعديل system prompts لتخصيص المحتوى حسب الحالة الاجتماعية
- [x] محتوى مخصص للأعزب/العزباء: آداب اختيار الزوج، التحضير للزواج، تزكية النفس
- [x] محتوى مخصص للمتزوج بدون أبناء: بناء العلاقة الزوجية، الصبر على تأخر الإنجاب
- [x] محتوى مخصص للمطلق بدون أبناء: التعافي الشرعي، المراجعة، البحث عن زوج
- [x] محتوى مخصص للأرمل/ة: الصبر، تربية الأيتام وحيداً، حقوق اليتيم
- [x] إخفاء/إظهار أقسام التطبيق حسب الحالة (مثلاً: أعزب لا يرى قسم الأبناء)

### المرحلة 3: التصحيحات الشرعية
- [x] إزالة كل ذكر لأعياد الميلاد من الكود (بحث شامل + حذف)
- [x] تاريخ الولادة يُستخدم فقط لحساب العمر - لا احتفال
- [x] تصحيح المنهج التربوي: إزالة خيارات المناهج المتعددة
- [x] إضافة سؤال "ما المنهج الذي كنت تتبعه سابقاً؟" مع 5 خيارات للتصويب
- [x] المنهج الوحيد: الكتاب والسنة بفهم الصحابة (لا اختيار)
- [x] تعديل prompts: التصويب مبني على الماضي فقط (لا خيارات مستقبلية)

### المرحلة 4: تحسين الملف الشخصي
- [x] تصميم View Mode: بطاقة جميلة تعرض كل المعلومات (اسم، حالة، أبناء، إلخ)
- [x] تصميم Edit Mode: زر تعديل يفتح نموذج التعديل
- [x] مشاركة الملف الشخصي تلقائياً مع الزوج/ة (من قاعدة البيانات)
- [x] الزوج/ة يرى ملف شريكه في وضع القراءة فقط
- [x] زر نسخ رقم الهوية في الملف الشخصي

### المرحلة 5: تحليل البيئة التلقائي
- [x] استخراج معلومات البيئة تلقائياً من محادثات المستشار
- [x] استخراج معلومات البيئة من الخطط الأسبوعية
- [x] حفظ التحليل في قاعدة البيانات (environment_analysis)
- [x] مشاركة التحليل مع الزوج/ة تلقائياً
- [x] عرض التحليل في ملف الطفل (قابل للتعديل اليدوي أيضاً)

### المرحلة 6: حساب الابن/البنت (12+ سنة)
- [x] إنشاء نظام إنشاء حساب ابن من داخل حساب الوالد
- [x] نظام دخول الابن بكود خاص (لا email)
- [x] واجهة مخصصة للابن/البنت (مختلفة تماماً عن واجهة الوالد)
- [x] تقسيم المحتوى حسب الفئة العمرية (12-14، 15-17، 18+)
- [x] إرشاد الهاتف الذكي: نصائح يومية عن استخدام الهاتف بما يرضي الله
- [x] تحذيرات الفتن حسب العمر والجنس (محتوى إباحي، موسيقى، ألعاب، تواصل مع الجنس الآخر)
- [x] تحديات يومية ("اليوم: صلِّ الفجر في وقتها" + تسجيل الإنجاز)
- [x] قصص السلف: قصة يومية مناسبة لسنه (صحابة، تابعين)
- [x] إنجازاتي: سجل إنجازات (حفظت سورة، صمت يوماً، ساعدت أمي)
- [x] زر طوارئ "تعرضت لفتنة" → تنبيه للوالدين + نصيحة فورية
- [x] مستشار ذكي مخفف: يجيب على أسئلته حسب سنه بلغة مناسبة
- [x] ورد يومي مناسب لسنه (قرآن + أذكار)
- [x] دليل التطبيقات: أي تطبيقات مباحة وأيها محرمة/مشبوهة
- [x] مسار تعلّم شهري: "هذا الشهر: تعلّم أحكام الصلاة"
- [x] تنبيه وقت الشاشة: "مضى ساعة — هل تريد التوقف؟" مع ذكر
- [x] فلتر المحتوى: نصائح عملية لحماية النفس من المحتوى الحرام
- [x] رسالة للوالدين: "شكراً" أو "أحتاج مساعدة" بضغطة واحدة
- [x] منع الابن من رؤية ملفات الوالدين التفصيلية
- [x] منع الابن من رؤية مشاكل الوالدين الزوجية وتحليل البيئة الكامل

### المرحلة 7: متابعة الوالدين لنشاط الابن
- [x] عرض: هل فتح التطبيق اليوم
- [x] عرض: هل قرأ النصيحة الأسبوعية
- [x] عرض: هل أكمل أهدافه/تحدياته
- [x] عرض: ماذا سأل المستشار (مع إمكانية تعطيل للمراهقين الأكبر)
- [x] عرض: وقت استخدام التطبيق
- [x] إشعار فوري عند ضغط زر الطوارئ

### المرحلة 8: تواصل المطلقين عبر ملفات الأبناء
- [x] لا رسائل مباشرة بين المطلقين
- [x] تحديثات على ملف الابن المشترك فقط (مثلاً: "أحمد أكمل ورده اليوم")
- [x] كلا الطرفين يرى ملف الابن ويعدّل عليه
- [x] إشعار عند تحديث الطرف الآخر لملف الابن
- [x] سجل التحديثات المشتركة (من كتب ماذا ومتى)

### المرحلة 9: نظام العائلة الموسّع
- [x] دعوة أفراد العائلة بكود (أجداد، أعمام، خالات)
- [x] تذكيرات مشتركة (صلاة جماعة، نشاط عائلي)
- [x] أنشطة عائلية مقترحة + تصويت + تأكيد
- [x] تقارير أسبوعية/شهرية تلقائية عن الأطفال

### المرحلة 10: نظام الحي
- [x] اكتشاف مستخدمين قريبين (بإذن الموقع)
- [x] إنشاء/الانضمام لمجموعة حي
- [x] أنشطة الحي (درس، نشاط أطفال، تعاون)
- [x] تواصل بسيط داخل مجموعة الحي

### المرحلة 11: مجموعات أقران للأبناء
- [x] تواصل مع أبناء في نفس العمر من عائلات التطبيق
- [x] بإذن الوالدين فقط
- [x] محتوى مشترك (تحديات جماعية، مسابقات حفظ)
- [x] إشراف الوالدين على المحادثات

### المرحلة 12: تحسينات إضافية
- [ ] بوصلة القبلة في قسم الصلاة
- [ ] نصائح مخصصة للأعزب/العزباء (تحضير للزواج)
- [ ] تقارير تلقائية (أسبوعية/شهرية) عن الطفل والبيئة
- [ ] التطبيق متاح بالكامل بالإنجليزية (ترجمة الميزات الجديدة)

### المرحلة 13: تحسين نظام دخول الابن (ID + QR Code)
- [x] تعديل شاشة login الابن لاستخدام ID بدلاً من كود 6 أرقام
- [x] إضافة خيار مسح QR Code للدخول السريع
- [x] إضافة زر "عرض QR" في واجهة الوالد (ملف الابن)
- [x] ربط شاشات حساب الابن بالتطبيق (زر دخول واضح)

### المرحلة 14: نظام أمان الوالد + ترجمة الشاشات الجديدة
- [x] نظام أمان: عند دخول الابن بالـ ID يظهر رقم تأكيد يجب أن يدخله الوالد
- [x] ترجمة child-account/login.tsx إلى NL + EN
- [x] ترجمة child-account/home.tsx إلى NL + EN
- [x] ترجمة child-account/advisor.tsx إلى NL + EN
- [x] ترجمة child-account/challenges.tsx إلى NL + EN
- [x] ترجمة child-account/achievements.tsx إلى NL + EN
- [x] ترجمة child-account/app-guide.tsx إلى NL + EN
- [x] ترجمة child-account/parent-monitor.tsx إلى NL + EN
- [x] ترجمة child-account/shared-updates.tsx إلى NL + EN
- [x] ترجمة community/neighborhood.tsx إلى NL + EN
- [x] ترجمة community/family-group.tsx إلى NL + EN
- [x] ترجمة community/peer-groups.tsx إلى NL + EN
### المرحلة 15: استيراد الأذكار والشبهات + تبويب ذكري + تحسينات تقنية
- [x] إنشاء جداول DB: adhkar, misconceptions, educational_content
- [x] استيراد 376 ذكر من Excel (80 سياق مختلف) مع ترجمات AR/NL/EN
- [x] استيراد 109 شبهة من Excel مع ترجمات AR/NL/EN
- [x] إنشاء API endpoints: /api/adhkar, /api/adhkar/contexts, /api/misconceptions, /api/misconceptions/groups
- [x] إنشاء شاشة ذِكري (dhikri.tsx) تجمع القرآن + الأذكار
- [x] تحويل تبويب القرآن إلى تبويب ذِكري في _layout.tsx
- [x] تحديث Quick Actions في الشاشة الرئيسية (concepts → dhikri)
- [x] إضافة تبويب الشبهات في شاشة الفطرة (fitrah.tsx)
- [x] إضافة زر تحديث الموقع في شاشة مواقيت الصلاة
- [x] إضافة زر دخول الابن في الهيدر الرئيسي
- [x] دمج سياق الشبهات في system prompts (ai-chat.ts) لإثراء الذكاء الاصطناعي
- [x] مسار إدارة العواطف (7 أسابيع) - برنامج أسبوعي متدرج
- [x] إصلاح خطأ misconceptions/groups endpoint (sort_order في GROUP BY)

### المرحلة 16: إصلاح الويدجتات (widgets)
- [x] إصلاح مشكلة عدم وجود محتوى في الويدجتات (أوقات الصلاة --:--)
- [x] إضافة مزامنة تلقائية: كتابة أوقات الصلاة إلى AsyncStorage عند حسابها
- [x] إضافة مزامنة تلقائية: كتابة هدف اليوم إلى AsyncStorage عند تحميل الأهداف
- [x] إضافة مزامنة تلقائية: كتابة التاريخ الهجري إلى AsyncStorage
- [x] إضافة زر تحديث في كل ويدجت (REFRESH_WIDGET clickAction)
- [x] تحسين widgetTaskHandler لمعالجة حدث التحديث

### المرحلة 17: تحديث تلقائي دوري للويدجتات في الخلفية
- [x] إضافة إعداد فترة التحديث (15/30/45/60 دقيقة) في widget-settings
- [x] إنشاء Background Task يحسب أوقات الصلاة ويحدث الويدجتات دورياً
- [x] تسجيل Background Task عند بدء التطبيق وعند تغيير الإعداد
- [x] إضافة واجهة اختيار فترة التحديث في شاشة الإعدادات (قسم الويدجت)

### المرحلة 18: ويدجت أذكار ذكي + تحديث عند الأذان
- [x] تحسين dhikr-data.ts ليجلب أذكار حسب الوقت (صباح/مساء/نوم/بعد الصلاة) من AsyncStorage
- [x] تحسين DhikrWidget ليعرض الذكر المناسب للوقت مع زر تحديث
- [x] إضافة cache تلقائي للأذكار حسب الوقت عند فتح التطبيق
- [x] ربط التحديث التلقائي بحدث الأذان (عند حلول وقت الصلاة يتحدث الويدجت)

### المرحلة 19: إعداد اختيار سياق الأذكار في الويدجت
- [x] إضافة حقل dhikrContextMode (auto/manual) + dhikrFixedContext في widget-settings
- [x] إضافة واجهة اختيار السياق في إعدادات الويدجت
- [x] تطبيق الإعداد في getDhikrForTimeAsync
- [x] إصلاح crash التطبيق: تعارض إصدارات expo-background-fetch (v57→v14) و expo-task-manager (v57→v14) مع Expo SDK 54
- [x] إزالة رمز اليوغا من كل التطبيق واستبداله بأيقونة كتاب مفتوح في تبويب ذِكري
- [x] إعادة ترتيب شاشة ذِكري: القرآن أعلاً ثم الأذكار تحته
- [x] إدراج كل الأذكار (376 ذكر/80 سياق) كاملة في شاشة ذِكري
- [x] إضافة زر GPS + زر معايرة البوصلة في شاشة القبلة
- [x] دمج عنصري "صيام مستحب" + "المراجعة اليومية" في عنصر واحد بالرئيسية
- [x] تقسيم الشبهات حسب الفئات العمرية + قائمة عامة لغير المقسم
- [x] إضافة زر "ملف زوجتي" في قائمة العائلة مع إمكانية العرض والتعديل
- [x] مراجعة شاملة لكل المهام السابقة
- [x] حذف تنبيه "عمر طفلك X سنة. الخطة مبنية على منهج 12 سنة" من الخطة الأسبوعية
- [x] تحويل شاشة ملف الطفل إلى وضع عرض (قراءة) افتراضي مع زر تعديل للتبديل
- [ ] ترجمة 38 ملف Word إلى الهولندية والإنجليزية وإدراجها بنفس طريقة الإدراج العربي
- [x] ترجمة الملفات الصغيرة إلى الهولندية والإنجليزية (educational_methods 48, fitrah_traits_detailed 192, heart_deeds 66, concepts_tawheed 14, tarbiya_rules 32, mindsets_update 53)
- [ ] ترجمة محتوى المكتبة (9 كتب، 2193 قسم، ~2M حرف) إلى الهولندية والإنجليزية
- [x] ترجمة ملفات Word (كتب 11-14) بالكامل إلى الهولندية والإنجليزية
- [x] ترجمة جزئية لكتاب 15 (72/294 قسم) إلى الهولندية والإنجليزية
- [x] إدراج الكتب 11-15 في index.json وإضافة فئة "الزواج"
- [x] تحديث واجهات المكتبة (index.tsx, [bookId].tsx, read.tsx) لدعم الكتب الجديدة
- [ ] إكمال ترجمة كتاب 15 (222 قسم متبقي)
- [ ] ترجمة الكتب 16-48 (33 كتاب متبقي)
- [x] ويدجت: تكبير النص تلقائياً حسب حجم الويدجت (getFontSize محسّن في كل الويدجت)
- [x] ويدجت: إضافة الصلاة القادمة + الوقت المتبقي في كل ويدجت (DhikrWidget + GoalWidget + HijriWidget)
- [x] ويدجت: إضافة التاريخ الهجري في كل ويدجت
- [x] ويدجت: إخفاء أي رابط URL (لا يوجد رابط في الويدجت المحدثة)
- [x] ويدجت: إعدادات كاملة في صفحة الإعدادات (4 أقسام: محتوى، مظهر، أوقات، فاعلية)
- [x] ويدجت: ملء المساحات الفارغة بمعلومات مفيدة (صلاة + هجري + مصدر الذكر)
- [x] ويدجت: أزرار تصفح يمين/يسار + زر تحديث في كل ويدجت
- [x] زر الرجوع (هاتف + تطبيق): يعود دائماً للصفحة السابقة وليس الرئيسية (BackHandler في _layout.tsx)
- [x] القائمة السفلية (Tab Bar): تبقى ظاهرة دائماً حتى خارج tabs (PersistentTabBar component)
- [x] إصلاح: التبويبات المختفية (ذكري + شبكتي) عند الانتقال لبعض الشاشات (تسجيل الشاشات المفقودة + zIndex + View wrapper)
- [x] إصلاح: أكواد unicode (\u2192, \u21BB) تظهر كنص في الويدجت بدلاً من أيقونات
- [x] ويدجت: ملء المساحات الفارغة بمعلومات إضافية مفيدة (نصيحة تربوية + تقدم أسبوعي)
- [x] ويدجت: تكبير النص فعلياً عند تكبير الويدجت
- [x] إضافة زر ملف الزوجة بجانب زر المحادثة (الرئيسية + شبكتي)
- [x] إضافة زر ملف الطفل في العائلة/شبكتي + الأسبوع (وضع قراءة + زر تعديل)
- [x] إضافة زر "إضافة طفل" في شاشة العائلة (يذهب مباشرة لشاشة add-child)
- [x] إضافة زر "ملف" بجانب تعديل/حذف في شاشة العائلة (يعرض التحليل البيئي الكامل بجميع الأجوبة)
- [x] فصل زر "عرض/تعديل بيئة الطفل" إلى زرين: "عرض البيئة" + "تعديل البيئة" في شاشة تفاصيل الطفل
- [x] إصلاح زر "+ إضافة" في العائلة ليفتح نموذج إضافة طفل مباشرة (شاشة add-child مستقلة)
- [x] QR-codes weer zichtbaar maken voor vader, moeder en elk kind (in شبكتي/العائلة) - QR knop bij vader ID + bij elk kind
- [x] Kinderen sorteren op leeftijd (oudste bovenaan) in alle schermen (العائلة + الأسبوع + شبكتي)
- [x] Widgets responsief maken: automatisch horizontale layout bij brede widget, verticale layout bij hoge widget
- [x] PrayerWidget: horizontaal = alle 5 gebeden naast elkaar
- [x] DhikrWidget: horizontaal = dhikr + teller naast elkaar
- [x] GoalWidget: horizontaal = doelen in rij-layout
- [x] HijriWidget: horizontaal = datum + info naast elkaar
- [x] CombinedWidget: horizontaal = secties naast elkaar
- [x] ويدجت الذكر: أذكار حسب الوقت (فجر-شروق=صباح، عصر-مغرب=مساء، بعد عشاء=نوم) مع تصفح بين الأذكار
- [x] ويدجت الأهداف: تصفح مستقل بين النصائح الشخصية
- [x] ويدجت المجمّع: تصفح مستقل للأذكار + تصفح مستقل للنصائح (زرين منفصلين)
- [x] إصلاح أزرار التصفح (← →) لتعمل فعلياً عبر widgetAction (NEXT_DHIKR/PREV_DHIKR/NEXT_TIP/PREV_TIP)
- [x] إصلاح زر أذكار الصباح/المساء في الرئيسية (يعرض جميع الأذكار عبر details/adhkar - كان يعمل بشكل صحيح)
- [x] إكمال أذكار المساء من 12 إلى 23 ذكراً (e13-e23) لتطابق أذكار الصباح (22 ذكراً)
- [x] إصلاح حقل ruling في m18 و m20 (تغيير "سنة" إلى "سنة مؤكدة" لتوافق TypeScript type)
- [x] حذف زر حذف الطفل من قائمة العائلة ونقله إلى الإعدادات تحت قسم الأطفال
- [x] إضافة نطق الأذكار بالحروف اللاتينية (transcriptie) للهولندية والإنجليزية من ملف Excel
- [x] إعادة بناء ملف الأذكار بالكامل من Excel مع جميع الأقسام والترجمات (عربي/هولندي/إنجليزي) والنطق (376 ذكراً في 80 قسماً)
- [x] إصلاح ترتيب الأطفال حسب السن في الشاشة الرئيسية
- [x] إصلاح تحديث الويدجت تلقائياً عند تغيير اللغة
- [x] ترجمة المنطلقات بالكامل إلى الهولندية والإنجليزية
- [x] تطبيق جدول النطق الصحيح (Transcriptietabel) على المصطلحات الإسلامية في النصائح الشخصية
- [x] إصلاح عرض النطق (transcriptie) تحت كل ذكر في شاشة الأذكار عند اختيار الهولندية أو الإنجليزية
- [x] إصلاح الويدجت: تغيير النص للهولندية عند اختيار الهولندية + تكبير أزرار التصفح + إضافة زر تحديث
- [x] إصلاح النطق في weekplan (Allah → Allaah) وتطبيق correctTranscription
- [x] إصلاح ترجمة جميع المنطلقات بالكامل للهولندية والإنجليزية (بعضها لا يزال غير مترجم)
- [x] تطبيق جدول النطق الصحيح (Transcriptietabel) على نصوص المنطلقات المترجمة
- [x] إصلاح أزرار الويدجت: unicode escape (\u2192) يظهر بدلاً من أسهم حقيقية (→ ← ↻)
- [x] إصلاح النطق في المنطلقات/weekplan: Salah→Salaah, Allah→Allaah + ترجمة الآيات والأحاديث (تطبيق Transcriptietabel على جميع ملفات tarbiya/*.json و mawsouah_knowledge.json)
- [x] إضافة النطق (transcriptie) لشاشة Mijn Dhikr (dhikri.tsx) - يعرض translit من البيانات المحلية عند اختيار الهولندية أو الإنجليزية
- [x] ترجمة جميع نصوص الويدجت (أسماء الصلوات، الشروق، تحديث، الصلاة القادمة) حسب اللغة المختارة (NL/EN/AR)
- [x] إصلاح عرض الجنس في قائمة "شبكتي" (messages.tsx): البنات كانت تظهر "Jongen" بدلاً من "Meisje" - السبب أن gender مخزن كـ "jongen"/"meisje" لكن الشرط كان يقارن بـ "female"
- [x] إصلاح ترتيب الشروق في الويدجت: نقله بعد الفجر مباشرة بدلاً من بعد العشاء (horizontal + vertical layouts)

## نظام متابعة الأطفال + استشارة الذكاء الاصطناعي

- [x] إنشاء جداول قاعدة البيانات (child_daily_summary, custom_tasks, family_chat_messages, child_ai_conversations, child_app_usage)
- [x] بناء API routes للسيرفر (child-monitoring-router.ts: customTasks, familyChat, childSummary, childAppUsage, childAiChat)
- [x] شاشة المتابعة للأب (parent-monitor.tsx) مع 5 تبويبات: نظرة عامة + مهام + دردشة + تطبيقات + محادثات AI
- [x] شاشة التقارير التفصيلية (ملخص يومي في تبويب نظرة عامة)
- [x] شاشة الدردشة أب↔طفل (familyChatRouter + child-chat.tsx + parent-monitor chat tab)
- [x] شاشة المهام المخصصة (إنشاء/تعديل/حذف/إكمال مع ملاحظة)
- [x] واجهة الطفل: شاشة الدخول بكود + الشاشة الرئيسية (home.tsx مع أزرار جديدة)
- [x] واجهة الطفل: اسأل الذكاء الاصطناعي (ask-ai.tsx - إجابات مناسبة لعمره وجنسه)
- [x] واجهة الطفل: تتبع النشاط (activity-tracker.ts + app-usage-tracker.ts: screen_visit, task_complete, ai_question, chat_sent)
- [x] استشارة الذكاء الاصطناعي حول الأبناء (ai-chat.tsx + server/ai-chat.ts مع consultationType=child)
- [x] استشارة الذكاء الاصطناعي حول الزوج/الزوجة (ai-chat.tsx + server/ai-chat.ts مع consultationType=spouse)
- [x] إضافة زر المتابعة 📊 بجانب كل طفل في شبكتي (messages.tsx)
- [x] إضافة زر المتابعة 📊 بجانب كل طفل في العائلة (family.tsx)
- [x] إضافة زر المتابعة بجانب كل طفل في الأسبوع (weekly.tsx)
- [x] مراقبة تطبيقات الهاتف (app-usage-tracker.ts: Android UsageStats placeholder + in-app screen tracking)
- [x] نظام الإشعارات: إشعار للأب عند إكمال الطفل مهمة + عند رسالة جديدة من الطفل (sendLocalizedPush)

## تفعيل مراقبة التطبيقات الخارجية (Android)

- [x] إنشاء native module لـ Android UsageStats باستخدام expo-modules-core (Kotlin) - modules/usage-stats/
- [x] إضافة شاشة إعدادات إذن UsageStats مع توجيه المستخدم (usage-permission.tsx)
- [x] دمج native module مع app-usage-tracker.ts للحصول على بيانات حقيقية
- [x] ربط بيانات الاستخدام الخارجية بالسيرفر عبر bulkLog API + auto-sync عند فتح التطبيق
- [x] تحسين عرض التطبيقات في parent-monitor مع أيقونات وفئات ملونة + إجمالي وقت الشاشة + زر دليل التفعيل

## إصلاح أزرار المتابعة + رسوم بيانية

- [x] إصلاح زر المتابعة 📊 في شاشة العائلة (family.tsx) - دعم childId + childAccountId + auto-create
- [x] إصلاح زر المتابعة 📊 في شاشة شبكتي (messages.tsx) - نفس الإصلاح
- [x] إصلاح زر المتابعة 📊 في شاشة الأسبوع (weekplan.tsx) - نفس الإصلاح
- [x] إضافة رسوم بيانية تفاعلية أسبوعية: وقت الشاشة (bar chart) + المهام (stacked bars) + الأذكار (streak dots) + ملخص أرقام
- [x] إصلاح المستشار: خيارات الزوجة أصبحت حول العلاقة الزوجية (ليس الأطفال)
- [x] إصلاح المستشار: حقل الإدخال يظهر فقط بعد اختيار الموضوع (طفل/زوجة) للسؤال المفتوح
- [x] إصلاح: حقل الإدخال يبقى ظاهراً بعد إرسال السؤال الأول (flex:1 لـ FlatList + ScrollView)
- [x] إصلاح جذري: نقل inputContainer داخل View flex:1 بدلاً من Fragment لضمان ظهوره دائماً
- [x] إصلاح: مسح المحادثة عند الضغط على "تغيير" + مسح AsyncStorage lastConv

## سؤال عام + سجل المحادثات
- [x] إضافة زر "سؤال عام" في شاشة اختيار الموضوع (بدون تحديد طفل أو زوجة) + أسئلة مقترحة عامة
- [x] حفظ سجل المحادثات السابقة مع metadata (الموضوع، التاريخ، أول سؤال، عدد الرسائل) - history index في AsyncStorage
- [x] عرض قائمة المحادثات السابقة مع إمكانية فتحها واستكمالها (resumeConversation)
- [x] حقل الإدخال ظاهر دائماً في كل الحالات (قبل/بعد اختيار الموضوع) + إرسال مباشر يختار "سؤال عام" تلقائياً
- [x] إضافة زر حذف محادثة من سجل المحادثات السابقة في المستشار (مع تأكيد + حذف من AsyncStorage + تحديث القائمة)

## إصلاحات المستشار - 18 يوليو 2026
- [x] إصلاح: حقل الإدخال لا يظهر في شاشة المستشار (إخفاء PersistentTabBar في /ai-chat)
- [x] إصلاح: زر الرجوع يخرج من المستشار بالكامل بدلاً من العودة خطوة واحدة (select → ready)
- [x] إصلاح: عند الدخول مجدداً تظهر المحادثة السابقة بدلاً من البدء من جديد
- [x] إضافة زر حذف (سلة مهملات) بجانب كل خطة من خطط المستشار في صفحة الطفل
- [x] تعديل prompt المستشار: السلام في أول رد فقط، الردود التالية تبدأ بدعاء (بارك الله فيك / أحسن الله إليك)
- [x] نقل تخزين محادثات المستشار من AsyncStorage إلى قاعدة البيانات (السيرفر) لحفظها دائماً
- [x] إصلاح موضع حقل الإدخال: ثابت أسفل الشاشة فوق شريط التبويب مباشرة (paddingBottom: 72)
- [x] إصلاح widget الصلاة: إزالة أزرار → و ← غير المفيدة وإبقاء زر التحديث فقط
- [x] إصلاح widget الشامل: إزالة clickAction="OPEN_APP" من root لتمكين أزرار التصفح (NEXT_DHIKR/PREV_DHIKR/NEXT_TIP/PREV_TIP)
- [x] إعادة أزرار → و ← في widget الصلاة وإصلاح عملها (TOGGLE_PRAYER_VIEW: تبديل بين عرض الصلاة القادمة فقط / جميع الصلوات)
- [x] إصلاح عدم تغيير اللغة في القوائم (tabs) عند تغيير اللغة - persistent-tab-bar يستخدم useI18n الآن
- [x] إصلاح popup الإشعارات: الأزرار والنصوص باللغة المختارة + الذكر الأصلي بالعربية مع ترجمته + ترجمة الأحكام + ترجمة ISTIGHFAR_TEXTS + MURAQABA/IKHLAS/KHUSHOO/DUA_FOR_CHILDREN
- [x] Mobiele app API endpoint wijzigen naar https://api.rabbaanie.com
- [x] Admin panel testen en verifiëren op de VM (super_admin account aangemaakt, login werkt, dashboard API geeft data)
- [x] Brevo email testen - 2 test-emails verstuurd via Brevo (Status 201, IPv4-pin werkt)
- [x] Vervang Manus OAuth door eigen auth: Google Sign-In + email/wachtwoord via api.rabbaanie.com
- [x] Login scherm herschreven: email/wachtwoord formulier + Google Sign-In knop
- [x] Register scherm aangemaakt: multi-step (basisgegevens → rol/status → adres)
- [x] Backend: /auth/google/redirect en /auth/google/callback endpoints toegevoegd
- [x] i18n vertalingen toegevoegd voor auth schermen (NL/EN/AR)
- [x] Google OAuth Client ID + Secret configureren op de VM (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- [x] Wachtwoord vergeten: backend endpoints (POST /auth/forgot-password + POST /auth/reset-password) op VM
- [x] Wachtwoord vergeten: scherm in de app (forgot-password.tsx) + link vanuit login
- [ ] OAuth Consent Screen configureren (app naam, logo, privacy policy URL)
- [ ] Publish: nieuwe APK met api.rabbaanie.com als backend (ipv manus.space)
- [x] Data migratie: alle data van Manus MySQL naar VM PostgreSQL gemigreerd (975 rijen totaal)
- [x] Data migratie: users (38), children (48), families (14), messages (120), parent_child_links (61)
- [x] Data migratie: partnerships (1), family_members (14), adhkar (376), misconceptions (109)
- [x] Data migratie: content (10), content_categories (21), content_items (13), content_translations (39)
- [x] Data migratie: authors (6), user_functions (33), translation_cache (27), invitation_codes (5)
- [x] Data migratie: user_authorization_roles (2), audit_log (12), parent_ai_consultations (6)
- [x] Data migratie: adhkar en misconceptions tabellen aangemaakt op VM (bestonden nog niet)
- [x] Data migratie: alle rij-aantallen geverifieerd - 100% match tussen MySQL en PostgreSQL
- [x] Data sync verificatie: volledige audit van 56 tabellen - alle data 100% gesynchroniseerd
- [x] Data sync fix: admin_2fa (1 rij), network_contacts (1 rij), specialist_profiles (1 rij) overgezet
- [x] educational_content tabel is leeg (0 rijen) in MySQL, niet aangemaakt op VM (niet nodig)
- [x] messages tabel: PG heeft 1 extra rij (121 vs 120) - toegevoegd via VM direct, geen probleem
- [x] AI advice improvement: childrenEnvironments toegevoegd aan schema en client (personal-advice.tsx + details/personal-advice.tsx)
- [x] AI advice improvement: fitra leeftijdsfasen (0-7, 7-10, 10-14, 15+) met khisaal-sturing toegevoegd aan prompts
- [x] AI advice improvement: goedgekeurde bronnen beperkt tot Ibn Taymiyyah, Ibn al-Qayyim, al-Munajjid, Abd al-Razzaq al-Badr + uploaded books
- [x] AI advice improvement: personalisatie-instructies versterkt in system prompt (gebruik ALLE beschikbare data)
- [x] VM patches deployed: patch1 (childrenEnv), patch2 (personalization), patch3 (fitra+sources)
- [x] AI model configuratie gewijzigd op VM: EASY=google/gemini-3-flash-preview, MEDIUM=anthropic/claude-sonnet-4, HARD=anthropic/claude-opus-4.8
- [x] 34 nieuwe boeken (DOCX) verwerken tot JSON en uploaden naar VM (books 11-44, totaal 43 boeken in library)
- [x] 3 extra boeken toegevoegd: boek 4 (تعظيم الله, 78.716 woorden), boek 10 (الطرق والوسائل التربوية, 161.249 woorden), boek 45 (السنن الكونية, 18.228 woorden)
- [x] Hoofdstukstructuur verbeterd voor boeken 1-10 en 45 (met heading-detectie)
- [x] AI-prompts geüpdatet: getLibraryContext() functie toegevoegd die relevante boekinhoud injecteert in system prompts (general/weekplan/treatment)
- [x] Boeken 11-44 opgesplitst in hoofdstukken (581 nieuwe hoofdstukken gecreëerd)
- [x] AI-chat (ai-chat.ts) gekoppeld aan bibliotheek via getLibraryContext()
- [x] Zoekfunctie toegevoegd aan bibliotheek (zoeken in 45 boeken, 1M+ woorden)
- [x] Alle boeken (1-45) beschikbaar in [bookId].tsx en read.tsx via gedeelde book-data module
- [x] Nieuwe categorieën toegevoegd: تربية الولد, الدعوة, السنن الكونية
- [x] Betaalde vertalingen (NL/EN) integreren in bibliotheekboeken: 21 boeken nu beschikbaar in AR+NL+EN (boek 1-4, 10-26)
- [x] VM API fix geverifieerd: /api/advice/general endpoint werkt correct (9630 bytes AI-advies)
- [x] Quick Tips AI endpoint: getQuickTips toegevoegd aan server/advice.ts + REST route /api/advice/quicktips
- [x] Quick Tips frontend: hardcoded localAdvice vervangen door AI-gegenereerde tips (personal-advice.tsx)
- [x] Weekplan herstructurering: prompt gewijzigd naar 2-divisie structuur (والد مع نفسه + والد مع ولده) met 4 subcategorieën elk (تصفية، تزكية، تربية اللسان، تربية الجوارح)
- [x] Weekplan parser (weekplan.tsx): bijgewerkt om nieuwe Arabische structuur te herkennen en correct te groeperen
- [x] VM deployment: getQuickTips endpoint + weekplan prompt update succesvol gedeployed en werkend op api.rabbaanie.com
- [x] Fix: بيانات الأذكار لا تظهر في اللغات الثلاث (عربي، هولندي، إنجليزي) - السبب: extractRows كان يستخدم MySQL pattern بدل PostgreSQL
- [x] Fix: الشبهات تظهر 0 عناصر - السبب: useEffect كان ينتظر النقر على التبويب، الآن يحمل عند فتح الشاشة
- [x] Fix: منازل القلوب تظهر [object Object] - السبب: getText لم تكن تتعامل مع الكائنات المتداخلة بشكل دفاعي
- [x] Fix: التحقق من عرض جميع القوائم - البيانات متعددة اللغات صحيحة، getText محسّنة لتتعامل مع كل الحالات
- [x] Fix: نصوص شاشة شبكتي مقطوعة - أزلت substring(0,100)+"..." وزدت numberOfLines إلى 3 مع عرض كامل عند التوسيع
- [x] Fix: نصوص الخطة الأسبوعية الداخلية - أزلت numberOfLines={2} من عنوان CardAccordion
- [x] Fix: قائمة أسماء الله الحسنى لا تظهر في شاشة الفطرة (تم إضافة اسم الله للفئة 0-2)
- [x] تحديث قائمة الفطرة (أسماء الله والخصال) من الكتب لجميع الفئات العمرية
- [x] إضافة الكتب كمصادر للذكاء الاصطناعي في التطبيق (knowledge_base.json + server/advice.ts)
- [x] إضافة اسم "الله" كأول اسم في الفئة العمرية 0-2 (الاسم الأعظم الجامع)
- [x] تحديث بيانات قائمة الفطرة من الكتاب لجميع الفئات العمرية (إضافة فئة 0-2 في turuq_tadhiem)
- [x] إضافة الكتب كمصادر للذكاء الاصطناعي في server/advice.ts (loadBookSourcesContext + المصادر المعتمدة)
- [x] نشر التغييرات على VM
- [x] ترتيب الأبناء حسب العمر (من الأكبر إلى الأصغر) في شاشة المستشار
- [x] إضافة نظام حفظ الاستشارات الماضية (خاصة بكل شخص + عامة) - مع تصفية حسب الشخص
- [x] إضافة زر "الاستشارات الماضية" في الشاشة العامة وعند كل شخص (أيقونة ساعة بجانب كل اسم)
- [x] إمكانية حذف استشارة واحدة أو عدة استشارات مختارة أو كل الاستشارات (وضع التحديد + حذف الكل)
- [x] إضافة بحث نصي داخل المحادثات السابقة
- [x] إضافة تصدير/مشاركة استشارة كنص (مشاركة على الهاتف / نسخ على الويب)
- [x] إصلاح ويدجت الصلاة: إزالة React Fragments + fallback بيانات الصلاة
- [x] إصلاح أسهم التنقل: استخدام clickAction بدلاً من widgetAction في widgetTaskHandler
- [x] إصلاح رموز الأسهم في ويدجت الصلاة: استبدال escape sequences بأحرف unicode فعلية
- [x] إصلاح تخطيط ويدجت الصلاة: تقليل أحجام الخطوط والمسافات ليتسع لجميع الأوقات + إصلاح تداخل النصوص في الهيدر
- [x] إعادة تصميم هيدر ويدجت الصلاة: تخطيط عمودي مرتب (تاريخ هجري، مدينة، صلاة قادمة، عد تنازلي) + توزيع المساحة بالتساوي + خط ديناميكي يتكيف مع حجم الويدجت (widgetWidth/widgetHeight)
- [x] إضافة زر واضح لفتح الاستشارات الماضية في شاشة المستشار (ظاهر لجميع المستخدمين)
- [x] إصلاح زر الرجوع في Android: يرجع للصفحة السابقة بدلاً من الرئيسية
- [x] إضافة تحكم بنسبة تكبير الخط في الويدجت (fontScale 80%-150%) مع الحفاظ على باقي الإعدادات
- [x] تحسين GPS: زيادة timeout إلى 30ث + Balanced accuracy (أبراج الاتصال) + prayerLocation ك fallback نهائي + maxAge 30 دقيقة + requiredAccuracy 10km
- [x] إصلاح مشكلة عدم التقاط الموقع GPS: إضافة getLastKnownPositionAsync كمحاولة أولى، تخفيض الدقة إلى Low، إضافة timeout 15ث، إضافة mayShowUserSettingsDialog، رسائل خطأ مترجمة بالكامل
- [x] إصلاح شاشة المساجد: إضافة fallback من locationSettings + getLastKnownPositionAsync + موقع محفوظ من AsyncStorage
- [x] تحسين النصائح الشخصية: إرسال gpsEnabled + تحسين prompts لذكر المدينة والمساجد والمؤسسات صراحةً
- [x] إضافة خيار التواصل مع المتخصصين/أهل العلم في قائمة المستشار
