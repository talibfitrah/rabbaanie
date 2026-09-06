import { useState, useMemo, useCallback, useRef } from "react";
import { View, Text, Pressable, ScrollView, Alert, LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { ParentProfile } from "@/lib/store";
import { FormField, TextField, SelectField, MultiSelectField, HybridField, HonestyBanner, SpouseVisibilityNotice, ValidationBanner, HasanaatProgressBar } from "@/components/form-field";
import { DatePicker } from "@/components/date-picker";
import { useI18n } from "@/lib/i18n";

// ============ PHASE DEFINITIONS ============

interface QuestionDef {
  key: string;
  label: string;
  type: "select" | "multiselect" | "text" | "hybrid" | "date";
  options?: { value: string; label: string }[];
  conditional?: (profile: ParentProfile) => boolean;
  hint?: string;
}

interface Phase {
  id: string;
  title: string;
  subtitle?: string;
  questions: QuestionDef[];
  conditional?: (profile: ParentProfile) => boolean;
}

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function getPHASES(lang: Lang, gender?: string, known?: { gender: boolean; maritalStatus: boolean; birthDate: boolean }): Phase[] {
  const hint = tx(lang, "Kies een optie of schrijf uw eigen antwoord", "Choose an option or write your own answer", "اختر خيارًا أو اكتب إجابتك الخاصة");
  const isMale = gender === "man";
  const isFemale = gender === "vrouw";
  // Gender-aware text helper for Arabic
  const gAr = (male: string, female: string, neutral: string) => {
    if (isMale) return male;
    if (isFemale) return female;
    return neutral;
  };
  // The short onboarding (app/onboarding/index.tsx) already collects gender,
  // marital status and birth date before handing off to this wizard. Once all
  // three are known, this phase's own gender/maritalStatus/birthDate questions
  // are all skipped below (`known`-gated) and the ONLY thing left in it is
  // previousMethodology — so re-showing the "Basic information"
  // heading (identical wording to the short onboarding's own first screen) is
  // what read as the whole flow restarting, even though no question was
  // actually repeated. Relabel to what's really left once that handoff is
  // confirmed; reached any other way, this phase still needs its full framing.
  const isContinuing = !!(known?.gender && known?.maritalStatus && known?.birthDate);
  return [
  // ===== FASE 1: BASISGEGEVENS =====
  {
    id: "basis",
    title: isContinuing
      ? tx(lang, "Uw opvoedmethode", "Your parenting method", "منهجك في التربية")
      : tx(lang, "Basisgegevens", "Basic information", "المعلومات الأساسية"),
    subtitle: isContinuing
      ? tx(lang, "Nog één vraag, dan gaan we verder.", "One more question, then we continue.", "سؤال أخير، ثم نتابع.")
      : tx(lang, "Laten we beginnen met wie u bent.", "Let's start with who you are.", "لنبدأ بمن أنت."),
    questions: [
      {
        key: "gender",
        label: tx(lang, "Wat is uw geslacht?", "What is your gender?", "ما هو جنسك؟"),
        type: "select",
        conditional: () => !known?.gender,
        options: [
          { value: "man", label: tx(lang, "Man", "Man", "رجل") },
          { value: "vrouw", label: tx(lang, "Vrouw", "Woman", "امرأة") },
        ],
      },
      {
        key: "maritalStatus",
        label: tx(lang, "Wat is uw burgerlijke staat?", "What is your marital status?", "ما هي حالتك الاجتماعية؟"),
        type: "select",
        conditional: () => !known?.maritalStatus,
        options: [
          { value: "getrouwd", label: tx(lang, "Getrouwd", "Married", gAr("متزوج", "متزوجة", "متزوج/ة")) },
          { value: "gescheiden", label: tx(lang, "Gescheiden", "Divorced", gAr("مطلّق", "مطلّقة", "مطلق/ة")) },
          { value: "weduwe_weduwnaar", label: tx(lang, isMale ? "Weduwnaar" : isFemale ? "Weduwe" : "Weduwe/Weduwnaar", isMale ? "Widower" : isFemale ? "Widow" : "Widow/Widower", gAr("أرمل", "أرملة", "أرمل/ة")) },
          { value: "alleenstaand", label: tx(lang, "Alleenstaand", "Single", gAr("أعزب", "عزباء", "أعزب/عزباء")) },
        ],
      },
      {
        key: "previousMethodology",
        label: tx(lang, "Heeft u eerder een opvoedmethode gevolgd? Zo ja, welke?", "Have you previously followed a parenting method? If so, which one?", "هل اتبعت منهجًا تربويًا سابقًا؟ إن كان نعم، فما هو؟"),
        type: "hybrid",
        options: [
          { value: "geen", label: tx(lang, "Nee, geen specifieke methode", "No, no specific method", "لا، لم أتبع منهجًا محددًا") },
          { value: "montessori", label: "Montessori" },
          { value: "positief_opvoeden", label: tx(lang, "Positief opvoeden", "Positive parenting", "التربية الإيجابية") },
          { value: "westers_psychologie", label: tx(lang, "Westerse psychologie", "Western psychology", "علم النفس الغربي") },
          { value: "quran_sunnah", label: tx(lang, "Altijd al Qur'aan & Soennah", "Always Qur'aan & Sunnah", "دائمًا الكتاب والسنة") },
        ],
        hint: tx(lang, "Kies een optie of schrijf uw eigen antwoord", "Choose an option or write your own answer", "اختر خيارًا أو اكتب إجابتك"),
      },
      {
        key: "birthDate",
        label: tx(lang, "Wat is uw geboortedatum?", "What is your date of birth?", "ما هو تاريخ ميلادك؟"),
        type: "date",
        conditional: () => !known?.birthDate,
      },
    ],
  },

  // ===== FASE 2: GEBED =====
  {
    id: "gebed",
    title: tx(lang, "Uw gebed", "Your prayer", "الصلاة"),
    subtitle: tx(lang, "Het gebed is de pilaar van de dien.", "Prayer is the pillar of the deen.", "الصلاة عماد الدين."),
    questions: [
      {
        key: "prayer",
        label: tx(lang, "Hoeveel van de vijf dagelijkse gebeden bidt u?", "How many of the five daily prayers do you pray?", "كم من الصلوات الخمس تؤديها؟"),
        type: "select",
        options: [
          { value: "altijd_5", label: tx(lang, "Altijd alle 5", "Always all 5", "دائمًا الخمس") },
          { value: "meestal_4", label: tx(lang, "Meestal 4", "Usually 4", "غالبًا 4") },
          { value: "soms_3", label: tx(lang, "Soms 3", "Sometimes 3", "أحيانًا 3") },
          { value: "zelden_1_2", label: tx(lang, "Zelden (1-2)", "Rarely (1-2)", "نادرًا (1-2)") },
          { value: "nooit", label: tx(lang, "Geen", "None", "لا أصلي") },
        ],
      },
      {
        key: "fajr",
        label: tx(lang, "Bidt u salaat al-Fajr op tijd (voor zonsopgang)?", "Do you pray salaat al-Fajr on time (before sunrise)?", "هل تصلي الفجر في وقتها (قبل طلوع الشمس)؟"),
        type: "select",
        options: [
          { value: "altijd_op_tijd", label: tx(lang, "Altijd op tijd", "Always on time", "دائمًا في وقتها") },
          { value: "meestal_op_tijd", label: tx(lang, "Meestal op tijd", "Usually on time", "غالبًا في وقتها") },
          { value: "soms_op_tijd", label: tx(lang, "Soms op tijd", "Sometimes on time", "أحيانًا في وقتها") },
          { value: "zelden_op_tijd", label: tx(lang, "Zelden op tijd", "Rarely on time", "نادرًا في وقتها") },
          { value: "nooit", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "prayerKhushoo",
        label: tx(lang, "Beschrijf hoe u het gebed beleeft (feitelijk: wat doet u, wat voelt u, hoe concentreert u zich?)", "Describe how you experience prayer (factual: what do you do, what do you feel, how do you concentrate?)", "صف حالك في الصلاة (واقعيًّا: ماذا تفعل، ماذا تشعر، كيف تركّز؟)"),
        type: "text",
        hint: tx(lang, "Beschrijf in feiten, geen oordelen. Bijv: 'Ik bid snel, denk vaak aan andere zaken, lees korte soewar'", "Describe in facts, no judgments. E.g.: 'I pray quickly, often think of other things, read short surahs'", "صف بالوقائع دون أحكام. مثال: 'أصلي بسرعة، أفكر في أمور أخرى، أقرأ سورًا قصيرة'"),
      },
    ],
  },

  // ===== FASE 3: HIJAAB =====
  {
    id: "hijab",
    title: tx(lang, "Hijaab", "Hijab", "الحجاب"),
    subtitle: tx(lang, "Over de hijaab in uw gezin.", "About the hijab in your family.", "عن الحجاب في عائلتك."),
    questions: [
      {
        key: "hijab",
        label: tx(lang, "Draagt u de hijaab?", "Do you wear the hijab?", "هل ترتدين الحجاب؟"),
        type: "select",
        conditional: (p) => p.gender === "vrouw",
        options: [
          { value: "ja_volledig", label: tx(lang, "Ja, volledig", "Yes, fully", "نعم، كاملاً") },
          { value: "gedeeltelijk", label: tx(lang, "Gedeeltelijk", "Partially", "جزئيًا") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "hijabPartner",
        label: tx(lang, "Draagt uw vrouw de hijaab?", "Does your wife wear the hijab?", "هل ترتدي زوجتك الحجاب؟"),
        type: "select",
        conditional: (p) => p.gender === "man",
        options: [
          { value: "ja_volledig", label: tx(lang, "Ja, volledig", "Yes, fully", "نعم، كاملاً") },
          { value: "gedeeltelijk", label: tx(lang, "Gedeeltelijk", "Partially", "جزئيًا") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
    ],
  },

  // ===== FASE 4: KENNIS =====
  {
    id: "kennis",
    title: tx(lang, "Kennisvergaring", "Knowledge acquisition", "طلب العلم"),
    subtitle: tx(lang, "Over hoe u islamitische kennis vergaart.", "About how you acquire Islamic knowledge.", "كيف تطلب العلم الشرعي."),
    questions: [
      {
        key: "knowledgeSource",
        label: tx(lang, "Waar vergaart u islamitische kennis? (meerdere opties mogelijk)", "Where do you acquire Islamic knowledge? (multiple options possible)", "من أين تطلب العلم الشرعي؟ (يمكن اختيار عدة خيارات)"),
        type: "multiselect",
        options: [
          { value: "geleerden_direct", label: tx(lang, "Direct bij geleerden", "Directly from scholars", "مباشرة من العلماء") },
          { value: "studenten_van_kennis", label: tx(lang, "Bij studenten van kennis", "From students of knowledge", "من طلاب العلم") },
          { value: "moskee_lessen", label: tx(lang, "Moskee-lessen", "Mosque lessons", "دروس المسجد") },
          { value: "boeken", label: tx(lang, "Boeken", "Books", "الكتب") },
          { value: "online_lessen", label: tx(lang, "Online lessen", "Online lessons", "دروس عبر الإنترنت") },
          { value: "youtube", label: "YouTube" },
          { value: "sociale_media", label: tx(lang, "Sociale media", "Social media", "وسائل التواصل الاجتماعي") },
          { value: "geen", label: tx(lang, "Ik vergaar geen kennis", "I don't acquire knowledge", "لا أطلب العلم") },
        ],
      },
      {
        key: "obligatoryKnowledge",
        label: tx(lang, "Heeft u de verplichte islamitische kennis gestudeerd (aqiedah, fiqh al-ibadaat, tawhied)?", "Have you studied the obligatory Islamic knowledge (aqeedah, fiqh al-ibadaat, tawheed)?", "هل درست العلم الشرعي الواجب (العقيدة، فقه العبادات، التوحيد)؟"),
        type: "select",
        options: [
          { value: "ja_volledig", label: tx(lang, "Ja, volledig", "Yes, completely", "نعم، بالكامل") },
          { value: "ja_gedeeltelijk", label: tx(lang, "Ja, gedeeltelijk", "Yes, partially", "نعم، جزئيًا") },
          { value: "nee_maar_bezig", label: tx(lang, "Nee, maar ik ben ermee bezig", "No, but I'm working on it", "لا، لكنني بصدد ذلك") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "obligatoryKnowledgeDetails",
        label: tx(lang, "Welke verplichte kennis heeft u precies gestudeerd? (noem de onderwerpen)", "Which obligatory knowledge have you studied exactly? (name the topics)", "ما العلم الواجب الذي درسته تحديدًا؟ (اذكر المواضيع)"),
        type: "text",
        conditional: (p) => p.obligatoryKnowledge === "ja_volledig" || p.obligatoryKnowledge === "ja_gedeeltelijk",
        hint: tx(lang, "Bijv: 'Kitaab at-Tawhied, Fiqh as-Salaat, Usool ath-Thalaathah'", "E.g.: 'Kitaab at-Tawheed, Fiqh as-Salaat, Usool ath-Thalaathah'", "مثال: 'كتاب التوحيد، فقه الصلاة، الأصول الثلاثة'"),
      },
      {
        key: "knowledgeWithScholars",
        label: tx(lang, "Vergaart u kennis bij mensen met kennis (geleerden/studenten van kennis)?", "Do you acquire knowledge from people of knowledge (scholars/students of knowledge)?", "هل تتلقى العلم على أيدي أهل العلم (علماء أو طلاب علم)؟"),
        type: "select",
        options: [
          { value: "ja_regelmatig", label: tx(lang, "Ja, regelmatig", "Yes, regularly", "نعم، بانتظام") },
          { value: "ja_soms", label: tx(lang, "Ja, soms", "Yes, sometimes", "نعم، أحيانًا") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "knowledgeMedia",
        label: tx(lang, "Welke media/kanalen gebruikt u voor islamitische kennis? (noem specifiek)", "Which media/channels do you use for Islamic knowledge? (name specifically)", "ما الوسائل أو القنوات التي تستخدمها لطلب العلم الشرعي؟ (حدّد)"),
        type: "text",
        hint: tx(lang, "Bijv: 'Kanaal X op YouTube, boeken van sheikh Y, lessen in moskee Z'", "E.g.: 'Channel X on YouTube, books by sheikh Y, lessons in mosque Z'", "مثال: 'قناة X على يوتيوب، كتب الشيخ Y، دروس في مسجد Z'"),
      },
    ],
  },

  // ===== FASE 5: GEZINSKUNDE =====
  {
    id: "gezinskunde",
    title: tx(lang, "Gezinskunde", "Family science", "علم الأسرة (الجزينسكوندا)"),
    subtitle: tx(lang, "Over uw studie van islamitische gezinskunde.", "About your study of Islamic family science.", "عن دراستك لعلم الأسرة الإسلامي."),
    questions: [
      {
        key: "familyScience",
        label: tx(lang, "Heeft u islamitische gezinskunde gestudeerd?", "Have you studied Islamic family science?", "هل درست علم الأسرة الإسلامي (الجزينسكوندا)؟"),
        type: "select",
        options: [
          { value: "ja_volledig", label: tx(lang, "Ja, volledig afgerond", "Yes, fully completed", "نعم، أكملته بالكامل") },
          { value: "ja_gedeeltelijk", label: tx(lang, "Ja, gedeeltelijk", "Yes, partially", "نعم، جزئيًا") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "familyScienceWhere",
        label: tx(lang, "Waar heeft u gezinskunde gestudeerd?", "Where did you study family science?", "أين درست علم الأسرة؟"),
        type: "text",
        conditional: (p) => p.familyScience === "ja_volledig" || p.familyScience === "ja_gedeeltelijk",
        hint: tx(lang, "Bijv: 'Bij instituut X, online cursus Y, bij sheikh Z'", "E.g.: 'At institute X, online course Y, with sheikh Z'", "مثال: 'في معهد X، دورة عبر الإنترنت Y، عند الشيخ Z'"),
      },
      {
        key: "familyScienceDuration",
        label: tx(lang, "Hoe lang heeft u gezinskunde gestudeerd?", "How long did you study family science?", "كم استمرت دراستك لعلم الأسرة؟"),
        type: "text",
        conditional: (p) => p.familyScience === "ja_volledig" || p.familyScience === "ja_gedeeltelijk",
        hint: tx(lang, "Bijv: '2 jaar', '6 maanden', '1 cursus van 10 lessen'", "E.g.: '2 years', '6 months', '1 course of 10 lessons'", "مثال: 'سنتان'، '6 أشهر'، 'دورة واحدة من 10 دروس'"),
      },
    ],
  },

  // ===== FASE 6: PSYCHOLOOG / INSTANTIES =====
  {
    id: "instanties",
    title: tx(lang, "Psycholoog / Instanties", "Psychologist / Agencies", "الأخصائي النفسي / المؤسسات"),
    subtitle: tx(lang, "Over eventuele behandelingen.", "About any treatments.", "عن أي متابعة نفسية حالية أو سابقة."),
    questions: [
      {
        key: "psychologist",
        label: tx(lang, "Wordt u zelf momenteel behandeld door een psycholoog of andere instantie?", "Are you currently being treated by a psychologist or other agency?", "هل أنت حاليًا تحت متابعة أخصائي نفسي أو جهة أخرى؟"),
        type: "select",
        options: [
          { value: "ja_momenteel", label: tx(lang, "Ja, momenteel", "Yes, currently", "نعم، حاليًا") },
          { value: "ja_verleden", label: tx(lang, "Ja, in het verleden", "Yes, in the past", "نعم، في الماضي") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "psychologistDetails",
        label: tx(lang, "Door welke instantie en waarvoor wordt/werd u behandeld?", "By which agency and for what are/were you treated?", "عند أي جهة ولأي سبب تتابَع/تابعت؟"),
        type: "text",
        conditional: (p) => p.psychologist === "ja_momenteel" || p.psychologist === "ja_verleden",
      },
      {
        key: "psychologistChildren",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Worden uw kinderen momenteel behandeld door een psycholoog of andere instantie?", "Are your children currently being treated by a psychologist or other agency?", "هل أطفالك حاليًا تحت متابعة أخصائي نفسي أو جهة أخرى؟"),
        type: "select",
        options: [
          { value: "ja_momenteel", label: tx(lang, "Ja, momenteel", "Yes, currently", "نعم، حاليًا") },
          { value: "ja_verleden", label: tx(lang, "Ja, in het verleden", "Yes, in the past", "نعم، في الماضي") },
          { value: "nee", label: tx(lang, "Nee", "No", "لا") },
        ],
      },
      {
        key: "psychologistChildrenDetails",
        label: tx(lang, "Door welke instantie en waarvoor worden/werden uw kinderen behandeld?", "By which agency and for what are/were your children treated?", "عند أي جهة ولأي سبب يتابَع/تابع أطفالك؟"),
        type: "text",
        conditional: (p) => !p.hasNoChildren && (p.psychologistChildren === "ja_momenteel" || p.psychologistChildren === "ja_verleden"),
      },
    ],
  },

  // ===== FASE 7: ONDERWIJS =====
  {
    id: "onderwijs",
    title: tx(lang, "Onderwijs kinderen", "Children's education", "تعليم الأطفال"),
    subtitle: tx(lang, "Over de onderwijssituatie van uw kinderen.", "About the educational situation of your children.", "عن الوضع التعليمي لأطفالك."),
    // Entirely about the children's schooling — a user who declared "no
    // children" at the onboarding gate (hasNoChildren) has nothing to answer
    // here (e.g. "what education do your children follow?").
    conditional: (p) => !p.hasNoChildren,
    questions: [
      {
        key: "schoolType",
        label: tx(lang, "Wat voor onderwijs volgen uw kinderen?", "What type of education do your children follow?", "ما نوع التعليم الذي يتلقاه أطفالك؟"),
        type: "select",
        options: [
          { value: "regulier", label: tx(lang, "Regulier onderwijs", "Regular education", "تعليم نظامي") },
          { value: "thuisonderwijs", label: tx(lang, "Thuisonderwijs", "Homeschooling", "تعليم منزلي") },
          { value: "islamitisch", label: tx(lang, "Islamitisch onderwijs", "Islamic education", "تعليم إسلامي") },
          { value: "combinatie", label: tx(lang, "Combinatie", "Combination", "مزيج") },
          { value: "anders", label: tx(lang, "Anders", "Other", "أخرى") },
        ],
      },
      {
        key: "schoolTypeDetails",
        label: tx(lang, "Beschrijf de onderwijssituatie nader (welke school, welk systeem, waarom deze keuze?)", "Describe the educational situation further (which school, which system, why this choice?)", "صف الوضع التعليمي بالتفصيل (أي مدرسة، أي نظام، لماذا هذا الاختيار؟)"),
        type: "text",
        conditional: (p) => p.schoolType !== "thuisonderwijs",
        hint: tx(lang, "Bijv: 'Reguliere basisschool in wijk X, gekozen vanwege nabijheid'", "E.g.: 'Regular primary school in neighborhood X, chosen for proximity'", "مثال: 'مدرسة ابتدائية نظامية في حي X، اخترناها لقربها'"),
      },
      {
        key: "teacherContact",
        label: tx(lang, "Hoe vaak heeft u contact met de leraren van uw kinderen?", "How often do you have contact with your children's teachers?", "كم مرة تتواصل مع معلمي أطفالك؟"),
        type: "select",
        conditional: (p) => p.schoolType !== "thuisonderwijs",
        options: [
          { value: "wekelijks", label: tx(lang, "Wekelijks", "Weekly", "أسبوعيًا") },
          { value: "maandelijks", label: tx(lang, "Maandelijks", "Monthly", "شهريًا") },
          { value: "per_kwartaal", label: tx(lang, "Per kwartaal", "Quarterly", "كل ثلاثة أشهر") },
          { value: "zelden", label: tx(lang, "Zelden", "Rarely", "نادرًا") },
          { value: "nooit", label: tx(lang, "Nooit", "Never", "أبدًا") },
        ],
      },
      {
        key: "teacherContactDetails",
        label: tx(lang, "Hoe verloopt het contact met de leraren? Wat bespreekt u?", "How does the contact with teachers go? What do you discuss?", "كيف يجري التواصل مع المعلمين؟ ماذا تناقشون؟"),
        type: "text",
        conditional: (p) => p.schoolType !== "thuisonderwijs" && p.teacherContact !== "nooit",
        hint: tx(lang, "Bijv: 'Ik spreek de juf maandelijks over voortgang, gedrag en sociaal contact'", "E.g.: 'I speak to the teacher monthly about progress, behavior and social contact'", "مثال: 'أتحدث مع المعلمة شهريًا عن التقدم والسلوك والتواصل الاجتماعي'"),
      },
    ],
  },

  // ===== FASE 8: DENKWIJZE =====
  {
    id: "denken",
    title: tx(lang, "Uw denkwijze", "Your way of thinking", "طريقة تفكيرك"),
    subtitle: tx(lang, "Beschrijf in feiten hoe u denkt. Geen oordelen, alleen feiten.", "Describe in facts how you think. No judgments, only facts.", "صف بالوقائع كيف تفكر. دون أحكام، فقط وقائع."),
    questions: [
      {
        key: "thinkingAboutAllaah",
        label: tx(lang, "Hoe denkt u over uw band met Allaah?", "How do you think about your bond with Allaah?", "كيف تفكر في علاقتك بالله؟"),
        type: "hybrid",
        options: [
          { value: "sterk_bewust", label: tx(lang, "Sterk bewust van Allaah in alles", "Strongly aware of Allaah in everything", "وعي قوي بالله في كل شيء") },
          { value: "bij_gebed", label: tx(lang, "Vooral bij het gebed", "Mainly during prayer", "خاصة أثناء الصلاة") },
          { value: "soms_bewust", label: tx(lang, "Soms bewust, soms niet", "Sometimes aware, sometimes not", "أحيانًا واعٍ، وأحيانًا لا") },
          { value: "weinig_bewust", label: tx(lang, "Weinig bewust in het dagelijks leven", "Little awareness in daily life", "وعي قليل في الحياة اليومية") },
          { value: "wil_verbeteren", label: tx(lang, "Ik wil dit verbeteren", "I want to improve this", "أريد تحسين هذا") },
        ],
        hint,
      },
      {
        key: "thinkingAboutPartner",
        label: tx(lang, "Hoe denkt u over uw band met uw partner?", "How do you think about your bond with your partner?", gAr("كيف تقيّم علاقتك بزوجتك؟", "كيف تقيّمين علاقتك بزوجك؟", "كيف تقيّم علاقتك بزوجك/زوجتك؟")),
        type: "hybrid",
        conditional: (p) => p.maritalStatus === "getrouwd",
        options: [
          { value: "goed_harmonieus", label: tx(lang, "Goed en harmonieus", "Good and harmonious", "جيدة ومتناغمة") },
          { value: "goed_soms_spanning", label: tx(lang, "Goed maar soms spanning", "Good but sometimes tension", "جيدة لكن أحيانًا توتر") },
          { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغيرة") },
          { value: "moeilijk", label: tx(lang, "Moeilijk", "Difficult", "صعبة") },
          { value: "geen_communicatie", label: tx(lang, "Weinig/geen communicatie", "Little/no communication", "تواصل قليل/معدوم") },
        ],
        hint,
      },
      {
        key: "thinkingAboutChildren",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Hoe denkt u over uw band met uw kinderen?", "How do you think about your bond with your children?", "كيف تفكر في علاقتك بأطفالك؟"),
        type: "hybrid",
        options: [
          { value: "sterk_met_allen", label: tx(lang, "Sterke band met alle kinderen", "Strong bond with all children", "علاقة قوية مع جميع الأطفال") },
          { value: "sterk_sommigen", label: tx(lang, "Sterk met sommigen, minder met anderen", "Strong with some, less with others", "قوية مع بعضهم، أقل مع آخرين") },
          { value: "wisselend", label: tx(lang, "Wisselend per dag", "Varying per day", "متغيرة حسب اليوم") },
          { value: "afstandelijk", label: tx(lang, "Afstandelijk", "Distant", "بعيدة") },
          { value: "wil_verbeteren", label: tx(lang, "Ik wil dit verbeteren", "I want to improve this", "أريد تحسين هذا") },
        ],
        hint,
      },
      {
        key: "thinkingAboutParenting",
        label: tx(lang, "Hoe denkt u over opvoeding in het algemeen?", "How do you think about parenting in general?", "كيف تفكر في التربية بشكل عام؟"),
        type: "hybrid",
        options: [
          { value: "voorbeeld_geven", label: tx(lang, "Begint bij het goede voorbeeld", "Starts with setting a good example", "تبدأ بالقدوة الحسنة") },
          { value: "kennis_overdragen", label: tx(lang, "Kennis en waarden overdragen", "Transferring knowledge and values", "نقل العلم والقيم") },
          { value: "grenzen_stellen", label: tx(lang, "Grenzen stellen is het belangrijkst", "Setting boundaries is most important", "وضع الحدود هو الأهم") },
          { value: "liefde_basis", label: tx(lang, "Liefde is de basis", "Love is the foundation", "الحب هو الأساس") },
          { value: "moeilijk_weet_niet", label: tx(lang, "Ik vind het moeilijk / weet niet", "I find it difficult / don't know", "أجدها صعبة / لا أعرف") },
        ],
        hint,
      },
      {
        key: "thinkingMindsets",
        label: tx(lang, "Welke overtuigingen heeft u over opvoeding?", "What beliefs do you have about parenting?", "ما هي قناعاتك حول التربية؟"),
        type: "hybrid",
        options: [
          { value: "gehoorzaamheid", label: tx(lang, "Kinderen moeten gehoorzamen", "Children must obey", "يجب أن يطيع الأطفال") },
          { value: "kennis_basis", label: tx(lang, "Kennis is de basis", "Knowledge is the foundation", "العلم هو الأساس") },
          { value: "straffen_werkt_niet", label: tx(lang, "Straffen werkt niet", "Punishment doesn't work", "العقاب لا يجدي") },
          { value: "liefde_geduld", label: tx(lang, "Liefde en geduld zijn het belangrijkst", "Love and patience are most important", "الحب والصبر هما الأهم") },
          { value: "islamitisch_kader", label: tx(lang, "Alles binnen islamitisch kader", "Everything within Islamic framework", "كل شيء ضمن الإطار الإسلامي") },
        ],
        hint,
      },
    ],
  },

  // ===== FASE 9: VOELWIJZE =====
  {
    id: "voelen",
    title: tx(lang, "Uw voelwijze", "Your way of feeling", "طريقة شعورك"),
    subtitle: tx(lang, "Beschrijf in feiten wat u voelt. Geen oordelen, alleen feiten.", "Describe in facts what you feel. No judgments, only facts.", "صف بالوقائع ما تشعر به. دون أحكام، فقط وقائع."),
    questions: [
      {
        key: "feelingAboutAllaah",
        label: tx(lang, "Wat voelt u bij het gedenken van Allaah en bij het gebed?", "What do you feel when remembering Allaah and during prayer?", "ماذا تشعر عند ذكر الله وأثناء الصلاة؟"),
        type: "hybrid",
        options: [
          { value: "rust_vrede", label: tx(lang, "Rust en innerlijke vrede", "Peace and inner tranquility", "سكينة وطمأنينة داخلية") },
          { value: "hoop_dankbaarheid", label: tx(lang, "Hoop en dankbaarheid", "Hope and gratitude", "أمل وشكر") },
          { value: "schuldgevoel", label: tx(lang, "Schuldgevoel dat ik niet genoeg doe", "Guilt that I'm not doing enough", "شعور بالذنب أنني لا أفعل ما يكفي") },
          { value: "afstand", label: tx(lang, "Ik voel afstand", "I feel distance", "أشعر بالبعد") },
          { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغير") },
        ],
        hint,
      },
      {
        key: "feelingAboutPartner",
        label: tx(lang, "Wat voelt u bij uw partner?", "What do you feel towards your partner?", gAr("ماذا تشعر تجاه زوجتك؟", "ماذا تشعرين تجاه زوجك؟", "ماذا تشعر تجاه زوجك/زوجتك؟")),
        type: "hybrid",
        conditional: (p) => p.maritalStatus === "getrouwd",
        options: [
          { value: "liefde_steun", label: tx(lang, "Liefde en steun", "Love and support", "حب ودعم") },
          { value: "liefde_frustratie", label: tx(lang, "Liefde maar ook frustratie", "Love but also frustration", "حب ولكن أيضًا إحباط") },
          { value: "neutraal", label: tx(lang, "Neutraal", "Neutral", "محايد") },
          { value: "spanning", label: tx(lang, "Spanning en onenigheid", "Tension and disagreement", "توتر وخلاف") },
          { value: "eenzaamheid", label: tx(lang, "Eenzaamheid in het huwelijk", "Loneliness in the marriage", "وحدة في الزواج") },
        ],
        hint,
      },
      {
        key: "feelingAboutChildren",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Wat voelt u bij uw kinderen?", "What do you feel towards your children?", "ماذا تشعر تجاه أطفالك؟"),
        type: "hybrid",
        options: [
          { value: "trots_liefde", label: tx(lang, "Trots en liefde", "Pride and love", "فخر وحب") },
          { value: "zorgen", label: tx(lang, "Zorgen over hun toekomst", "Worries about their future", "قلق على مستقبلهم") },
          { value: "overweldigd", label: tx(lang, "Overweldigd", "Overwhelmed", "مرهق") },
          { value: "machteloos", label: tx(lang, "Machteloos bij problemen", "Powerless with problems", "عاجز أمام المشاكل") },
          { value: "blij_dankbaar", label: tx(lang, "Blij en dankbaar", "Happy and grateful", "سعيد وممتن") },
        ],
        hint,
      },
      {
        key: "feelingAboutParenting",
        label: tx(lang, "Wat voelt u bij het opvoeden?", "What do you feel about parenting?", "ماذا تشعر تجاه التربية؟"),
        type: "hybrid",
        options: [
          { value: "voldoening", label: tx(lang, "Voldoening en vreugde", "Satisfaction and joy", "رضا وسعادة") },
          { value: "overweldigd", label: tx(lang, "Overweldigd", "Overwhelmed", "مرهق") },
          { value: "onzeker", label: tx(lang, "Onzeker of ik het goed doe", "Unsure if I'm doing it right", gAr("غير متأكد إن كنت أفعل الصواب", "غير متأكدة إن كنت أفعل الصواب", "غير متأكد إن كنت أفعل الصواب")) },
          { value: "moe", label: tx(lang, "Vermoeid", "Tired", gAr("متعب", "متعبة", "متعب")) },
          { value: "wisselend", label: tx(lang, "Wisselend per dag", "Varying per day", "متغير حسب اليوم") },
        ],
        hint,
      },
      {
        key: "feelingChallenges",
        label: tx(lang, "Welke gevoelens ervaart u bij opvoeduitdagingen?", "What feelings do you experience with parenting challenges?", "ما المشاعر التي تختبرها عند تحديات التربية؟"),
        type: "hybrid",
        options: [
          { value: "boosheid", label: tx(lang, "Boosheid", "Anger", "غضب") },
          { value: "machteloosheid", label: tx(lang, "Machteloosheid", "Powerlessness", "عجز") },
          { value: "verdriet", label: tx(lang, "Verdriet", "Sadness", "حزن") },
          { value: "geduld", label: tx(lang, "Geduld (alhamdulillaah)", "Patience (alhamdulillaah)", "صبر (الحمد لله)") },
          { value: "vastberadenheid", label: tx(lang, "Vastberadenheid om te verbeteren", "Determination to improve", "عزيمة على التحسين") },
        ],
        hint,
      },
    ],
  },

  // ===== FASE 10: SPREEKWIJZE =====
  {
    id: "spreken",
    title: tx(lang, "Uw spreekwijze", "Your way of speaking", "طريقة كلامك"),
    subtitle: tx(lang, "Beschrijf in feiten hoe u spreekt. Geen oordelen, alleen feiten.", "Describe in facts how you speak. No judgments, only facts.", "صف بالوقائع كيف تتكلم. دون أحكام، فقط وقائع."),
    questions: [
      {
        key: "speakingToAllaah",
        label: tx(lang, "Hoe spreekt u tot Allaah (du'aa, dhikr)?", "How do you speak to Allaah (du'aa, dhikr)?", "كيف حالك مع الدعاء والذكر؟"),
        type: "hybrid",
        options: [
          { value: "regelmatig_duaa_dhikr", label: tx(lang, "Regelmatig du'aa en dhikr", "Regular du'aa and dhikr", "دعاء وذكر منتظم") },
          { value: "alleen_na_gebed", label: tx(lang, "Alleen na het gebed", "Only after prayer", "فقط بعد الصلاة") },
          { value: "soms", label: tx(lang, "Soms, niet consequent", "Sometimes, not consistent", "أحيانًا، غير منتظم") },
          { value: "zelden", label: tx(lang, "Zelden", "Rarely", "نادرًا") },
          { value: "wil_verbeteren", label: tx(lang, "Ik wil dit verbeteren", "I want to improve this", "أريد تحسين هذا") },
        ],
        hint,
      },
      {
        key: "speakingToPartner",
        label: tx(lang, "Hoe spreekt u met uw partner over de kinderen?", "How do you speak with your partner about the children?", gAr("كيف تتحدث مع زوجتك عن الأطفال؟", "كيف تتحدثين مع زوجك عن الأطفال؟", "كيف تتحدث مع زوجك/زوجتك عن الأطفال؟")),
        type: "hybrid",
        conditional: (p) => !p.hasNoChildren && p.maritalStatus === "getrouwd",
        options: [
          { value: "goed_overleg", label: tx(lang, "Goed overleg, respectvol", "Good consultation, respectful", "تشاور جيد، باحترام") },
          { value: "kort_zakelijk", label: tx(lang, "Kort en zakelijk", "Short and businesslike", "قصير وعملي") },
          { value: "soms_ruzie", label: tx(lang, "Soms ruzie", "Sometimes arguments", "أحيانًا خلاف") },
          { value: "weinig_communicatie", label: tx(lang, "Weinig communicatie", "Little communication", "تواصل قليل") },
          { value: "vermijdend", label: tx(lang, "Vermijdend", "Avoidant", "تجنبي") },
        ],
        hint,
      },
      {
        key: "speakingToChildren",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Hoe spreekt u met uw kinderen?", "How do you speak with your children?", "كيف تتحدث مع أطفالك؟"),
        type: "hybrid",
        options: [
          { value: "geduldig_uitleggen", label: tx(lang, "Geduldig uitleggen", "Patiently explaining", "شرح بصبر") },
          { value: "soms_schreeuwen", label: tx(lang, "Soms schreeuwen", "Sometimes shouting", "أحيانًا صراخ") },
          { value: "streng_duidelijk", label: tx(lang, "Streng maar duidelijk", "Strict but clear", "صارم لكن واضح") },
          { value: "wisselend", label: tx(lang, "Wisselend per situatie", "Varying per situation", "متغير حسب الموقف") },
          { value: "weinig_praten", label: tx(lang, "Weinig praten", "Little talking", "قليل الكلام") },
        ],
        hint,
      },
      {
        key: "speakingWhenAngry",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Hoe spreekt u wanneer u boos bent op uw kinderen?", "How do you speak when you are angry at your children?", "كيف تتكلم حين تغضب على أطفالك؟"),
        type: "hybrid",
        options: [
          { value: "verhef_stem", label: tx(lang, "Ik verhef mijn stem", "I raise my voice", "أرفع صوتي") },
          { value: "harde_woorden", label: tx(lang, "Harde woorden", "Harsh words", "كلمات قاسية") },
          { value: "trek_terug", label: tx(lang, "Ik trek me terug", "I withdraw", "أنسحب") },
          { value: "probeer_kalm", label: tx(lang, "Ik probeer kalm te blijven", "I try to stay calm", "أحاول البقاء هادئًا") },
          { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغير") },
        ],
        hint,
      },
      {
        key: "speakingWhenCorrecting",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Hoe spreekt u wanneer u uw kinderen corrigeert?", "How do you speak when correcting your children?", "كيف تتكلم حين تصحّح لأطفالك؟"),
        type: "hybrid",
        options: [
          { value: "uitleggen_waarom", label: tx(lang, "Ik leg uit waarom het fout is", "I explain why it's wrong", "أشرح لماذا هذا خطأ") },
          { value: "dreigen_straf", label: tx(lang, "Ik dreig met straf", "I threaten with punishment", "أهدد بالعقاب") },
          { value: "direct_straf", label: tx(lang, "Direct straffen", "Direct punishment", "عقاب مباشر") },
          { value: "rustig_herhalen", label: tx(lang, "Rustig herhalen", "Calmly repeating", "تكرار بهدوء") },
          { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغير") },
        ],
        hint,
      },
    ],
  },

  // ===== FASE 11: DOEWIJZE =====
  {
    id: "doen",
    title: tx(lang, "Uw werkwijze / doewijze", "Your way of acting", "طريقة عملك"),
    subtitle: tx(lang, "Beschrijf in feiten wat u doet. Geen oordelen, alleen feiten.", "Describe in facts what you do. No judgments, only facts.", "صف بالوقائع ماذا تفعل. دون أحكام، فقط وقائع."),
    questions: [
      {
        key: "doingIbadah",
        label: tx(lang, "Welke ibadaat verricht u dagelijks?", "Which acts of worship do you perform daily?", "ما العبادات التي تؤديها يوميًا؟"),
        type: "hybrid",
        options: [
          { value: "5_gebeden_quran_dhikr", label: tx(lang, "5 gebeden + Qur'aan + dhikr", "5 prayers + Qur'aan + dhikr", "5 صلوات + قرآن + ذكر") },
          { value: "5_gebeden_soms_extra", label: tx(lang, "5 gebeden + soms extra", "5 prayers + sometimes extra", "5 صلوات + أحيانًا إضافي") },
          { value: "alleen_gebeden", label: tx(lang, "Alleen de gebeden", "Only the prayers", "الصلوات فقط") },
          { value: "onregelmatig", label: tx(lang, "Onregelmatig", "Irregular", "غير منتظم") },
          { value: "wil_verbeteren", label: tx(lang, "Ik wil dit verbeteren", "I want to improve this", "أريد تحسين هذا") },
        ],
        hint,
      },
      {
        key: "doingWithPartner",
        label: tx(lang, "Hoe handelt u met uw partner in het dagelijks leven?", "How do you act with your partner in daily life?", gAr("كيف تتعامل مع زوجتك في الحياة اليومية؟", "كيف تتعاملين مع زوجك في الحياة اليومية؟", "كيف تتعامل مع زوجك/زوجتك في الحياة اليومية؟")),
        type: "hybrid",
        conditional: (p) => p.maritalStatus === "getrouwd",
        options: [
          { value: "samen_taken_verdelen", label: tx(lang, "Samen taken verdelen", "Divide tasks together", "تقسيم المهام معًا") },
          { value: "ieder_apart", label: tx(lang, "Ieder doet zijn eigen ding", "Each does their own thing", "كل واحد يفعل شيئه") },
          { value: "goed_samenwerken", label: tx(lang, "Goed samenwerken", "Good cooperation", "تعاون جيد") },
          { value: "weinig_samen", label: tx(lang, "Weinig samen", "Little together", "قليل معًا") },
          { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغير") },
        ],
        hint,
      },
      {
        key: "doingWithChildren",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Hoe handelt u met uw kinderen in het dagelijks leven?", "How do you act with your children in daily life?", "كيف تتعامل مع أطفالك في الحياة اليومية؟"),
        type: "hybrid",
        options: [
          { value: "actief_betrokken", label: tx(lang, "Actief betrokken (spelen, helpen, begeleiden)", "Actively involved (playing, helping, guiding)", "مشارك بفعالية (لعب، مساعدة، توجيه)") },
          { value: "praktisch", label: tx(lang, "Praktisch (school, eten, slapen)", "Practical (school, food, sleep)", "عملي (مدرسة، طعام، نوم)") },
          { value: "weinig_tijd", label: tx(lang, "Weinig tijd door werk", "Little time due to work", "وقت قليل بسبب العمل") },
          { value: "wisselend", label: tx(lang, "Wisselend per dag", "Varying per day", "متغير حسب اليوم") },
          { value: "wil_meer", label: tx(lang, "Ik wil meer doen", "I want to do more", "أريد فعل المزيد") },
        ],
        hint,
      },
      {
        key: "doingWhenProblem",
        label: tx(lang, "Wat doet u concreet bij een opvoedprobleem?", "What do you concretely do with a parenting problem?", "ماذا تفعل تحديدًا حين تواجه مشكلة تربوية؟"),
        type: "hybrid",
        options: [
          { value: "praten_uitleggen", label: tx(lang, "Praten en uitleggen", "Talk and explain", "التحدث والشرح") },
          { value: "straffen", label: tx(lang, "Straffen", "Punish", "العقاب") },
          { value: "hulp_zoeken", label: tx(lang, "Hulp zoeken", "Seek help", "طلب المساعدة") },
          { value: "negeren", label: tx(lang, "Negeren / afwachten", "Ignore / wait", "التجاهل / الانتظار") },
          { value: "wisselend", label: tx(lang, "Wisselend per situatie", "Varying per situation", "متغير حسب الموقف") },
        ],
        hint,
      },
      {
        key: "doingDailyRoutine",
        conditional: (p) => !p.hasNoChildren,
        label: tx(lang, "Hoe ziet uw dagelijkse routine eruit met de kinderen?", "What does your daily routine with the children look like?", "كيف يبدو روتينك اليومي مع الأطفال؟"),
        type: "hybrid",
        options: [
          { value: "gestructureerd", label: tx(lang, "Gestructureerd met vaste tijden", "Structured with fixed times", "منظم بأوقات ثابتة") },
          { value: "redelijk_vast", label: tx(lang, "Redelijk vast maar flexibel", "Fairly fixed but flexible", "ثابت نسبيًا لكن مرن") },
          { value: "chaotisch", label: tx(lang, "Chaotisch / geen vaste structuur", "Chaotic / no fixed structure", "فوضوي / بلا نظام ثابت") },
          { value: "wisselend", label: tx(lang, "Wisselend per dag", "Varying per day", "متغير حسب اليوم") },
          { value: "wil_verbeteren", label: tx(lang, "Ik wil meer structuur", "I want more structure", "أريد المزيد من التنظيم") },
        ],
        hint,
      },
    ],
  },

  // ===== FASE 12: AFFINITEITEN =====
  {
    id: "affiniteiten",
    title: tx(lang, "Uw affiniteiten en eigenschappen", "Your affinities and qualities", "ميولك وصفاتك"),
    subtitle: tx(lang, "Dit helpt ons om uw opvoedadviezen persoonlijk te maken.", "This helps us personalize your parenting advice.", "هذا يساعدنا على تخصيص النصائح التربوية لك."),
    questions: [
      {
        key: "parentAffinities",
        label: tx(lang, "Waar bent u goed in? Wat zijn uw talenten?", "What are you good at? What are your talents?", "ما الذي تُجيده؟ ما مواهبك؟"),
        type: "hybrid",
        options: [
          { value: "organiseren", label: tx(lang, "Organiseren", "Organizing", "التنظيم") },
          { value: "luisteren", label: tx(lang, "Luisteren", "Listening", "الاستماع") },
          { value: "creatief", label: tx(lang, "Creatief zijn", "Being creative", "الإبداع") },
          { value: "koken", label: tx(lang, "Koken", "Cooking", "الطبخ") },
          { value: "geduld", label: tx(lang, "Geduld", "Patience", "الصبر") },
        ],
        hint,
      },
      {
        key: "parentHobbies",
        label: tx(lang, "Wat zijn uw hobby's?", "What are your hobbies?", "ما هي هواياتك؟"),
        type: "hybrid",
        options: [
          { value: "lezen", label: tx(lang, "Lezen", "Reading", "القراءة") },
          { value: "sporten", label: tx(lang, "Sporten", "Sports", "الرياضة") },
          { value: "koken", label: tx(lang, "Koken", "Cooking", "الطبخ") },
          { value: "handwerken", label: tx(lang, "Handwerken", "Crafts", "الأشغال اليدوية") },
          { value: "quran_studie", label: tx(lang, "Qur'aan/studie", "Qur'aan/study", "القرآن/الدراسة") },
        ],
        hint,
      },
      {
        key: "parentStrengths",
        label: tx(lang, "Wat zijn uw sterke punten in de opvoeding?", "What are your strengths in parenting?", "ما هي نقاط قوتك في التربية؟"),
        type: "hybrid",
        options: [
          { value: "geduld", label: tx(lang, "Geduld", "Patience", "الصبر") },
          { value: "consequent", label: tx(lang, "Consequent zijn", "Being consistent", "الثبات") },
          { value: "liefdevol", label: tx(lang, "Liefdevol", "Loving", "الحنان") },
          { value: "kennis_overdragen", label: tx(lang, "Kennis overdragen", "Transferring knowledge", "نقل العلم") },
          { value: "structuur", label: tx(lang, "Structuur bieden", "Providing structure", "توفير التنظيم") },
        ],
        hint,
      },
      {
        key: "parentWeaknesses",
        label: tx(lang, "Wat zijn uw zwakke punten in de opvoeding?", "What are your weaknesses in parenting?", "ما هي نقاط ضعفك في التربية؟"),
        type: "hybrid",
        options: [
          { value: "snel_boos", label: tx(lang, "Snel boos", "Quick to anger", gAr("سريع الغضب", "سريعة الغضب", "سريع الغضب")) },
          { value: "inconsequent", label: tx(lang, "Inconsequent", "Inconsistent", gAr("غير ثابت", "غير ثابتة", "غير ثابت")) },
          { value: "te_weinig_tijd", label: tx(lang, "Te weinig tijd", "Too little time", "وقت قليل جدًا") },
          { value: "te_streng", label: tx(lang, "Te streng", "Too strict", gAr("صارم جدًا", "صارمة جدًا", "صارم جدًا")) },
          { value: "te_zacht", label: tx(lang, "Te zacht", "Too soft", gAr("لين جدًا", "لينة جدًا", "لين جدًا")) },
        ],
        hint,
      },
    ],
  },

  // ===== FASE 13: BAND MET PARTNER =====
  {
    id: "band",
    title: tx(lang, "Band met uw partner", "Bond with your partner", gAr("العلاقة مع زوجتك", "العلاقة مع زوجك", "العلاقة مع الزوج/الزوجة")),
    subtitle: tx(lang, "Over de samenwerking in de opvoeding.", "About cooperation in parenting.", "عن التعاون بينكما في التربية."),
    conditional: (p) => p.maritalStatus === "getrouwd",
    questions: [
      {
        key: "partnerRelationQuality",
        label: tx(lang, "Hoe is de band met uw partner?", "How is the bond with your partner?", gAr("كيف هي علاقتك بزوجتك؟", "كيف هي علاقتك بزوجك؟", "كيف هي علاقتك بزوجك/زوجتك؟")),
        type: "hybrid",
        options: [
          { value: "goed_sterk", label: tx(lang, "Goed en sterk", "Good and strong", "جيدة وقوية") },
          { value: "goed_weinig_tijd", label: tx(lang, "Goed maar weinig tijd samen", "Good but little time together", "جيدة لكن وقت قليل معًا") },
          { value: "spanningen", label: tx(lang, "Regelmatig spanningen", "Regular tensions", "توترات منتظمة") },
          { value: "moeilijk", label: tx(lang, "Moeilijk", "Difficult", "صعبة") },
          { value: "wisselend", label: tx(lang, "Wisselend", "Varying", "متغيرة") },
        ],
        hint,
      },
      {
        key: "partnerParentingAgreement",
        label: tx(lang, "Zijn jullie het eens over de opvoeding?", "Do you agree on parenting?", "هل أنتما متفقان على منهج التربية؟"),
        type: "hybrid",
        options: [
          { value: "volledig_eens", label: tx(lang, "Volledig eens", "Fully agree", "متفقان تمامًا") },
          { value: "basis_eens", label: tx(lang, "Over de basis eens, details niet", "Agree on basics, not details", "متفقان على الأساسيات، ليس التفاصيل") },
          { value: "vaak_oneens", label: tx(lang, "Vaak oneens", "Often disagree", "غالبًا مختلفان") },
          { value: "niet_besproken", label: tx(lang, "Niet besproken", "Not discussed", "لم نناقش الأمر") },
          { value: "conflict", label: tx(lang, "Regelmatig conflict hierover", "Regular conflict about this", "خلاف منتظم حول هذا") },
        ],
        hint,
      },
      {
        key: "partnerCommunication",
        label: tx(lang, "Hoe communiceren jullie over de kinderen?", "How do you communicate about the children?", "كيف تتشاوران بشأن الأطفال؟"),
        type: "hybrid",
        options: [
          { value: "dagelijks_overleg", label: tx(lang, "Dagelijks overleg", "Daily consultation", "تشاور يومي") },
          { value: "regelmatig", label: tx(lang, "Regelmatig (paar keer per week)", "Regularly (few times a week)", "بانتظام (عدة مرات أسبوعيًا)") },
          { value: "alleen_problemen", label: tx(lang, "Alleen bij problemen", "Only with problems", "فقط عند المشاكل") },
          { value: "zelden", label: tx(lang, "Zelden", "Rarely", "نادرًا") },
          { value: "niet", label: tx(lang, "Niet / ieder apart", "Not / each separately", "لا / كل على حدة") },
        ],
        hint,
      },
    ],
  },
];
}

// ============ WIZARD COMPONENT ============

export default function ParentProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, updateParentProfile, completeParentProfile, completeOnboarding } = useAppState();
  const { language } = useI18n();
  const lang: Lang = language as Lang;
  const isRTL = lang === "ar";
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Record<string, number>>({});

  const [profile, setProfile] = useState<ParentProfile>(state.parentProfile);
  // Snapshot at mount: skip gender/marital ONLY if they were already answered
  // before the wizard (prefilled from the short flow). Referencing live state
  // in their `conditional` made an in-wizard answer hide its own question.
  const knownAtMount = useRef({
    gender: !!state.parentProfile.gender,
    maritalStatus: !!state.parentProfile.maritalStatus,
    birthDate: !!state.parentProfile.birthDate,
  });

  const PHASES = useMemo(() => getPHASES(lang, profile.gender, knownAtMount.current), [lang, profile.gender]);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [showValidation, setShowValidation] = useState(false);

  // Get visible phases based on profile answers
  const visiblePhases = useMemo(() => {
    return PHASES.filter((phase) => {
      if (phase.conditional) {
        return phase.conditional(profile);
      }
      return true;
    });
  }, [profile, PHASES]);

  // Get current phase
  const currentPhase = visiblePhases[currentPhaseIndex] || visiblePhases[0];

  // Get visible questions for current phase
  const visibleQuestions = useMemo(() => {
    if (!currentPhase) return [];
    return currentPhase.questions.filter((q) => {
      if (q.conditional) {
        return q.conditional(profile);
      }
      return true;
    });
  }, [currentPhase, profile]);

  // Validate current phase
  const validateCurrentPhase = useCallback((): string[] => {
    const unanswered: string[] = [];
    for (const q of visibleQuestions) {
      const key = q.key as keyof ParentProfile;
      const value = profile[key];
      if (q.type === "multiselect") {
        if (!Array.isArray(value) || (value as string[]).length === 0) {
          unanswered.push(q.key);
        }
      } else if (q.type === "text") {
        if (!value || (value as string).trim() === "") {
          unanswered.push(q.key);
        }
      } else {
        if (!value || value === "") {
          unanswered.push(q.key);
        }
      }
    }
    return unanswered;
  }, [profile, visibleQuestions]);

  const scrollToFirstError = (firstErrorKey: string) => {
    const yPos = fieldPositions.current[firstErrorKey];
    if (yPos !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, yPos - 100), animated: true });
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleNext = async () => {
    const unanswered = validateCurrentPhase();
    if (unanswered.length > 0) {
      setErrors(new Set(unanswered));
      setShowValidation(true);
      scrollToFirstError(unanswered[0]);
      Alert.alert(
        tx(lang, "Niet alle vragen beantwoord", "Not all questions answered", "لم تُجَب جميع الأسئلة"),
        tx(lang,
          `Er ${unanswered.length === 1 ? "is" : "zijn"} nog ${unanswered.length} ${unanswered.length === 1 ? "vraag" : "vragen"} niet beantwoord. U kunt niet doorgaan zonder alle vragen te beantwoorden.`,
          `There ${unanswered.length === 1 ? "is" : "are"} still ${unanswered.length} ${unanswered.length === 1 ? "question" : "questions"} unanswered. You cannot proceed without answering all questions.`,
          `لا يزال هناك ${unanswered.length} ${unanswered.length === 1 ? "سؤال" : "أسئلة"} بدون إجابة. لا يمكنك المتابعة دون الإجابة على جميع الأسئلة.`
        )
      );
      return;
    }

    setErrors(new Set());
    setShowValidation(false);

    // Save partial progress
    await updateParentProfile(profile);

    if (currentPhaseIndex < visiblePhases.length - 1) {
      setCurrentPhaseIndex(currentPhaseIndex + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      fieldPositions.current = {};
    } else {
      // Final phase completed
      await updateParentProfile({ ...profile, completed: true });
      await completeParentProfile();
      if (!state.onboardingCompleted) {
        await completeOnboarding();
      }
      router.replace("/(tabs)");
    }
  };

  const handlePrevious = () => {
    if (currentPhaseIndex > 0) {
      setCurrentPhaseIndex(currentPhaseIndex - 1);
      setErrors(new Set());
      setShowValidation(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      fieldPositions.current = {};
    }
  };

  const handleGoToFirstError = () => {
    const unanswered = validateCurrentPhase();
    if (unanswered.length > 0) {
      scrollToFirstError(unanswered[0]);
    }
  };

  const handleFieldLayout = (key: string, event: LayoutChangeEvent) => {
    fieldPositions.current[key] = event.nativeEvent.layout.y;
  };

  const updateField = (key: string, value: any) => {
    setProfile((prev) => ({ ...prev, [key]: value } as ParentProfile));
    if (errors.has(key)) {
      const newErrors = new Set(errors);
      newErrors.delete(key);
      setErrors(newErrors);
      if (newErrors.size === 0) {
        setShowValidation(false);
      }
    }
  };

  const isLastPhase = currentPhaseIndex === visiblePhases.length - 1;
  const progressPercent = ((currentPhaseIndex + 1) / visiblePhases.length) * 100;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Progress bar */}
      <View style={{ paddingTop: insets.top }}>
        <View className="h-1" style={{ backgroundColor: colors.border }}>
          <View
            className="h-1"
            style={{ backgroundColor: colors.primary, width: `${progressPercent}%` }}
          />
        </View>
      </View>

      {/* Validation banner */}
      {showValidation && (
        <ValidationBanner
          unansweredCount={errors.size}
          onGoToFirst={handleGoToFirstError}
        />
      )}

      {/* Sticky Hasanaat progress bar */}
      {!showValidation && (
        <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: colors.background, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <HasanaatProgressBar
            answeredCount={visiblePhases.reduce((count, phase) => {
              return count + phase.questions.filter((q) => {
                if (q.conditional && !q.conditional(profile)) return false;
                const key = q.key as keyof ParentProfile;
                const value = profile[key];
                if (q.type === "multiselect") return Array.isArray(value) && (value as string[]).length > 0;
                return !!value && value !== "";
              }).length;
            }, 0)}
            totalCount={visiblePhases.reduce((count, phase) => {
              return count + phase.questions.filter((q) => {
                if (q.conditional && !q.conditional(profile)) return false;
                return true;
              }).length;
            }, 0)}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Honesty banner */}
        <HonestyBanner />
        {/* Disclosure: her husband sees what she writes here (owner-mandated, must precede writing) */}
        {profile.gender === "vrouw" && <SpouseVisibilityNotice />}

        {/* Time indication - only on first phase (Fix #1) */}
        {currentPhaseIndex === 0 && (
          <View style={{ backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>{"\u23F1"}</Text>
            <Text style={{ fontSize: 13, color: '#1565C0', flex: 1 }}>
              {tx(lang, "Dit duurt ongeveer 5 minuten", "This takes about 5 minutes", "يستغرق هذا حوالي ٥ دقائق")}
            </Text>
          </View>
        )}

        {/* Phase header */}
        <View className="mb-6">
          <Text className="text-xs font-medium mb-1" style={{ color: colors.muted }}>
            {tx(lang, `Stap ${currentPhaseIndex + 1} van ${visiblePhases.length}`, `Step ${currentPhaseIndex + 1} of ${visiblePhases.length}`, `الخطوة ${currentPhaseIndex + 1} من ${visiblePhases.length}`)}
          </Text>
          <Text className="text-2xl font-bold" style={{ color: colors.foreground }}>
            {currentPhase?.title}
          </Text>
          {currentPhase?.subtitle && (
            <Text className="text-sm mt-1" style={{ color: colors.muted }}>
              {currentPhase.subtitle}
            </Text>
          )}
        </View>

        {/* Questions */}
        {visibleQuestions.map((q) => {
          const hasError = errors.has(q.key);
          const key = q.key as keyof ParentProfile;

          return (
            <View key={q.key} onLayout={(e) => handleFieldLayout(q.key, e)}>
              {q.type === "select" && q.options && (
                <FormField label={q.label} error={hasError} id={q.key}>
                  <SelectField
                    value={profile[key] as string}
                    options={q.options}
                    onSelect={(val) => updateField(q.key, val)}
                    error={hasError}
                  />
                </FormField>
              )}

              {q.type === "multiselect" && q.options && (
                <FormField label={q.label} error={hasError} id={q.key}>
                  <MultiSelectField
                    values={(profile[key] as string[]) || []}
                    options={q.options}
                    onToggle={(val) => {
                      const current = (profile[key] as string[]) || [];
                      const updated = current.includes(val)
                        ? current.filter((v) => v !== val)
                        : [...current, val];
                      updateField(q.key, updated);
                    }}
                    error={hasError}
                  />
                </FormField>
              )}

              {q.type === "text" && (
                <FormField label={q.label} error={hasError} id={q.key}>
                  {q.hint && (
                    <Text className="text-xs mb-2 italic" style={{ color: colors.muted }}>
                      {q.hint}
                    </Text>
                  )}
                  <TextField
                    value={(profile[key] as string) || ""}
                    onChangeText={(text) => updateField(q.key, text)}
                    placeholder={tx(lang, "Typ hier uw antwoord...", "Type your answer here...", "اكتب إجابتك هنا...")}
                    multiline
                    error={hasError}
                  />
                </FormField>
              )}

              {q.type === "hybrid" && q.options && (
                <FormField label={q.label} error={hasError} id={q.key}>
                  {q.hint && (
                    <Text className="text-xs mb-2 italic" style={{ color: colors.muted }}>
                      {q.hint}
                    </Text>
                  )}
                  <HybridField
                    value={(profile[key] as string) || ""}
                    options={q.options}
                    onSelect={(val) => updateField(q.key, val)}
                    onChangeText={(text) => updateField(q.key, text)}
                    placeholder={tx(lang, "Typ hier uw eigen antwoord...", "Type your own answer here...", "اكتب إجابتك الخاصة هنا...")}
                    error={hasError}
                  />
                </FormField>
              )}

              {q.type === "date" && (
                <FormField label={q.label} error={hasError} id={q.key}>
                  <DatePicker
                    value={(profile[key] as string) || ""}
                    onChange={(date) => updateField(q.key, date)}
                    placeholder={tx(lang, "Kies een datum", "Choose a date", "اختر تاريخًا")}
                    maxDate={new Date()}
                    minDate={new Date(1950, 0, 1)}
                  />
                </FormField>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Navigation buttons - fixed at bottom */}
      <View
        className="border-t px-5 py-3"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View className="flex-row gap-3">
          {currentPhaseIndex > 0 && (
            <Pressable
              onPress={handlePrevious}
              style={({ pressed }) => [{
                flex: 1,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center" as const,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text className="text-base font-bold" style={{ color: colors.foreground }}>
                {tx(lang, "Vorige", "Previous", "السابق")}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [{
              flex: currentPhaseIndex > 0 ? 2 : 1,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center" as const,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text className="text-white text-base font-bold">
              {isLastPhase ? tx(lang, "Voltooien en starten", "Complete and start", "إتمام والبدء") : tx(lang, "Volgende stap", "Next step", "الخطوة التالية")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
