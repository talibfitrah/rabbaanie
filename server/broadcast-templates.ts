/**
 * The four admin-broadcast message templates Daa3iyah asked for, one per
 * audience category in server/broadcast-audience.ts. Fixed structure per his
 * spec: open with the basmala, then the message and the action required,
 * close with al-hamdu and as-salaam — in all three app languages, because
 * db.broadcastLocalizedPush already sends each recipient their own stored
 * language from parallel {nl,en,ar} strings (see
 * local-docs/BROADCAST-ROUTER-PATCH.md for the evidence and the wiring).
 *
 * Four templates with a couple of substitutions is string interpolation,
 * not a template engine — no placeholder syntax, no lookup table.
 *
 * Transliterations ("Bismillaah", "al-hamdu li-llaah", "Assalaamu 3alaykum
 * wa rahmatullaahi wa barakaatuh") are copied verbatim from this codebase's
 * existing house style (server/ai-chat.ts and server/advice.ts system
 * prompts mandate "Bismillaah"; lib/adhkar-data.ts uses "al-hamdu li-llaah";
 * app/support.tsx drops a transliterated greeting into nl/en running text
 * the same way), not invented here.
 */

export type LocalizedText = { nl: string; en: string; ar: string };
export type BroadcastTemplate = { title: LocalizedText; body: LocalizedText };

const BASMALA: LocalizedText = {
  ar: "بسم الله الرحمن الرحيم",
  nl: "Bismillaah",
  en: "Bismillaah",
};

const CLOSING: LocalizedText = {
  ar: "والحمد لله رب العالمين، والسلام عليكم ورحمة الله وبركاته.",
  nl: "Al-hamdu li-llaah. Was-salaamu 3alaykum wa rahmatullaahi wa barakaatuh.",
  en: "Al-hamdu li-llaah. Was-salaamu 3alaykum wa rahmatullaahi wa barakaatuh.",
};

function wrapBody(core: LocalizedText): LocalizedText {
  return {
    ar: `${BASMALA.ar}\n\n${core.ar}\n\n${CLOSING.ar}`,
    nl: `${BASMALA.nl}\n\n${core.nl}\n\n${CLOSING.nl}`,
    en: `${BASMALA.en}\n\n${core.en}\n\n${CLOSING.en}`,
  };
}

/** Category 1: has not completed the analytical profile (the 13-step
 *  parent-profile wizard — see broadcast-audience.ts's
 *  analyticalProfileIncomplete). */
export function analyticalProfileTemplate(): BroadcastTemplate {
  return {
    title: {
      ar: "أكمل ملفك التحليلي",
      nl: "Maak je analytische profiel af",
      en: "Complete your analytical profile",
    },
    body: wrapBody({
      ar: "لاحظنا أنك لم تُكمل بعد الملف التحليلي (التشخيص) الخاص بك في تطبيق ربّانيّ. إكمال هذا الملف يساعدنا على تقديم نصائح تربوية أدقّ لأسرتك. يرجى فتح التطبيق وإكمال خطوات الملف التحليلي في أقرب وقت.",
      nl: "We zagen dat je je analytische profiel (de diagnose) in de Rabbaanie-app nog niet hebt afgerond. Dit profiel helpt ons om nauwkeurigere opvoedadviezen voor jouw gezin te geven. Open de app en rond de stappen van het analytische profiel af.",
      en: "We noticed you haven't yet completed your analytical profile (the diagnosis) in the Rabbaanie app. This profile helps us give more accurate parenting advice for your family. Please open the app and complete the analytical profile steps.",
    }),
  };
}

/** Category 3: has not entered personal information (the onboarding
 *  identity/address gate — see broadcast-audience.ts's
 *  personalProfileIncomplete). */
export function personalProfileTemplate(): BroadcastTemplate {
  return {
    title: {
      ar: "أكمل بياناتك الشخصية",
      nl: "Vul je persoonlijke gegevens aan",
      en: "Complete your personal information",
    },
    body: wrapBody({
      ar: "لاحظنا أنك لم تُدخل بعد بياناتك الشخصية كاملةً في تطبيق ربّانيّ. إكمالها ضروري لتفعيل خدمات التطبيق كاملةً. يرجى فتح التطبيق وإكمال بياناتك الشخصية.",
      nl: "We zagen dat je jouw persoonlijke gegevens in de Rabbaanie-app nog niet volledig hebt ingevuld. Dit is nodig om alle functies van de app te kunnen gebruiken. Open de app en vul je persoonlijke gegevens aan.",
      en: "We noticed your personal information in the Rabbaanie app isn't complete yet. This is needed to unlock all the app's features. Please open the app and complete your personal information.",
    }),
  };
}

/** Category 2: has a child profile that isn't complete (see
 *  broadcast-audience.ts's incompleteChildNames) — names the specific
 *  child(ren). Built for the one-child case the request describes; for the
 *  rare case of two or more incomplete children on one account, names are
 *  joined into a plain list (ponytail: not grammatically pluralized —
 *  revisit only if that case turns out to be common). */
export function childProfileTemplate(childNames: string[]): BroadcastTemplate {
  const namesAr = childNames.join("، ");
  const namesNlEn = childNames.join(", ");
  return {
    title: {
      ar: `أكمل ملف طفلك ${namesAr}`,
      nl: `Maak het profiel van ${namesNlEn} af`,
      en: `Complete ${namesNlEn}'s profile`,
    },
    body: wrapBody({
      ar: `لاحظنا أنّ ملف طفلك ${namesAr} لم يكتمل بعد في تطبيق ربّانيّ. إكمال الملف يساعدنا على تقديم متابعة ونصائح تربوية أنسب له. يرجى فتح التطبيق وإكمال الملف.`,
      nl: `We zagen dat het profiel van je kind ${namesNlEn} in de Rabbaanie-app nog niet compleet is. Het afmaken van dit profiel helpt ons om beter te begeleiden en gerichter advies te geven. Open de app en maak het profiel af.`,
      en: `We noticed your child ${namesNlEn}'s profile in the Rabbaanie app isn't complete yet. Finishing it helps us guide them better and give more tailored advice. Please open the app and complete the profile.`,
    }),
  };
}

/** Category 4: married, no confirmed spouse linked (see
 *  broadcast-audience.ts's notLinkedSpouse) — gendered by the recipient's
 *  own sex, never guessed (recipientGender excludes anything but "man" or
 *  "vrouw" from this category before a template is ever picked). */
export function spouseNotLinkedTemplate(gender: "man" | "vrouw"): BroadcastTemplate {
  if (gender === "man") {
    return {
      title: {
        ar: "اربط ملف زوجتك",
        nl: "Koppel het profiel van je vrouw",
        en: "Link your wife's profile",
      },
      body: wrapBody({
        ar: "لاحظنا أنك لم تربط بعد ملف زوجتك في تطبيق ربّانيّ. ربط الملفين يتيح لكما متابعة مشتركة لأبنائكما والاستفادة من ميزات الأسرة الواحدة. يرجى فتح التطبيق ودعوة زوجتك لربط الملف.",
        nl: "We zagen dat je het profiel van je vrouw nog niet hebt gekoppeld in de Rabbaanie-app. Door de profielen te koppelen kunnen jullie samen de kinderen volgen en gebruikmaken van de gezinsfuncties. Open de app en nodig je vrouw uit om te koppelen.",
        en: "We noticed you haven't linked your wife's profile yet in the Rabbaanie app. Linking your profiles lets you both follow your children together and use the family features. Please open the app and invite your wife to link.",
      }),
    };
  }
  return {
    title: {
      ar: "اربطي ملف زوجك",
      nl: "Koppel het profiel van je man",
      en: "Link your husband's profile",
    },
    body: wrapBody({
      ar: "لاحظنا أنكِ لم تربطي بعد ملف زوجك في تطبيق ربّانيّ. ربط الملفين يتيح لكما متابعة مشتركة لأبنائكما والاستفادة من ميزات الأسرة الواحدة. يرجى فتح التطبيق ودعوة زوجك لربط الملف.",
      nl: "We zagen dat je het profiel van je man nog niet hebt gekoppeld in de Rabbaanie-app. Door de profielen te koppelen kunnen jullie samen de kinderen volgen en gebruikmaken van de gezinsfuncties. Open de app en nodig je man uit om te koppelen.",
      en: "We noticed you haven't linked your husband's profile yet in the Rabbaanie app. Linking your profiles lets you both follow your children together and use the family features. Please open the app and invite your husband to link.",
    }),
  };
}
