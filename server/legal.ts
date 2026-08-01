import type { Express, Request, Response } from "express";

/**
 * Privacy policy, terms of service and account-deletion pages.
 *
 * Google Play blocks submission without a privacy policy URL (App content →
 * Privacy policy), and an app that carries accounts must also publish a web
 * page where deletion can be requested — the in-app path in settings is not
 * sufficient on its own, because the Data safety form asks for a URL.
 *
 * The policy text below is drafted from what the code actually collects, not
 * from a template. Operator facts (legal entity, contact, retention) live in
 * ORG so there is exactly one place to change them.
 */

const PRIVACY_UPDATED = "2026-08-01";

/** The only operator-specific facts on these pages. */
const ORG = {
  /** Data controller. Same foundation that operates albunyaan.tv. */
  entity: "Stichting Tarbiyah Consultancy",
  /** rabbaanie.com publishes a null MX record and accepts no mail, so the
   *  published contact has to be a mailbox that actually exists. */
  email: "support@albunyaan.tv",
  /** Days after which a deleted account's data is fully removed. */
  deletionDays: 30,
  /** Dutch fiscal retention for financial records. */
  billingRetentionYears: 7,
  jurisdiction: { nl: "Nederland", en: "the Netherlands" },
} as const;

type Lang = "nl" | "en";

function pickLang(req: Request): Lang {
  const q = String(req.query.lang || "").toLowerCase();
  if (q === "en") return "en";
  if (q === "nl") return "nl";
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "nl";
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Rabbaanie</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;padding:2rem 1.25rem;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;
       max-width:46rem;margin-inline:auto;color:#16281f;background:#fbfbf9}
  @media(prefers-color-scheme:dark){body{color:#e8eee9;background:#0f1512}}
  h1{font-size:1.6rem;margin-bottom:.25rem} h2{font-size:1.1rem;margin-top:2rem}
  .meta{opacity:.7;font-size:.9rem} ul{padding-inline-start:1.2rem}
  code{background:#0001;padding:.1rem .3rem;border-radius:4px}
  @media(prefers-color-scheme:dark){code{background:#fff2}}
  a{color:#0d7c5f} @media(prefers-color-scheme:dark){a{color:#5fd0a8}}
  nav{margin-top:2.5rem;padding-top:1rem;border-top:1px solid #0002;font-size:.9rem}
  @media(prefers-color-scheme:dark){nav{border-color:#fff2}}
</style></head><body>${body}
<nav><a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot;
<a href="/account-deletion">Delete account</a></nav></body></html>`;
}

const PRIVACY: Record<Lang, string> = {
  nl: `<h1>Privacybeleid</h1>
<p class="meta">Laatst bijgewerkt: ${PRIVACY_UPDATED}</p>
<p>Rabbaanie (&laquo;wij&raquo;) is een gezinsapp voor islamitische opvoeding, uitgegeven door
${ORG.entity}. Dit beleid beschrijft welke gegevens de app verzamelt en waarom.
${ORG.entity} is de verwerkingsverantwoordelijke voor deze gegevens.</p>

<h2>Gegevens die we verzamelen</h2>
<ul>
  <li><strong>Account</strong>: naam, e-mailadres, taalvoorkeur en, bij registratie met wachtwoord,
      een versleutelde wachtwoord-hash. Accounts worden aangemaakt op rabbaanie.com.</li>
  <li><strong>Gezinsprofiel</strong>: burgerlijke staat, of u kinderen heeft, gegevens over uw
      kinderen (naam, geboortedatum, observaties) en gezinsleden die u toevoegt.</li>
  <li><strong>Locatie</strong>: bij benadering of nauwkeurig, uitsluitend om gebedstijden en de
      qibla-richting te berekenen.</li>
  <li><strong>Gebruik van apps op het kindtoestel</strong>: op Android kan de app, alleen nadat u
      hiervoor expliciet toestemming geeft in de systeeminstellingen, via Android
      <code>UsageStatsManager</code> registreren welke apps op het toestel van uw kind worden
      gebruikt en hoe lang, om dit aan u als ouder te tonen. U kunt deze toestemming altijd
      intrekken.</li>
  <li><strong>Meldingen</strong>: een push-token om herinneringen te sturen.</li>
</ul>

<h2>AI-functies</h2>
<p>Bij gebruik van de AI-chat en adviesfuncties wordt de inhoud die u invoert doorgestuurd naar
externe AI-leveranciers (via OpenRouter, met modellen van Google en Anthropic) om een antwoord te
genereren. Voer hier geen gegevens in die u niet met een derde partij wilt delen.</p>

<h2>Delen met derden</h2>
<p>Wij verkopen of verhuren uw gegevens niet. Gegevens worden alleen gedeeld met de hierboven
genoemde AI-leveranciers, en met betaaldienstverlener Stripe voor het afhandelen van abonnementen.</p>

<h2>Bewaren en verwijderen</h2>
<p>U kunt uw account verwijderen in de app via <em>Instellingen &rsaquo; Account verwijderen</em>, of
via <a href="/account-deletion">deze pagina</a>. Wij bewaren uw gegevens tot ${ORG.deletionDays}
dagen na verwijdering van uw account; daarna worden ze volledig uit onze systemen verwijderd.
Factuur- en betaalgegevens bewaren wij langer voor zover de wettelijke fiscale bewaarplicht
(${ORG.billingRetentionYears} jaar) dat vereist.</p>

<h2>Beveiliging</h2>
<p>Verkeer met onze servers verloopt via versleutelde verbindingen (TLS) en wachtwoorden worden
uitsluitend als hash opgeslagen. Geen enkele dienst kan volledige veiligheid garanderen.</p>

<h2>Uw rechten</h2>
<p>Onder de AVG heeft u recht op inzage, correctie, verwijdering, beperking en overdracht van uw
gegevens, en op het intrekken van toestemming. Neem hiervoor contact op via
<a href="mailto:${ORG.email}">${ORG.email}</a>. U heeft ook het recht een klacht in te dienen bij
de Autoriteit Persoonsgegevens.</p>

<h2>Wijzigingen</h2>
<p>Wijzigingen in dit beleid worden op deze pagina gepubliceerd, met een bijgewerkte datum.</p>

<h2>Contact</h2>
<p>${ORG.entity} &middot; <a href="mailto:${ORG.email}">${ORG.email}</a></p>`,

  en: `<h1>Privacy Policy</h1>
<p class="meta">Last updated: ${PRIVACY_UPDATED}</p>
<p>Rabbaanie ("we") is a family app for Islamic parenting, published by ${ORG.entity}. This policy
describes what the app collects and why. ${ORG.entity} is the data controller.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account</strong>: name, email address, language preference, and — for password
      registration — a hashed password. Accounts are created on rabbaanie.com.</li>
  <li><strong>Family profile</strong>: marital status, whether you have children, information about
      your children (name, date of birth, observations) and family members you add.</li>
  <li><strong>Location</strong>: coarse or precise, used solely to calculate prayer times and the
      qibla direction.</li>
  <li><strong>App usage on a child's device</strong>: on Android, and only after you explicitly
      grant Usage Access in system settings, the app can record via Android's
      <code>UsageStatsManager</code> which apps are used on your child's device and for how long,
      in order to show this to you as a parent. You can revoke this permission at any time.</li>
  <li><strong>Notifications</strong>: a push token used to send reminders.</li>
</ul>

<h2>AI features</h2>
<p>When you use the AI chat and advice features, the content you enter is sent to third-party AI
providers (via OpenRouter, using models from Google and Anthropic) to generate a response. Do not
enter information you would not want shared with a third party.</p>

<h2>Sharing</h2>
<p>We do not sell or rent your data. Data is shared only with the AI providers named above, and with
Stripe as payment processor for subscriptions.</p>

<h2>Retention and deletion</h2>
<p>You can delete your account in the app under <em>Settings &rsaquo; Delete account</em>, or at
<a href="/account-deletion">this page</a>. We keep your data for up to ${ORG.deletionDays} days
after your account is deleted; after that it is fully removed from our systems. Invoicing and
payment records are kept longer where Dutch statutory tax retention
(${ORG.billingRetentionYears} years) requires it.</p>

<h2>Security</h2>
<p>Traffic to our servers uses encrypted connections (TLS) and passwords are stored only as hashes.
No service can guarantee complete security.</p>

<h2>Your rights</h2>
<p>Under the GDPR you have the right to access, correct, delete, restrict and port your data, and to
withdraw consent. Contact <a href="mailto:${ORG.email}">${ORG.email}</a> to exercise these rights.
You also have the right to lodge a complaint with the Dutch Data Protection Authority.</p>

<h2>Changes</h2>
<p>Changes to this policy are published on this page with an updated date.</p>

<h2>Contact</h2>
<p>${ORG.entity} &middot; <a href="mailto:${ORG.email}">${ORG.email}</a></p>`,
};

const TERMS: Record<Lang, string> = {
  nl: `<h1>Servicevoorwaarden</h1>
<p class="meta">Laatst bijgewerkt: ${PRIVACY_UPDATED}</p>
<p>Deze voorwaarden gelden voor het gebruik van de Rabbaanie-app en rabbaanie.com, aangeboden door
${ORG.entity} (&laquo;wij&raquo;). Door de dienst te gebruiken gaat u hiermee akkoord.</p>

<h2>De dienst</h2>
<p>Rabbaanie is een advertentievrije app voor islamitische gezinsopvoeding, met onder meer
gebedstijden, adviesinhoud, AI-ondersteunde begeleiding en hulpmiddelen om de opvoeding van uw
kinderen te volgen.</p>

<h2>Accounts en leeftijd</h2>
<p>Een account wordt aangemaakt op rabbaanie.com; in de app kunt u uitsluitend inloggen. De
accounthouder moet volwassen zijn. Kindprofielen en kindaccounts worden aangemaakt en beheerd
onder verantwoordelijkheid van de ouder of voogd. U bent verantwoordelijk voor de vertrouwelijkheid
van uw inloggegevens en voor alles wat via uw account gebeurt.</p>

<h2>Abonnement en betaling</h2>
<p>Toegang tot de dienst vereist een lopend abonnement, af te sluiten op rabbaanie.com. Betaling
verloopt via Stripe tegen de prijs die bij het afrekenen wordt getoond. Het abonnement loopt door
totdat u opzegt of wij het beëindigen. Opzeggen doet u vóór het begin van de volgende
factuurperiode; reeds betaalde perioden worden niet naar rato terugbetaald, onbeperkt door uw
eventuele wettelijke rechten als consument.</p>

<h2>Toegestaan gebruik</h2>
<p>U gebruikt de dienst niet voor onrechtmatige doeleinden. Het is in het bijzonder niet toegestaan
de beveiliging te schenden, gegevens te benaderen die niet voor u bestemd zijn, of de kwetsbaarheid
van het systeem te onderzoeken, scannen of testen.</p>

<h2>Inhoud en intellectueel eigendom</h2>
<p>Alle inhoud in de dienst blijft eigendom van ${ORG.entity} of haar licentiegevers. U mag de
inhoud niet verkopen, wijzigen, verveelvoudigen, openbaar maken of verspreiden buiten normaal
persoonlijk gebruik van de app. Gegevens die u zelf invoert blijven van u.</p>

<h2>AI-inhoud en religieuze inhoud</h2>
<p>Antwoorden van de AI-functies worden automatisch gegenereerd en kunnen onjuist zijn. De inhoud
van de app is algemene opvoedkundige en religieuze voorlichting en vervangt geen fatwa van een
bevoegde geleerde, noch professioneel medisch, psychologisch of juridisch advies.</p>

<h2>Geen garanties</h2>
<p>De dienst wordt geleverd &laquo;zoals hij is&raquo;, zonder garanties op ononderbroken of
foutloze beschikbaarheid. Bewaar zelf kopieën van gegevens die voor u belangrijk zijn.</p>

<h2>Aansprakelijkheid</h2>
<p>Onze aansprakelijkheid is beperkt tot het bedrag dat u in de twaalf maanden voorafgaand aan de
gebeurtenis voor de dienst heeft betaald, voor zover de wet dat toestaat. Dit beperkt niet onze
aansprakelijkheid bij opzet of bewuste roekeloosheid.</p>

<h2>Beëindiging</h2>
<p>U kunt uw account op elk moment verwijderen via <a href="/account-deletion">deze pagina</a>. Wij
kunnen een account beëindigen bij schending van deze voorwaarden.</p>

<h2>Wijzigingen</h2>
<p>Wij kunnen deze voorwaarden aanpassen. Wijzigingen worden op deze pagina gepubliceerd met een
bijgewerkte datum.</p>

<h2>Toepasselijk recht</h2>
<p>Op deze voorwaarden is het recht van ${ORG.jurisdiction.nl} van toepassing. Geschillen worden
voorgelegd aan de bevoegde rechter in ${ORG.jurisdiction.nl}.</p>

<h2>Contact</h2>
<p>${ORG.entity} &middot; <a href="mailto:${ORG.email}">${ORG.email}</a></p>`,

  en: `<h1>Terms of Service</h1>
<p class="meta">Last updated: ${PRIVACY_UPDATED}</p>
<p>These terms govern use of the Rabbaanie app and rabbaanie.com, provided by ${ORG.entity} ("we").
By using the service you agree to them.</p>

<h2>The service</h2>
<p>Rabbaanie is an ad-free Islamic family parenting app, including prayer times, advice content,
AI-assisted guidance, and tools for following your children's upbringing.</p>

<h2>Accounts and age</h2>
<p>Accounts are created on rabbaanie.com; the app is sign-in only. The account holder must be an
adult. Child profiles and child accounts are created and managed under the responsibility of the
parent or guardian. You are responsible for keeping your credentials confidential and for activity
under your account.</p>

<h2>Subscription and payment</h2>
<p>Access requires an active subscription, purchased on rabbaanie.com. Payment is processed by
Stripe at the price shown at checkout. Your subscription continues until you cancel it or we
terminate it. Cancel before the start of the next billing period; periods already paid are not
refunded pro rata, without limiting any statutory consumer rights you may have.</p>

<h2>Acceptable use</h2>
<p>You will not use the service for unlawful purposes. In particular you may not breach security,
access data not intended for you, or probe, scan or test the vulnerability of the system.</p>

<h2>Content and intellectual property</h2>
<p>All content in the service remains the property of ${ORG.entity} or its licensors. You may not
sell, modify, reproduce, publicly display or distribute it beyond ordinary personal use of the app.
Data you enter yourself remains yours.</p>

<h2>AI and religious content</h2>
<p>Responses from the AI features are generated automatically and may be wrong. Content in the app
is general parenting and religious information. It is not a fatwa from a qualified scholar, and not
professional medical, psychological or legal advice.</p>

<h2>No warranties</h2>
<p>The service is provided "as is", without warranty of uninterrupted or error-free availability.
Keep your own copies of anything important to you.</p>

<h2>Liability</h2>
<p>Our liability is limited to the amount you paid for the service in the twelve months before the
event, to the extent permitted by law. This does not limit liability for intent or wilful
recklessness.</p>

<h2>Termination</h2>
<p>You may delete your account at any time via <a href="/account-deletion">this page</a>. We may
terminate an account that breaches these terms.</p>

<h2>Changes</h2>
<p>We may amend these terms. Changes are published on this page with an updated date.</p>

<h2>Governing law</h2>
<p>These terms are governed by the law of ${ORG.jurisdiction.en}. Disputes are submitted to the
competent court in ${ORG.jurisdiction.en}.</p>

<h2>Contact</h2>
<p>${ORG.entity} &middot; <a href="mailto:${ORG.email}">${ORG.email}</a></p>`,
};

const DELETION: Record<Lang, string> = {
  nl: `<h1>Account verwijderen</h1>
<p>U kunt uw Rabbaanie-account en de bijbehorende gegevens op twee manieren laten verwijderen.</p>
<h2>In de app</h2>
<p>Open <em>Instellingen</em> en kies onderaan <em>Account verwijderen</em>. U wordt om bevestiging
gevraagd en daarna uitgelogd.</p>
<h2>Via e-mail</h2>
<p>Stuur een verzoek vanaf het e-mailadres van uw account naar
<a href="mailto:${ORG.email}">${ORG.email}</a>. Wij verwijderen het account binnen
${ORG.deletionDays} dagen na verificatie.</p>
<h2>Wat wordt verwijderd</h2>
<p>Uw account, gezinsprofiel, kindgegevens, observaties en opgeslagen adviezen worden binnen
${ORG.deletionDays} dagen volledig verwijderd. Factuur- en betaalgegevens bewaren wij langer voor
zover de wettelijke fiscale bewaarplicht (${ORG.billingRetentionYears} jaar) dat vereist.</p>
<p>Een verwijderd account kan niet opnieuw worden gebruikt om in te loggen.</p>`,

  en: `<h1>Delete your account</h1>
<p>You can have your Rabbaanie account and its data deleted in two ways.</p>
<h2>In the app</h2>
<p>Open <em>Settings</em> and choose <em>Delete account</em> at the bottom. You will be asked to
confirm and then signed out.</p>
<h2>By email</h2>
<p>Send a request from your account's email address to
<a href="mailto:${ORG.email}">${ORG.email}</a>. We delete the account within ${ORG.deletionDays}
days of verification.</p>
<h2>What is deleted</h2>
<p>Your account, family profile, children's data, observations and saved advice are fully removed
within ${ORG.deletionDays} days. Invoicing and payment records are kept longer where Dutch statutory
tax retention (${ORG.billingRetentionYears} years) requires it.</p>
<p>A deleted account can no longer be used to sign in.</p>`,
};

export function registerLegalRoutes(app: Express) {
  const page = (title: Record<Lang, string>, body: Record<Lang, string>) =>
    (req: Request, res: Response) => {
      const lang = pickLang(req);
      res.type("html").send(layout(title[lang], body[lang]));
    };

  app.get("/privacy", page({ nl: "Privacybeleid", en: "Privacy Policy" }, PRIVACY));
  app.get("/terms", page({ nl: "Servicevoorwaarden", en: "Terms of Service" }, TERMS));
  app.get("/account-deletion", page({ nl: "Account verwijderen", en: "Delete your account" }, DELETION));

  // Dutch-language URLs, since that is the primary audience.
  app.get("/privacybeleid", (_req, res) => res.redirect(301, "/privacy?lang=nl"));
  app.get("/servicevoorwaarden", (_req, res) => res.redirect(301, "/terms?lang=nl"));
}
