/**
 * ⚠ THIS FILE IS NOT DEPLOYED. It is a stale copy.
 *
 * The running API is a separate tree (rabbaanie-api, /home/murabbie/rabbaanie-api
 * on the VM) and has diverged from this one in both directions. Conclusions
 * drawn from THIS file about live behaviour have been wrong four times in one
 * night — procedures that are publicProcedure here are protectedProcedure there;
 * an `images` field absent here exists there; admin.users returns bare rows here
 * and computed completeness there; broadcast targeting is ignored here and
 * honoured there.
 *
 * Before reporting anything about how the server behaves — a bug, a security
 * finding, a missing field — check the same symbol in rabbaanie-api, or curl
 * api.rabbaanie.com. Reviewing this file alone produces confident false
 * findings, including ones that look severe.
 */
/**
 * AI Chat Router
 * 
 * Provides endpoints for:
 * - Starting/continuing conversations with the AI advisor
 * - Fetching conversation history
 * - Submitting live data entries
 * - Getting real-time advice based on live data
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { ownsConsultation } from "./consultation-ownership";
import { invokeAI, invokeAIChat, getAIProviderStatus, type AIMessage as ProviderMessage } from "./ai-provider";
import { getOwnCheckinContext } from "./daily-diagnostic";
import { NAME_FIDELITY_RULE } from "./name-fidelity";

// ============================================================
// SYSTEM PROMPTS
// ============================================================

const SYSTEM_PROMPTS = {
  nl: `Je bent een islamitische opvoedingsadviseur gespecialiseerd in het programma "Islamitische Gezinskunde".

Je kernmethodologie is TASFIYA-TAZKIYA-TARBIYA:
- TASFIYA (verstand): Scannen → verschil goed/slecht → slechte mindsets verwijderen → goede planten → activeren
- TAZKIYA (hart): Scannen → laten voelen → slechte verafschuwen → goede liefhebben → hart trainen  
- TARBIYA (gedrag): Daden analyseren → verschil maken → slechte afleren → tawba + nieuwe gewoontes → goede daden praktiseren

PRINCIPES:
- Begin ALTIJD bij de 'aqiedah (geloofsleer) — het fundament
- EERST kijken: wat moet de OUDER zelf verbeteren?
- DAN kijken: wat heeft het KIND nodig op basis van leeftijd?
- Bouw op de GOEDE eigenschappen van het kind
- Gebruik de affiniteiten en hobby's als middel
- Wees ZEER specifiek en gedetailleerd
- Geef concrete, uitvoerbare acties

GELEIDELIJK DIAGNOSESYSTEEM (ZEER BELANGRIJK):
- Wanneer een ouder een probleem presenteert, stel SLECHTS ÉÉN vraag per bericht
- De volgende vraag wordt gebouwd op het antwoord van de vorige
- Stel NOOIT alle vragen tegelijk
- Vragen zijn gericht op het bepalen van:
  1. Waar zit het probleem: verstand van het kind (denkwijze), hart (liefde/haat/tawakkul/acceptatie/ikhlaas/geduld/tevredenheid), tong, of ledematen?
  2. Welk goed al aanwezig is bij het kind (om op te bouwen)
  3. Welk middel passend is: overtuigend onderwijs, herinnering, vermaning, berisping, of straf
  4. In welk domein: tasfiya, tazkiya, of tarbiya
- Diagnose EERST wat goed is bij het kind zodat je weet waarop je bouwt, in precieze details

ALLES VERBINDEN MET ALLAAH (toepassen in ALLE communicatie en advies):
- Verbind alles met Allaah: "Allaah is tevreden met je", "Allaah heeft dit niet goedgekeurd", "Allaah is Degene die ons heeft geleid", "Allaah is Degene die ons heeft gezegend"
- Slechte keuze = gehoorzaamheid aan de shaytaan en eigen begeerten
- Zegeningen komen van Allaah → dank Allaah ervoor
- Zonden = keuzes waar Allaah niet tevreden mee is → vraag Allaah om vergeving
- De vader verbindt alles met Allaah's tevredenheid en met hasanaat
- Verduidelijk wat hasanaat zijn en wat sayyi'aat zijn
- Dit systeem geldt in ALLE communicatie met het kind

Formaat van het uiteindelijke actieplan (ZEER BELANGRIJK):
- Het plan moet verdeeld zijn in tijdsfasen (Week 1, Week 2, enz.)
- Elke fase bevat genummerde, duidelijke en beknopte stappen
- Elke stap begint met een nummer en een duidelijk werkwoord (bijv. "1. Leer je kind ..." of "2. Ga met hem zitten ...")
- Wees niet te lang, elke stap maximaal 1-2 regels
- Vermeld de benodigde tijdsduur per fase
- Stel voor om het plan over te zetten naar het weekprogramma voor dagelijkse opvolging
- Vertel de gebruiker dat het plan automatisch in zijn weekprogramma wordt opgenomen zodat hij de uitvoering dag voor dag kan volgen
- ALTIJD herinneren: korte-termijn tarbiya is gebouwd op lange-termijn tarbiya — zonder dat zal het niet slagen

LOFPRIJZING EN AANMOEDIGING (STRIKT):
- Prijs het kind NOOIT rechtstreeks (niet: "Wat ben jij goed!" of "Knap gedaan!")
- Schrijf alle goede daden toe aan Allaah: "Maashaa'llaah, Allaah heeft jou geleid" of "Alhamdulillaah, dit is een zegen van Allaah"
- Moedig het kind aan door de DAAD te benoemen, niet het kind: "Dit is een goede daad die Allaah liefheeft"
- Druk vreugde uit dat Allaah het kind heeft geleid: "Wat mooi dat Allaah jou dit heeft laten doen"
- Koppel succes altijd aan tawfieq (begeleiding) van Allaah
- Vermijd woorden als "geweldig", "fantastisch", "super" — gebruik in plaats daarvan "Maashaa'llaah", "Baarakallaahu fiek", "Allaah zegene je"

BEGROETINGSREGELS (STRIKT):
- ALLEEN in je EERSTE bericht: begin met "Assalaamu 3alaykum wa rahmatullaahi wa barakaatuh"
- In ALLE volgende berichten (2e bericht en verder): begin NOOIT met salaam. Begin in plaats daarvan met een korte du3aa zoals "Baarakallaahu fiek" of "Ahsanallaahu ilayk" of "Jazaakallaahu khayran" en ga dan direct verder met je vraag of advies

Je antwoordt altijd in het Nederlands tenzij anders gevraagd.
Wees warm, bemoedigend maar ook eerlijk en direct.
Gebruik Qur'aan en Sunnah als basis voor elk advies.
TRANSLITERATIEREGELS (ALTIJD toepassen):
- Schrijf ALTIJD "Allaah" met dubbele 'a' (niet "Allah"). Bijv: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- De Arabische letter ع (ain) wordt geschreven als '3'. Bijv: 3abd, 3ilm, 3Abdullaah, 3aqiedah, 3ibaadah.

REGEL VOOR RELIGIEUZE CITATEN (bindend, geen uitzonderingen): Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe, en schrijf nooit op eigen initiatief een uitspraak toe aan de Profeet ﷺ — noch letterlijk noch naar de strekking. Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt; is daarover niets aangereikt, geef dan algemene geloofsaanmoediging zonder een hadith of ayah te vertellen.

${NAME_FIDELITY_RULE.nl}`,

  ar: `أنت مستشار تربوي إسلامي متخصص في برنامج "علم الأسرة الإسلامي".

منهجيتك الأساسية هي التصفية-التزكية-التربية:
- التصفية (العقل): فحص → تمييز جيد/سيئ → إزالة المبادئ السيئة → غرس الجيد → تفعيل
- التزكية (القلب): فحص → إشعار → تبغيض السيئ → تحبيب الجيد → تدريب القلب
- التربية (السلوك): تحليل الأفعال → تمييز → ترك السيئ → توبة + عادات جديدة → ممارسة الجيد

المبادئ:
- ابدأ دائمًا بالعقيدة — أساس كل شيء
- أولًا: ما يجب على الوالد تحسينه في نفسه
- ثم: ما يحتاجه الطفل حسب عمره
- ابنِ على الصفات الجيدة للطفل
- استخدم الميول والهوايات كوسيلة
- كن دقيقًا جدًا ومفصّلًا
- أعطِ أفعالًا ملموسة وقابلة للتنفيذ

نظام التشخيص المتدرج (مهم جدًا):
- عندما يطرح الوالد مشكلة، اسأل سؤالًا واحدًا فقط في كل رسالة
- السؤال التالي يُبنى على جواب السؤال السابق
- لا تطرح كل الأسئلة دفعة واحدة أبدًا
- الأسئلة تسعى لتحديد:
  1. أين الإشكال: هل في عقل الطفل (طريقة تفكيره) أم قلبه (محبته/بغضه/أعمال قلبه كالتوكل والقبول والإخلاص والصبر والرضا) أم لسانه أم جوارحه؟
  2. ما الخير الموجود عند الطفل (لنبني عليه)
  3. ما الأداة المناسبة: تعليم إقناعي أم تذكير أم وعظ أم زجر أم عقاب
  4. في أي مجال: تصفية أم تزكية أم تربية
- شخّص أولًا ما لدى الطفل من خير كي تعرف ما تبني عليه بأدق التفاصيل

قاعدة المصطلحات المحظورة (مهم جداً - التزم بها دائماً):
يُحظر استخدام أي مصطلح من علم النفس الغربي أو الفلسفة أو البوذية أو الهندوسية أو العصر الجديد أو التربية الغربية الحديثة. استخدم البدائل الإسلامية فقط:
- لا تستخدم: "الروحانية/الروحية/الجانب الروحي" → استخدم: "الإيمان/الجانب الإيماني/أعمال القلب"
- لا تستخدم: "الأنا العليا/الهو" → استخدم: "النفس اللوامة/النفس الأمارة بالسوء"
- لا تستخدم: "العقدة النفسية/عقدة النقص" → استخدم: "الابتلاء/ضعف الثقة بنعم الله"
- لا تستخدم: "الكبت" → استخدم: "الصبر"
- لا تستخدم: "هرم ماسلو/تقدير الذات/تحقيق الذات" → استخدم: "حاجات الإنسان الفطرية/الثقة بالله ثم بالنفس/تحقيق العبودية لله"
- لا تستخدم: "الطفل الداخلي/عقدة أوديب" → لا تذكرها أصلاً
- لا تستخدم: "الصدمة النفسية" → استخدم: "الابتلاء/المصيبة"
- لا تستخدم: "النرجسية" → استخدم: "الكبر والعُجب"
- لا تستخدم: "التنمر" → استخدم: "الظلم والإيذاء"
- لا تستخدم: "الذكاء العاطفي" → استخدم: "الحلم وحسن الخلق"
- لا تستخدم: "المرونة النفسية" → استخدم: "الصبر والرضا بالقدر"
- لا تستخدم: "التفكير الإيجابي/السلبي" → استخدم: "حسن الظن بالله/سوء الظن بالله"
- لا تستخدم: "منطقة الراحة" → استخدم: "الركون والدعة"
- لا تستخدم: "الاحتراق النفسي" → استخدم: "الإرهاق والحاجة للراحة"
- لا تستخدم: "إدارة الغضب" → استخدم: "كظم الغيظ والحلم"
- لا تستخدم: "إدارة المشاعر" → استخدم: "ضبط النفس والصبر"
- لا تستخدم: "الاكتئاب" → استخدم: "الحزن وضيق الصدر"
- لا تستخدم: "الفوبيا" → استخدم: "الخوف الشديد"
- لا تستخدم: "الوسواس القهري" → استخدم: "الوسوسة وكيد الشيطان"
- لا تستخدم: "العلاج النفسي/المعالج النفسي" → استخدم: "الإرشاد والتوجيه/المرشد"
- لا تستخدم: "التعزيز الإيجابي/السلبي" → استخدم: "الثواب والتشجيع/العقاب والزجر"
- لا تستخدم: "الثقة بالنفس" → استخدم: "الثقة بالله ثم بالنفس"
- لا تستخدم: "التسويف" → استخدم: "التكاسل وضعف الهمة"
- لا تستخدم: "التربية الإيجابية/اللطيفة" → استخدم: "التربية بالحب والحزم/الرفق مع الحزم"
- لا تستخدم: "المساواة بين الوالد والطفل" → استخدم: "التراتبية والبر والطاعة"
- لا تستخدم: "حرية التعبير المطلقة" → استخدم: "الأدب في الكلام وحفظ اللسان"
- لا تستخدم: "الهوية الجندرية" → استخدم: "الفطرة: ذكر وأنثى"
- لا تستخدم: "التربية الجنسية" → استخدم: "التربية على الحياء والعفة"
- لا تستخدم: "قانون الجذب/الطاقة الكونية/التجلي" → استخدم: "الدعاء والأخذ بالأسباب/قدرة الله/التوكل"
- لا تستخدم: "التأمل" → استخدم: "التفكر والتدبر"
- لا تستخدم: "الكارما" → استخدم: "الجزاء من جنس العمل"
- لا تستخدم: "اليوغا" → استخدم: "الرياضة والتمارين"
- لا تستخدم: "التأكيدات الإيجابية" → استخدم: "الذكر والدعاء"
- لا تستخدم: "الشفاء الذاتي" → استخدم: "الرقية والدعاء والتداوي"
- لا تستخدم: "الحرية المطلقة" → استخدم: "العبودية لله"
- لا تستخدم: "القلق الوجودي" → استخدم: "ضعف اليقين بالله"
- لا تستخدم: "التفكير النقدي" → استخدم: "التمييز بين الحق والباطل"
- لا تستخدم: "صورة الجسد" → استخدم: "الرضا بخلق الله"
- "اتخاذ القرار" مقبول إذا كان مبنياً على رضا الله والموازين الشرعية

قاعدة التعليق بالله (تُطبَّق في كل تواصل ونصيحة وعلاج):
- علّق كل شيء بالله: "الله راضٍ عنك"، "الله لم يرضَ عن هذا"، "الله هو الذي هدانا"، "الله هو الذي أنعم علينا"
- الخيار السيئ = طاعة للشيطان ولهواه
- النعم تأتي من عند الله → يشكر الله عليها
- المعاصي = خيارات لا يرضى الله عنها → يستغفر الله منها
- يعلّق الأب كل شيء برضا الله وبالحسنات
- يبيّن ما هي الحسنات وما هي السيئات
- هذا النظام يُطبَّق في كل طرق التواصل مع الطفل

تنسيق النتيجة النهائية (مهم جدًا - التزم بهذا التنسيق حرفيًا):
عندما تنتهي من التشخيص وتقدم العلاج، قسّم النتيجة إلى الأقسام التالية بالضبط:

التشخيص:
(هنا تكتب التشخيص القاطع لجذر المشكلة - هل هي في العقل أم القلب أم اللسان أم الجوارح)

مهام الوالد:
(ما يصلحه الوالد في نفسه أولاً، فالتربية تبدأ منه قبل أن تبدأ من الطفل)
تصفية (تصحيح عقل الوالد):
(خطوات مرقمة)
تزكية (تصحيح قلب الوالد):
(خطوات مرقمة)
تربية (تصحيح سلوك الوالد في تعامله مع الطفل):
(خطوات مرقمة)

مهام الابن:
(اكتب «مهام الابن» أو «مهام البنت» بحسب جنس الطفل)
تصفية (علاج عقل الطفل - إزالة الأفكار السيئة وغرس الجيدة):
(خطوات مرقمة)
تزكية (علاج قلب الطفل - تحبيب الخير وتبغيض الشر):
(خطوات مرقمة)
تربية في اللسان (ترك الكلام السيئ وتعلم الجيد):
(خطوات مرقمة)
تربية في الجوارح (ترك الأفعال السيئة وممارسة الجيدة):
(خطوات مرقمة)

الجدول الزمني والتقييم:
(الأسبوع 1-2 ثم الأسبوع 3-4، ومعايير الانتقال للمرحلة التالية)

- افصل دائمًا بين ما يفعله الوالد وما يفعله الابن/البنت؛ لا تدمج القسمين
- كل قسم يبدأ بعنوانه في سطر مستقل متبوعًا بنقطتين (:)
- كل خطوة تبدأ برقم وفعل أمر واضح في سطر مستقل، ولا تكتب خطوتين في سطر واحد
- كن مفصلاً وعمليًا في كل خطوة
- ابنِ العلاج على الصفات الجيدة الموجودة عند الطفل
- تنبيه دائم: التربية القصيرة المدى مبنية على التربية الطويلة المدى — بدونها لن تفلح
- اقترح نقل الخطة إلى البرنامج الأسبوعي للمتابعة اليومية

قواعد المدح والتشجيع (صارمة):
- لا تمدح الطفل مباشرة أبدًا (لا تقل: "أنت شاطر" أو "ما أروعك")
- انسب كل خير إلى الله: "ما شاء الله، الله هداك" أو "الحمد لله، هذه نعمة من الله"
- شجّع الفعل لا الشخص: "هذا عمل صالح يحبه الله"
- عبّر عن الفرح بأن الله هدى الطفل: "ما أجمل أن الله وفّقك لهذا"
- اربط النجاح دائمًا بتوفيق الله
- تجنب كلمات مثل "رائع" و"ممتاز" و"عظيم" — استخدم بدلها "ما شاء الله" و"بارك الله فيك" و"الله يبارك لك"

أجب دائمًا بالعربية الفصحى.
كن دافئًا ومشجعًا ولكن صادقًا ومباشرًا.
استخدم القرآن والسنة كأساس لكل نصيحة.

قواعد إلزامية صارمة:
- ابدأ أول رسالة فقط بـ "السلام عليكم ورحمة الله وبركاته" (لا تقل أهلاً أو مرحبًا)
- في الردود التالية (الرسالة الثانية فما بعد): لا تبدأ بالسلام أبدًا. ابدأ بدعاء مختصر مثل "بارك الله فيك" أو "أحسن الله إليك" أو "جزاك الله خيرًا" ثم اكمل السؤال أو النصيحة مباشرة
- اكتب كل شيء بالعربية فقط. لا تستخدم الحروف اللاتينية أبدًا لأي كلمة.
- اكتب "الله" وليس "Allaah". اكتب "ما شاء الله" وليس "Maashaa'llaah". اكتب "بسم الله" وليس "Bismillaah".
- اكتب أسماء الأطفال بالعربية كما هي (عبد الرؤوف، عبد الله، محمد). لا تكتب "3Abd-ur-Ra'oof" أو أي شكل لاتيني.
- لا تستخدم النجوم (**) أو أي رموز تنسيق. اجعل النص نظيفًا وواضحًا.
- لا تستخدم أرقامًا بدل الحروف العربية (لا تكتب 3 بدل ع).

قاعدة الاستشهاد الديني (ملزمة بلا استثناء): يُحظر منعًا باتًا الاستشهاد بأي حديث نبوي أو آية قرآنية من الذاكرة، أو نسبة أي قول إلى النبي ﷺ من تلقاء نفسك، نصًا أو معنى. لا تستخدم إلا نصّ حديث أو آية ورد لك حرفيًا في موضع آخر من هذا النص؛ فإن لم يرد نص يخص هذا الموضوع، فقدّم التشجيع الإيماني بعبارات عامة دون سرد أي حديث أو آية.

${NAME_FIDELITY_RULE.ar}`,

  en: `You are an Islamic parenting advisor specialized in the "Islamic Family Science" program.

Your core methodology is TASFIYA-TAZKIYA-TARBIYA:
- TASFIYA (mind): Scan → distinguish good/bad → remove bad mindsets → plant good → activate
- TAZKIYA (heart): Scan → make feel → make bad abhorrent → make good beloved → train heart
- TARBIYA (behavior): Analyze deeds → distinguish → unlearn bad → tawbah + new habits → practice good

PRINCIPLES:
- ALWAYS start with 'aqeedah (creed) — the foundation
- FIRST look: what must the PARENT improve in themselves?
- THEN look: what does the CHILD need based on age?
- Build on the GOOD qualities of the child
- Use affinities and hobbies as means
- Be VERY specific and detailed
- Give concrete, actionable steps

PROGRESSIVE DIAGNOSIS SYSTEM (VERY IMPORTANT):
- When a parent presents a problem, ask ONLY ONE question per message
- The next question is built on the answer to the previous one
- NEVER ask all questions at once
- Questions aim to determine:
  1. Where is the problem: child's mind (thinking), heart (love/hate/tawakkul/acceptance/ikhlaas/patience/contentment), tongue, or limbs?
  2. What good already exists in the child (to build upon)
  3. What tool is appropriate: persuasive teaching, reminding, admonition, rebuke, or punishment
  4. In which domain: tasfiya, tazkiya, or tarbiya
- First diagnose what good the child has so you know what to build on, in precise detail

ATTACH EVERYTHING TO ALLAAH (apply in ALL communication and advice):
- Attach everything to Allaah: "Allaah is pleased with you", "Allaah did not approve of this", "Allaah is the One who guided us", "Allaah is the One who blessed us"
- Bad choice = obedience to Shaytaan and one's desires
- Blessings come from Allaah → thank Allaah for them
- Sins = choices Allaah is not pleased with → seek Allaah's forgiveness
- The father attaches everything to Allaah's pleasure and to hasanaat
- Clarify what are hasanaat and what are sayyi'aat
- This system applies in ALL communication with the child

Final action plan format (VERY IMPORTANT):
- The plan must be divided into time phases (Week 1, Week 2, etc.)
- Each phase contains numbered, clear and concise steps
- Each step starts with a number and a clear action verb (e.g. "1. Teach your child ..." or "2. Sit with them ...")
- Keep it brief, each step maximum 1-2 lines
- Mention the required duration for each phase
- Suggest transferring the plan to the weekly program for daily follow-up
- Tell the user that the plan will be automatically added to their weekly program so they can track execution day by day
- ALWAYS remind: short-term tarbiya is built on long-term tarbiya — without it, it will not succeed

PRAISE AND ENCOURAGEMENT RULES (STRICT):
- NEVER praise the child directly (not: "You're so good!" or "Well done!")
- Attribute all good deeds to Allaah: "Maashaa'llaah, Allaah guided you" or "Alhamdulillaah, this is a blessing from Allaah"
- Encourage the ACTION, not the child: "This is a good deed that Allaah loves"
- Express joy that Allaah guided the child: "How beautiful that Allaah enabled you to do this"
- Always link success to tawfeeq (guidance) from Allaah
- Avoid words like "amazing", "fantastic", "great" — use instead "Maashaa'llaah", "Baarakallaahu feek", "May Allaah bless you"

TRANSLITERATION RULES (ALWAYS apply):
- ALWAYS write "Allaah" with double 'a' (not "Allah"). E.g.: Maashaa'llaah, 'Abdullaah, Bismillaah, In shaa' Allaah, SubhaanAllaah, Astaghfirullaah.
- The Arabic letter ع (ain) is written as '3'. E.g.: 3abd, 3ilm, 3Abdullaah, 3aqeedah, 3ibaadah.

GREETING RULES (STRICT):
- ONLY in your FIRST message: start with "Assalaamu 3alaykum wa rahmatullaahi wa barakaatuh"
- In ALL subsequent messages (2nd message onwards): NEVER start with salaam. Instead start with a short du3aa like "Baarakallaahu feek" or "Ahsanallaahu ilayk" or "Jazaakallaahu khayran" then continue with your question or advice directly

Always respond in English.
Be warm, encouraging but also honest and direct.
Use Qur'aan and Sunnah as the basis for every advice.

SCRIPTURE CITATION RULE (binding, no exceptions): Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory, and never attribute any saying to the Prophet ﷺ on your own initiative — whether by exact wording or by meaning. Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt; if none was given for this topic, give religious encouragement in general terms without narrating any hadith or ayah.

${NAME_FIDELITY_RULE.en}`,
};

// ============================================================
// KNOWLEDGE ENRICHMENT FROM DB (adhkar + misconceptions)
// ============================================================

/**
 * Fetch relevant misconceptions from DB to enrich AI context.
 * Returns a compact string summary of common misconceptions the AI should be aware of.
 */
async function getMisconceptionsContext(lang: string): Promise<string> {
  try {
    const { getDb } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return "";
    const results = await db.execute(
      sql.raw(`SELECT misconception_ar, misconception_nl, misconception_en, refutation_ar, refutation_nl, refutation_en FROM misconceptions ORDER BY sort_order LIMIT 30`)
    );
    const rows: any[] = Array.isArray(results) ? (Array.isArray(results[0]) ? results[0] : results) : [];
    if (!rows.length) return "";
    const header = lang === "ar" ? "\n=== شبهات تربوية يجب أن تعرفها (لا تقع فيها ولا توافق عليها) ==="
      : lang === "en" ? "\n=== Parenting misconceptions you must know (do not fall into them or agree with them) ==="
      : "\n=== Opvoedingsmisvattingen die je moet kennen (val er niet in en stem er niet mee in) ===";
    let ctx = header + "\n";
    for (const r of rows.slice(0, 20)) {
      const misc = lang === "ar" ? r.misconception_ar : lang === "en" ? r.misconception_en : r.misconception_nl;
      const ref = lang === "ar" ? r.refutation_ar : lang === "en" ? r.refutation_en : r.refutation_nl;
      if (misc) ctx += `\u2022 ${misc}\n  \u2192 ${(ref || "").substring(0, 150)}\n`;
    }
    return ctx;
  } catch {
    return "";
  }
}

// ============================================================
// IN-MEMORY STORAGE (for when DB is not available)
// ============================================================

interface ConversationStore {
  id: string;
  userId: string;
  childId?: string;
  type: string;
  title: string;
  language: string;
  messages: { role: string; content: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

interface LiveDataStore {
  id: string;
  userId: string;
  childId?: string;
  category: string;
  title: string;
  description?: string;
  severity: string;
  mood?: string;
  tags?: string[];
  addressed: boolean;
  observedAt: string;
  createdAt: string;
}

// In-memory stores (persisted via AsyncStorage on client, DB when available)
const conversations: Map<string, ConversationStore> = new Map();
const liveDataEntries: Map<string, LiveDataStore> = new Map();
let nextConvId = 1;
let nextLiveDataId = 1;

// ============================================================
// ROUTER
// ============================================================

export const aiChatRouter = router({
  /**
   * Start a new conversation
   */
  startConversation: publicProcedure
    .input(z.object({
      userId: z.string().optional().default("anonymous"),
      childId: z.string().optional(),
      childName: z.string().optional(),
      childAge: z.string().optional(),
      type: z.enum(["freeform", "weekplan", "treatment", "general"]).default("freeform"),
      language: z.enum(["nl", "ar", "en"]).default("nl"),
      initialMessage: z.string(),
      parentContext: z.string().optional(),
      consultationType: z.enum(["child", "spouse"]).optional().default("child"),
      parentGender: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const convId = `conv_${nextConvId++}`;
      const lang = input.language;
      const basePrompt = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.nl;

      // Build context-enriched system prompt based on consultation type
      let enrichedPrompt = basePrompt;
      
      if (input.consultationType === "spouse") {
        // Spouse consultation - add marriage-specific context
        // Never interpolate the spouse's name here (getSpouseAdvice precedent,
        // server/advice.ts): this is a bare identification clause the model
        // never needs to reconstruct sentences around, so dropping it removes
        // a mis-transliteration risk for free instead of relying on the
        // name-fidelity rule to catch it downstream.
        const spousePromptAddition = lang === "ar"
          ? `\n\n=== استشارة زوجية ===\nهذه استشارة حول العلاقة الزوجية. المستشير ${input.parentGender === "male" ? "زوج (رجل)" : "زوجة (امرأة)"}.\n\nقواعد الاستشارة الزوجية:\n- استخدم القرآن والسنة في كل نصيحة\n- ذكّر بحقوق كل طرف وواجباته\n- المعاشرة بالمعروف أساس\n- الصبر والرفق والحكمة\n- لا تنحز لطرف على حساب الآخر\n- الهدف هو رضا الله واستقرار الأسرة\n- اسأل سؤالاً واحداً في كل رسالة للتشخيص\n- قدّم حلولاً عملية مبنية على الكتاب والسنة`
          : lang === "en"
            ? `\n\n=== Spousal Consultation ===\nThis is a consultation about the marital relationship. The consultant is a ${input.parentGender === "male" ? "husband (man)" : "wife (woman)"}.\n\nMarital consultation rules:\n- Use Qur'aan and Sunnah in every advice\n- Remind of each party's rights and obligations\n- Good companionship (mu3aasharah bil-ma3roof) is the foundation\n- Patience, gentleness, and wisdom\n- Do not side with one party against the other\n- The goal is Allaah's pleasure and family stability\n- Ask ONE question per message for diagnosis\n- Provide practical solutions based on the Book and Sunnah`
            : `\n\n=== Huwelijksadvies ===\nDit is een consultatie over de huwelijksrelatie. De raadpleger is een ${input.parentGender === "male" ? "echtgenoot (man)" : "echtgenote (vrouw)"}.\n\nRegels huwelijksadvies:\n- Gebruik Qur'aan en Soennah bij elk advies\n- Herinner aan de rechten en plichten van beide partijen\n- Goed samenleven (mu3aasharah bil-ma3roef) is de basis\n- Geduld, zachtheid en wijsheid\n- Kies geen partij ten koste van de ander\n- Het doel is Allaah's tevredenheid en gezinsstabiliteit\n- Stel ÉÉN vraag per bericht voor diagnose\n- Geef praktische oplossingen gebaseerd op het Boek en de Soennah`;
        enrichedPrompt += spousePromptAddition;
      } else if (input.childName || input.childAge) {
        const childInfo = lang === "ar"
          ? `\n\nمعلومات الطفل: ${input.childName || "غير محدد"}، العمر: ${input.childAge || "غير محدد"} سنوات`
          : lang === "en"
            ? `\n\nChild info: ${input.childName || "not specified"}, Age: ${input.childAge || "not specified"} years`
            : `\n\nKind info: ${input.childName || "niet opgegeven"}, Leeftijd: ${input.childAge || "niet opgegeven"} jaar`;
        enrichedPrompt += childInfo;
      }
      if (input.parentContext) {
        enrichedPrompt += `\n\n${input.parentContext}`;
      }
      // Enrich with misconceptions knowledge from DB
      const miscCtx = await getMisconceptionsContext(lang);
      if (miscCtx) enrichedPrompt += miscCtx;
      // Fold in the user's OWN recent daily check-in signals (additive; "" when none)
      enrichedPrompt += await getOwnCheckinContext(ctx.user?.id, lang);

      // Get AI response
      const response = await invokeAIChat(
        enrichedPrompt,
        [],
        input.initialMessage
      );

      // Store conversation
      const conversation: ConversationStore = {
        id: convId,
        userId: input.userId || "anonymous",
        childId: input.childId,
        type: input.type,
        title: input.initialMessage.slice(0, 100),
        language: lang,
        messages: [
          { role: "user", content: input.initialMessage, createdAt: new Date().toISOString() },
          { role: "assistant", content: response.content, createdAt: new Date().toISOString() },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      conversations.set(convId, conversation);

      return {
        conversationId: convId,
        response: response.content,
        provider: response.provider,
        model: response.model,
      };
    }),

  /**
   * Send a message in an existing conversation
   */
  sendMessage: publicProcedure
    .input(z.object({
      conversationId: z.string(),
      message: z.string(),
      language: z.enum(["nl", "ar", "en"]).default("nl"),
      childName: z.string().optional(),
      childAge: z.string().optional(),
      parentContext: z.string().optional(),
      consultationType: z.enum(["child", "spouse"]).optional().default("child"),
      parentGender: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversation = conversations.get(input.conversationId);
      if (!conversation) {
        throw new Error("Conversation not found. Start a new conversation first.");
      }

      const lang = input.language || conversation.language;
      let systemPrompt = SYSTEM_PROMPTS[lang as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.nl;

      // Enrich system prompt based on consultation type
      if (input.consultationType === "spouse") {
        // Same drop as startConversation above — never interpolate the
        // spouse's name (getSpouseAdvice precedent, server/advice.ts).
        const spouseCtx = lang === "ar"
          ? `\n\n=== استشارة زوجية ===\nالمستشير ${input.parentGender === "male" ? "زوج" : "زوجة"}.`
          : lang === "en"
            ? `\n\n=== Spousal Consultation ===\nConsultant is a ${input.parentGender === "male" ? "husband" : "wife"}.`
            : `\n\n=== Huwelijksadvies ===\nRaadpleger is een ${input.parentGender === "male" ? "echtgenoot" : "echtgenote"}.`;
        systemPrompt += spouseCtx;
      } else if (input.childName || input.childAge) {
        const childInfo = lang === "ar"
          ? `\n\nمعلومات الطفل: ${input.childName || "غير محدد"}، العمر: ${input.childAge || "غير محدد"} سنوات`
          : lang === "en"
            ? `\n\nChild info: ${input.childName || "not specified"}, Age: ${input.childAge || "not specified"} years`
            : `\n\nKind info: ${input.childName || "niet opgegeven"}, Leeftijd: ${input.childAge || "niet opgegeven"} jaar`;
        systemPrompt += childInfo;
      }
      // Add environment context to every message so the AI always has it
      if (input.parentContext) {
        systemPrompt += `\n\n${input.parentContext}`;
      }
      // Fold in the user's OWN recent daily check-in signals (additive; "" when none)
      systemPrompt += await getOwnCheckinContext(ctx.user?.id, lang === "ar" ? "ar" : lang === "en" ? "en" : "nl");

      // Build history for context
      const history: ProviderMessage[] = conversation.messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Get AI response with conversation history
      const response = await invokeAIChat(
        systemPrompt,
        history,
        input.message
      );

      // Update conversation
      conversation.messages.push(
        { role: "user", content: input.message, createdAt: new Date().toISOString() },
        { role: "assistant", content: response.content, createdAt: new Date().toISOString() }
      );
      conversation.updatedAt = new Date().toISOString();

      return {
        response: response.content,
        provider: response.provider,
        model: response.model,
      };
    }),

  /**
   * Get conversation history
   */
  getConversation: publicProcedure
    .input(z.object({
      conversationId: z.string(),
    }))
    .query(({ input }) => {
      const conversation = conversations.get(input.conversationId);
      if (!conversation) {
        return null;
      }
      return conversation;
    }),

  /**
   * List all conversations for a user
   */
  listConversations: publicProcedure
    .input(z.object({
      userId: z.string().optional().default("anonymous"),
    }))
    .query(({ input }) => {
      const userConvs = Array.from(conversations.values())
        .filter(c => c.userId === input.userId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return userConvs.map(c => ({
        id: c.id,
        title: c.title,
        type: c.type,
        childId: c.childId,
        language: c.language,
        messageCount: c.messages.length,
        lastMessage: c.messages[c.messages.length - 1]?.content.slice(0, 100),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    }),

  /**
   * Submit live data entry (observation about a child)
   */
  submitLiveData: publicProcedure
    .input(z.object({
      userId: z.string().optional().default("anonymous"),
      childId: z.string().optional(),
      category: z.enum(["behavior", "mood", "milestone", "concern", "prayer", "achievement", "health", "social"]),
      title: z.string(),
      description: z.string().optional(),
      severity: z.enum(["low", "medium", "high"]).default("medium"),
      mood: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(({ input }) => {
      const entryId = `live_${nextLiveDataId++}`;
      const entry: LiveDataStore = {
        id: entryId,
        userId: input.userId || "anonymous",
        childId: input.childId,
        category: input.category,
        title: input.title,
        description: input.description,
        severity: input.severity,
        mood: input.mood,
        tags: input.tags,
        addressed: false,
        observedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      liveDataEntries.set(entryId, entry);
      return { id: entryId, success: true };
    }),

  /**
   * Get live data entries for a child
   */
  getLiveData: publicProcedure
    .input(z.object({
      userId: z.string().optional().default("anonymous"),
      childId: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().default(20),
    }))
    .query(({ input }) => {
      let entries = Array.from(liveDataEntries.values())
        .filter(e => e.userId === input.userId);
      
      if (input.childId) {
        entries = entries.filter(e => e.childId === input.childId);
      }
      if (input.category) {
        entries = entries.filter(e => e.category === input.category);
      }

      return entries
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, input.limit);
    }),

  /**
   * Get real-time advice based on recent live data
   */
  getLiveAdvice: publicProcedure
    .input(z.object({
      userId: z.string().optional().default("anonymous"),
      childId: z.string().optional(),
      childName: z.string().optional(),
      childAge: z.string().optional(),
      language: z.enum(["nl", "ar", "en"]).default("nl"),
      specificQuestion: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lang = input.language;
      const systemPrompt = (SYSTEM_PROMPTS[lang as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.nl)
        + await getOwnCheckinContext(ctx.user?.id, lang);

      // Gather recent live data for this child
      let recentData = Array.from(liveDataEntries.values())
        .filter(e => e.userId === (input.userId || "anonymous"));
      
      if (input.childId) {
        recentData = recentData.filter(e => e.childId === input.childId);
      }

      recentData = recentData
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      // Build context from live data
      const dataContext = recentData.map(d => {
        return `[${d.category}] ${d.title}${d.description ? ': ' + d.description : ''} (${d.severity})`;
      }).join("\n");

      const contextLabel = lang === "ar" ? "البيانات الحية الأخيرة" : lang === "en" ? "Recent live observations" : "Recente live observaties";
      const questionLabel = lang === "ar" ? "سؤال محدد" : lang === "en" ? "Specific question" : "Specifieke vraag";
      const requestLabel = lang === "ar" 
        ? "بناءً على هذه الملاحظات الأخيرة، أعطِ نصيحة فورية وعملية"
        : lang === "en"
          ? "Based on these recent observations, give immediate and practical advice"
          : "Geef op basis van deze recente observaties direct en praktisch advies";

      let userMessage = `${contextLabel}:\n${dataContext || "(geen data)"}\n\n${requestLabel}`;
      if (input.specificQuestion) {
        userMessage += `\n\n${questionLabel}: ${input.specificQuestion}`;
      }

      const response = await invokeAIChat(systemPrompt, [], userMessage);

      // Mark entries as addressed
      recentData.forEach(d => {
        const entry = liveDataEntries.get(d.id);
        if (entry) entry.addressed = true;
      });

      return {
        advice: response.content,
        basedOnEntries: recentData.length,
        provider: response.provider,
      };
    }),

  /**
   * Get AI provider status (for admin)
   */
  getProviderStatus: publicProcedure
    .query(() => {
      return getAIProviderStatus();
    }),

  // ============================================================
  // PERSISTENT CONVERSATION STORAGE (Database)
  // ============================================================

  /** Save/update a conversation to the database */
  saveConversationToDb: publicProcedure
    .input(z.object({
      conversationId: z.string().optional(),
      dbId: z.number().optional(),
      deviceId: z.string(),
      childId: z.string().optional(),
      childName: z.string().optional(),
      childAge: z.string().optional(),
      consultationType: z.string(),
      language: z.string().optional(),
      title: z.string().optional(),
      messages: z.array(z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createParentAiConsultation, updateParentAiConsultation, getParentAiConsultation } = await import("./db");
      const ownerId = ctx.user?.id ?? 0;

      if (input.dbId) {
        // Update existing. dbId is a sequential primary key and this endpoint is
        // open, so without this check any caller could walk dbId and overwrite
        // every family's consultation — the same enumeration the read and delete
        // paths already refuse.
        //
        // Owning the account counts as owning the row: matching on deviceId
        // alone locked a parent out of their own consultation the moment they
        // reinstalled, which is how these came to be unreachable at all.
        // Once a row has a real owner the account is the only thing that counts:
        // deviceId comes from the client, so still honouring it would let anyone
        // who learns a device id overwrite an owned consultation. The device
        // fallback survives only for rows nobody owns yet.
        const existing = await getParentAiConsultation(input.dbId);
        if (!ownsConsultation(existing, ownerId, input.deviceId)) {
          return { dbId: null };
        }
        await updateParentAiConsultation(input.dbId, {
          messages: input.messages,
          messageCount: input.messages.length,
          title: input.title || input.messages[0]?.content?.slice(0, 50) || "",
        });
        return { dbId: input.dbId };
      } else {
        // Create new. parentId used to be hardcoded to 0, so a consultation
        // belonged to a device and nothing else — reinstall and it was gone.
        const result = await createParentAiConsultation({
          parentId: ownerId,
          consultationType: input.consultationType || "child",
          targetId: input.childId || null,
          targetName: input.childName || null,
          title: input.title || input.messages[0]?.content?.slice(0, 50) || "",
          language: input.language || "ar",
          deviceId: input.deviceId,
          messages: input.messages,
          messageCount: input.messages.length,
        });
        return { dbId: result?.id || null };
      }
    }),

  /** List conversations from database for a device */
  listConversationsFromDb: publicProcedure
    .input(z.object({
      deviceId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const { getParentAiConsultationsForOwner } = await import("./db");
      const ownerId = ctx.user?.id ?? 0;
      // Reading does not claim anything. Adopting this device's unowned rows
      // would have let any signed-in caller pass someone else's deviceId and
      // take permanent ownership of their consultations — the id comes from the
      // request body and nothing attests it. Unowned rows stay readable by
      // device below; new ones carry the account from the start.
      const conversations = await getParentAiConsultationsForOwner(ownerId, input.deviceId);
      return conversations.map(c => ({
        dbId: c.id,
        title: c.title || "",
        childName: c.targetName || "",
        consultationType: c.consultationType,
        language: c.language || "ar",
        messageCount: c.messageCount || 0,
        createdAt: c.createdAt?.toISOString() || "",
        updatedAt: c.updatedAt?.toISOString() || "",
      }));
    }),

  /** Get a single conversation with messages from database */
  // A mutation, not a query, purely so the deviceId travels in the POST body:
  // it authorises access to the conversation, and a GET would leave it in URLs,
  // access logs and proxy logs.
  getConversationFromDb: publicProcedure
    .input(z.object({
      dbId: z.number(),
      deviceId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getParentAiConsultation } = await import("./db");
      const conv = await getParentAiConsultation(input.dbId);
      if (!conv) return null;
      // dbId is a sequential primary key, so without this an unauthenticated
      // caller could walk it and read every family's consultation.
      if (!ownsConsultation(conv, ctx.user?.id ?? 0, input.deviceId)) return null;
      return {
        dbId: conv.id,
        title: conv.title || "",
        childId: conv.targetId || "",
        childName: conv.targetName || "",
        consultationType: conv.consultationType,
        language: conv.language || "ar",
        messages: (conv.messages as any[]) || [],
        messageCount: conv.messageCount || 0,
        createdAt: conv.createdAt?.toISOString() || "",
      };
    }),

  /** Delete a conversation from database */
  deleteConversationFromDb: publicProcedure
    .input(z.object({
      dbId: z.number(),
      deviceId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getParentAiConsultation, deleteParentAiConsultation } = await import("./db");
      const conv = await getParentAiConsultation(input.dbId);
      // Same enumeration risk as the read path: without the ownership check any
      // caller could delete every family's consultations.
      if (!ownsConsultation(conv, ctx.user?.id ?? 0, input.deviceId)) return { success: false };
      await deleteParentAiConsultation(input.dbId);
      return { success: true };
    }),
});
