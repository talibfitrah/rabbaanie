import type { Express, Request, Response } from "express";

/**
 * Privacy policy and account-deletion pages.
 *
 * Google Play blocks submission without a privacy policy URL (App content →
 * Privacy policy), and an app that carries accounts must also publish a web
 * page where deletion can be requested — the in-app path in settings is not
 * sufficient on its own, because the Data safety form asks for a URL.
 *
 * The policy text below is drafted from what the code actually collects, not
 * from a template. Every <<REVIEW>> marker is a fact only the operator knows
 * (legal entity, retention periods, contact address); those must be filled in
 * and the whole document checked by someone qualified before submission.
 */

const PRIVACY_UPDATED = "2026-08-01";

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
</style></head><body>${body}</body></html>`;
}

const PRIVACY: Record<Lang, string> = {
  nl: `<h1>Privacybeleid</h1>
<p class="meta">Laatst bijgewerkt: ${PRIVACY_UPDATED}</p>
<p>Rabbaanie (&laquo;wij&raquo;) is een gezinsapp voor islamitische opvoeding. Dit beleid beschrijft
welke gegevens de app verzamelt en waarom.</p>

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
<p>Wij verkopen geen gegevens. Gegevens worden alleen gedeeld met de hierboven genoemde
AI-leveranciers, en met betaaldienstverlener Stripe voor het afhandelen van abonnementen.</p>

<h2>Bewaren en verwijderen</h2>
<p>U kunt uw account verwijderen in de app via <em>Instellingen &rsaquo; Account verwijderen</em>, of
via <a href="/account-deletion">deze pagina</a>. &lt;&lt;REVIEW: bewaartermijnen
per categorie invullen&gt;&gt;</p>

<h2>Uw rechten</h2>
<p>Onder de AVG heeft u recht op inzage, correctie, verwijdering en overdracht van uw gegevens.
&lt;&lt;REVIEW: contactadres en verwerkingsverantwoordelijke (juridische entiteit) invullen&gt;&gt;</p>`,

  en: `<h1>Privacy Policy</h1>
<p class="meta">Last updated: ${PRIVACY_UPDATED}</p>
<p>Rabbaanie ("we") is a family app for Islamic parenting. This policy describes what the app
collects and why.</p>

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
<p>We do not sell data. Data is shared only with the AI providers named above, and with Stripe as
payment processor for subscriptions.</p>

<h2>Retention and deletion</h2>
<p>You can delete your account in the app under <em>Settings &rsaquo; Delete account</em>, or at
<a href="/account-deletion">this page</a>. &lt;&lt;REVIEW: fill in retention
periods per category&gt;&gt;</p>

<h2>Your rights</h2>
<p>Under the GDPR you have the right to access, correct, delete and port your data.
&lt;&lt;REVIEW: fill in contact address and the data controller's legal entity&gt;&gt;</p>`,
};

const DELETION: Record<Lang, string> = {
  nl: `<h1>Account verwijderen</h1>
<p>U kunt uw Rabbaanie-account en de bijbehorende gegevens op twee manieren laten verwijderen.</p>
<h2>In de app</h2>
<p>Open <em>Instellingen</em> en kies onderaan <em>Account verwijderen</em>. U wordt om bevestiging
gevraagd en daarna uitgelogd.</p>
<h2>Via e-mail</h2>
<p>Stuur een verzoek vanaf het e-mailadres van uw account naar
&lt;&lt;REVIEW: support-e-mailadres invullen&gt;&gt;. Wij verwijderen het account
&lt;&lt;REVIEW: termijn invullen&gt;&gt; na verificatie.</p>
<h2>Wat wordt verwijderd</h2>
<p>Uw account, gezinsprofiel, kindgegevens, observaties en opgeslagen adviezen.
&lt;&lt;REVIEW: eventuele wettelijke bewaarplicht voor facturatiegegevens vermelden&gt;&gt;</p>
<p><a href="/privacy">Privacybeleid</a></p>`,

  en: `<h1>Delete your account</h1>
<p>You can have your Rabbaanie account and its data deleted in two ways.</p>
<h2>In the app</h2>
<p>Open <em>Settings</em> and choose <em>Delete account</em> at the bottom. You will be asked to
confirm and then signed out.</p>
<h2>By email</h2>
<p>Send a request from your account's email address to
&lt;&lt;REVIEW: fill in support email&gt;&gt;. We delete the account
&lt;&lt;REVIEW: fill in timeframe&gt;&gt; after verification.</p>
<h2>What is deleted</h2>
<p>Your account, family profile, children's data, observations and saved advice.
&lt;&lt;REVIEW: note any statutory retention for billing records&gt;&gt;</p>
<p><a href="/privacy">Privacy policy</a></p>`,
};

export function registerLegalRoutes(app: Express) {
  app.get("/privacy", (req: Request, res: Response) => {
    const lang = pickLang(req);
    res.type("html").send(layout(lang === "en" ? "Privacy Policy" : "Privacybeleid", PRIVACY[lang]));
  });

  app.get("/account-deletion", (req: Request, res: Response) => {
    const lang = pickLang(req);
    res
      .type("html")
      .send(layout(lang === "en" ? "Delete your account" : "Account verwijderen", DELETION[lang]));
  });
}
