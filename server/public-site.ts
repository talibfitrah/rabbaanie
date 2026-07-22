import type { Express } from "express";
import { getPublishedArticles, getArticleBySlug, searchArticles, getAllAuthors, getAuthorBySlug, getArticlesByAuthor } from "./db";

/**
 * Public website - Full Islamic Parenting Portal
 * A professional multi-page website inspired by oudersvannu.nl but 100% Islamic
 * Features: navigation menu, article categories, search, expert columns, tools, newsletter
 */
export function mountPublicSite(app: Express) {
  app.get("/", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateHomePage(lang));
  });

  app.get("/site", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateHomePage(lang));
  });

  app.get("/site/categorie/:slug", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateCategoryPage(lang, req.params.slug));
  });

  app.get("/site/artikel/:slug", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateArticlePage(lang, req.params.slug));
  });

  app.get("/site/over-ons", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateAboutPage(lang));
  });

  app.get("/site/tools", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateToolsPage(lang));
  });

  app.get("/site/experts", async (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    try {
      const authorsList = await getAllAuthors();
      if (authorsList.length > 0) {
        res.send(generateExpertsPageDB(lang, authorsList));
      } else {
        res.send(generateExpertsPage(lang));
      }
    } catch {
      res.send(generateExpertsPage(lang));
    }
  });

  app.get("/site/privacy", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generatePrivacyPage(lang));
  });

  app.get("/site/contact", (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    res.send(generateContactPage(lang));
  });

  // Search route
  app.get("/site/zoeken", async (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    const q = (req.query.q as string) || "";
    try {
      const results = q ? await searchArticles(q, 20) : [];
      res.send(generateSearchPage(lang, q, results));
    } catch {
      res.send(generateSearchPage(lang, q, []));
    }
  });

  // Author profile route
  app.get("/site/expert/:slug", async (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    try {
      const author = await getAuthorBySlug(req.params.slug);
      if (!author) { res.redirect("/site/experts?lang=" + lang); return; }
      const articles = await getArticlesByAuthor(author.id, 20);
      res.send(generateAuthorPage(lang, author, articles));
    } catch {
      res.redirect("/site/experts?lang=" + lang);
    }
  });

  // Dynamic experts page with DB data
  app.get("/site/experts-db", async (req, res) => {
    const lang = (req.query.lang as string) || "nl";
    try {
      const authorsList = await getAllAuthors();
      res.send(generateExpertsPageDB(lang, authorsList));
    } catch {
      res.send(generateExpertsPage(lang));
    }
  });
}

// ============ SHARED LAYOUT ============

function getNavigation(lang: string) {
  const t: Record<string, any> = {
    nl: {
      home: "Home", baby: "Baby (0-2)", peuter: "Peuter (2-4)", kleuter: "Kleuter (4-6)",
      schoolkind: "Schoolkind (6-10)", puber: "Puber (10-12+)", ouders: "Voor ouders",
      tools: "Tools", experts: "Experts", overOns: "Over ons", contact: "Contact",
      search: "Zoeken...", login: "Inloggen", register: "Account aanmaken",
      siteName: "Opvoedadvies", siteTagline: "Islamitische opvoeding met wijsheid",
    },
    en: {
      home: "Home", baby: "Baby (0-2)", peuter: "Toddler (2-4)", kleuter: "Preschool (4-6)",
      schoolkind: "School-age (6-10)", puber: "Pre-teen (10-12+)", ouders: "For parents",
      tools: "Tools", experts: "Experts", overOns: "About us", contact: "Contact",
      search: "Search...", login: "Sign in", register: "Create account",
      siteName: "Opvoedadvies", siteTagline: "Islamic parenting with wisdom",
    },
    ar: {
      home: "الرئيسية", baby: "رضيع (٠-٢)", peuter: "طفل صغير (٢-٤)", kleuter: "ما قبل المدرسة (٤-٦)",
      schoolkind: "سن المدرسة (٦-١٠)", puber: "ما قبل المراهقة (١٠-١٢+)", ouders: "للوالدين",
      tools: "أدوات", experts: "خبراء", overOns: "من نحن", contact: "اتصل بنا",
      search: "بحث...", login: "تسجيل الدخول", register: "إنشاء حساب",
      siteName: "نصائح التربية", siteTagline: "التربية الإسلامية بالحكمة والعلم",
    },
  };
  return t[lang] || t.nl;
}

function baseLayout(lang: string, title: string, content: string, activeNav?: string): string {
  const isRTL = lang === "ar";
  const dir = isRTL ? "rtl" : "ltr";
  const nav = getNavigation(lang);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ${nav.siteName}</title>
  <meta name="description" content="${nav.siteTagline}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --green-900: #1B4332;
      --green-800: #2D6A4F;
      --green-700: #40916C;
      --green-600: #52B788;
      --green-100: #D8F3DC;
      --green-50: #F0FFF4;
      --gold: #C4A35A;
      --gold-light: #F5ECD7;
      --text: #1B4332;
      --text-muted: #4A6B5D;
      --bg: #FAFCFB;
      --white: #FFFFFF;
      --border: #E2E8E5;
      --shadow: 0 2px 12px rgba(27,67,50,0.06);
      --shadow-lg: 0 8px 32px rgba(27,67,50,0.1);
      --radius: 12px;
      --radius-lg: 20px;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      direction: ${dir};
      font-size: 16px;
    }
    ${isRTL ? `body { font-family: 'Amiri', 'Inter', sans-serif; }` : ''}
    a { color: var(--green-800); text-decoration: none; transition: color 0.2s; }
    a:hover { color: var(--green-700); }
    img { max-width: 100%; height: auto; }

    /* TOP BAR */
    .top-bar {
      background: var(--green-900);
      color: rgba(255,255,255,0.8);
      padding: 8px 0;
      font-size: 0.8rem;
    }
    .top-bar .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .top-bar a { color: rgba(255,255,255,0.9); margin-${isRTL ? 'left' : 'right'}: 16px; font-size: 0.8rem; }
    .top-bar a:hover { color: white; }

    /* HEADER */
    .site-header {
      background: var(--white);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }
    .header-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }
    .logo-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, var(--green-800), var(--green-600));
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      color: white;
    }
    .logo-text h1 { font-size: 1.4rem; font-weight: 800; color: var(--green-900); line-height: 1.2; }
    .logo-text span { font-size: 0.75rem; color: var(--text-muted); }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .search-box {
      display: flex;
      align-items: center;
      background: var(--green-50);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 8px 16px;
      gap: 8px;
    }
    .search-box input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 0.9rem;
      width: 160px;
      direction: ${dir};
    }
    .btn-login {
      padding: 8px 20px;
      border-radius: 24px;
      font-weight: 600;
      font-size: 0.85rem;
      border: 2px solid var(--green-800);
      color: var(--green-800);
      transition: all 0.2s;
    }
    .btn-login:hover { background: var(--green-800); color: white; }
    .btn-register {
      padding: 8px 20px;
      border-radius: 24px;
      font-weight: 600;
      font-size: 0.85rem;
      background: var(--green-800);
      color: white;
      transition: all 0.2s;
    }
    .btn-register:hover { background: var(--green-900); }

    /* NAVIGATION */
    .main-nav {
      background: var(--white);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .nav-list {
      display: flex;
      list-style: none;
      gap: 0;
      padding: 0;
      white-space: nowrap;
    }
    .nav-list li a {
      display: block;
      padding: 14px 20px;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-muted);
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
    }
    .nav-list li a:hover,
    .nav-list li a.active {
      color: var(--green-800);
      border-bottom-color: var(--green-700);
    }

    /* CONTAINER */
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    /* HERO */
    .hero {
      background: linear-gradient(135deg, var(--green-900) 0%, var(--green-800) 50%, var(--green-700) 100%);
      color: white;
      padding: 60px 0;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      top: -50%;
      ${isRTL ? 'left' : 'right'}: -10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(196,163,90,0.15) 0%, transparent 70%);
      border-radius: 50%;
    }
    .hero-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      align-items: center;
      position: relative;
      z-index: 1;
    }
    .hero h2 { font-size: 2.4rem; font-weight: 800; margin-bottom: 16px; line-height: 1.2; }
    .hero p { font-size: 1.1rem; opacity: 0.9; margin-bottom: 24px; line-height: 1.6; }
    .hero-cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--gold);
      color: var(--green-900);
      padding: 14px 28px;
      border-radius: 30px;
      font-weight: 700;
      font-size: 1rem;
      transition: all 0.2s;
    }
    .hero-cta:hover { background: #D4B36A; color: var(--green-900); transform: translateY(-2px); }
    .hero-featured {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .hero-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: var(--radius);
      padding: 20px;
      transition: all 0.2s;
    }
    .hero-card:hover { background: rgba(255,255,255,0.15); transform: translateY(-2px); }
    .hero-card h4 { font-size: 0.85rem; margin-bottom: 4px; }
    .hero-card p { font-size: 0.75rem; opacity: 0.7; margin-bottom: 0; }

    /* SECTIONS */
    .section { padding: 60px 0; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
    }
    .section-header h2 {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--green-900);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section-header h2::before {
      content: '';
      width: 4px;
      height: 28px;
      background: linear-gradient(to bottom, var(--green-700), var(--gold));
      border-radius: 2px;
    }
    .section-header a {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--green-700);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* ARTICLE CARDS */
    .articles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }
    .article-card {
      background: var(--white);
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: 1px solid var(--border);
      transition: all 0.3s;
      display: flex;
      flex-direction: column;
    }
    .article-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .article-thumb {
      height: 180px;
      background: linear-gradient(135deg, var(--green-100), var(--gold-light));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      position: relative;
    }
    .article-thumb .category-badge {
      position: absolute;
      top: 12px;
      ${isRTL ? 'right' : 'left'}: 12px;
      background: var(--green-800);
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .article-body {
      padding: 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .article-body h3 {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.4;
      color: var(--green-900);
    }
    .article-body p {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.5;
      flex: 1;
    }
    .article-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* FEATURED ARTICLE (large) */
    .featured-article {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 32px;
      background: var(--white);
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: 1px solid var(--border);
      margin-bottom: 32px;
      transition: all 0.3s;
    }
    .featured-article:hover { box-shadow: var(--shadow-lg); }
    .featured-thumb {
      height: 300px;
      background: linear-gradient(135deg, var(--green-800), var(--green-600));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 5rem;
    }
    .featured-body {
      padding: 32px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .featured-body .category-badge {
      display: inline-block;
      background: var(--green-100);
      color: var(--green-800);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 12px;
      width: fit-content;
    }
    .featured-body h3 { font-size: 1.4rem; font-weight: 700; margin-bottom: 12px; line-height: 1.3; }
    .featured-body p { font-size: 0.95rem; color: var(--text-muted); line-height: 1.6; }

    /* CATEGORY PILLS */
    .category-pills {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 32px;
    }
    .pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--white);
      border: 1px solid var(--border);
      padding: 10px 20px;
      border-radius: 30px;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.2s;
      cursor: pointer;
    }
    .pill:hover, .pill.active { background: var(--green-800); color: white; border-color: var(--green-800); }
    .pill .pill-icon { font-size: 1.1rem; }

    /* HADITH BANNER */
    .hadith-banner {
      background: linear-gradient(135deg, var(--gold-light), var(--green-50));
      border: 1px solid var(--gold);
      border-radius: var(--radius-lg);
      padding: 32px;
      text-align: center;
      margin: 40px 0;
    }
    .hadith-banner .hadith-text {
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--green-900);
      margin-bottom: 8px;
      font-style: italic;
    }
    .hadith-banner .hadith-source {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    /* TOOLS SECTION */
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .tool-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
      transition: all 0.2s;
    }
    .tool-card:hover { border-color: var(--green-600); box-shadow: var(--shadow); transform: translateY(-2px); }
    .tool-card .tool-icon { font-size: 2rem; margin-bottom: 12px; }
    .tool-card h4 { font-size: 0.9rem; font-weight: 600; margin-bottom: 4px; }
    .tool-card p { font-size: 0.75rem; color: var(--text-muted); }

    /* EXPERT CARDS */
    .experts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 24px;
    }
    .expert-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      text-align: center;
      transition: all 0.2s;
    }
    .expert-card:hover { box-shadow: var(--shadow-lg); }
    .expert-avatar {
      width: 72px;
      height: 72px;
      background: linear-gradient(135deg, var(--green-700), var(--green-600));
      border-radius: 50%;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      color: white;
    }
    .expert-card h4 { font-size: 1rem; font-weight: 700; margin-bottom: 4px; }
    .expert-card .expert-role { font-size: 0.8rem; color: var(--gold); font-weight: 600; margin-bottom: 8px; }
    .expert-card p { font-size: 0.85rem; color: var(--text-muted); }

    /* NEWSLETTER */
    .newsletter-section {
      background: linear-gradient(135deg, var(--green-900), var(--green-800));
      color: white;
      border-radius: var(--radius-lg);
      padding: 48px;
      text-align: center;
      margin: 40px 0;
    }
    .newsletter-section h2 { font-size: 1.6rem; margin-bottom: 8px; }
    .newsletter-section p { opacity: 0.8; margin-bottom: 24px; }
    .newsletter-form {
      display: flex;
      gap: 12px;
      max-width: 480px;
      margin: 0 auto;
      flex-wrap: wrap;
      justify-content: center;
    }
    .newsletter-form input {
      flex: 1;
      min-width: 220px;
      padding: 14px 20px;
      border: none;
      border-radius: 30px;
      font-size: 0.95rem;
      outline: none;
      direction: ${dir};
    }
    .newsletter-form button {
      background: var(--gold);
      color: var(--green-900);
      border: none;
      padding: 14px 28px;
      border-radius: 30px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .newsletter-form button:hover { background: #D4B36A; }

    /* FOOTER */
    .site-footer {
      background: var(--green-900);
      color: rgba(255,255,255,0.7);
      padding: 60px 0 30px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .footer-col h4 {
      color: white;
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .footer-col p { font-size: 0.85rem; line-height: 1.6; margin-bottom: 12px; }
    .footer-col ul { list-style: none; }
    .footer-col ul li { margin-bottom: 8px; }
    .footer-col ul li a { color: rgba(255,255,255,0.7); font-size: 0.85rem; }
    .footer-col ul li a:hover { color: white; }
    .footer-bottom {
      border-top: 1px solid rgba(255,255,255,0.1);
      padding-top: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
    }
    .footer-bottom .lang-links a {
      color: rgba(255,255,255,0.6);
      margin-${isRTL ? 'left' : 'right'}: 12px;
      padding: 4px 10px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
    }
    .footer-bottom .lang-links a:hover { color: white; border-color: rgba(255,255,255,0.5); }

    /* APP DOWNLOAD BANNER */
    .app-banner {
      background: var(--white);
      border: 2px solid var(--green-600);
      border-radius: var(--radius-lg);
      padding: 32px;
      display: flex;
      align-items: center;
      gap: 24px;
      margin: 40px 0;
    }
    .app-banner-icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, var(--green-800), var(--green-600));
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      flex-shrink: 0;
    }
    .app-banner-text h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 4px; }
    .app-banner-text p { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 12px; }
    .app-banner-btns { display: flex; gap: 12px; flex-wrap: wrap; }
    .app-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--green-900);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .app-btn:hover { background: var(--green-800); color: white; }

    /* RESPONSIVE */
    @media (max-width: 900px) {
      .hero-content { grid-template-columns: 1fr; }
      .hero-featured { display: none; }
      .featured-article { grid-template-columns: 1fr; }
      .featured-thumb { height: 200px; }
      .footer-grid { grid-template-columns: 1fr 1fr; }
      .app-banner { flex-direction: column; text-align: center; }
    }
    @media (max-width: 600px) {
      .header-main { flex-wrap: wrap; gap: 12px; }
      .search-box { display: none; }
      .footer-grid { grid-template-columns: 1fr; }
      .hero h2 { font-size: 1.6rem; }
      .section-header h2 { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <!-- TOP BAR -->
  <div class="top-bar">
    <div class="container">
      <span>${lang === 'ar' ? 'بسم الله الرحمن الرحيم' : lang === 'en' ? 'In the name of Allaah, the Most Merciful' : 'In de naam van Allaah, de Meest Barmhartige'}</span>
      <div>
        <a href="?lang=nl">NL</a>
        <a href="?lang=en">EN</a>
        <a href="?lang=ar">عربي</a>
      </div>
    </div>
  </div>

  <!-- HEADER -->
  <header class="site-header">
    <div class="container">
      <div class="header-main">
        <a href="/site?lang=${lang}" class="logo">
          <div class="logo-icon">🌿</div>
          <div class="logo-text">
            <h1>${nav.siteName}</h1>
            <span>${nav.siteTagline}</span>
          </div>
        </a>
        <div class="header-actions">
          <form class="search-box" action="/site/zoeken" method="GET">
            <input type="hidden" name="lang" value="${lang}">
            <span>🔍</span>
            <input type="text" name="q" placeholder="${nav.search}">
          </form>
          <a href="/auth/login?lang=${lang}" class="btn-login">${nav.login}</a>
          <a href="/auth/register?lang=${lang}" class="btn-register">${nav.register}</a>
          <a href="/auth/login?lang=${lang}&admin=1" class="btn-login" style="background:rgba(27,67,50,0.1); color:#1B4332; font-size:0.75rem; padding:6px 12px; border-radius:6px; margin-left:4px;">⚙️ Admin</a>
        </div>
      </div>
    </div>
  </header>

  <!-- NAVIGATION -->
  <nav class="main-nav">
    <div class="container">
      <ul class="nav-list">
        <li><a href="/site?lang=${lang}" class="${activeNav === 'home' ? 'active' : ''}">${nav.home}</a></li>
        <li><a href="/site/categorie/baby?lang=${lang}" class="${activeNav === 'baby' ? 'active' : ''}">${nav.baby}</a></li>
        <li><a href="/site/categorie/peuter?lang=${lang}" class="${activeNav === 'peuter' ? 'active' : ''}">${nav.peuter}</a></li>
        <li><a href="/site/categorie/kleuter?lang=${lang}" class="${activeNav === 'kleuter' ? 'active' : ''}">${nav.kleuter}</a></li>
        <li><a href="/site/categorie/schoolkind?lang=${lang}" class="${activeNav === 'schoolkind' ? 'active' : ''}">${nav.schoolkind}</a></li>
        <li><a href="/site/categorie/puber?lang=${lang}" class="${activeNav === 'puber' ? 'active' : ''}">${nav.puber}</a></li>
        <li><a href="/site/categorie/ouders?lang=${lang}" class="${activeNav === 'ouders' ? 'active' : ''}">${nav.ouders}</a></li>
        <li><a href="/site/tools?lang=${lang}" class="${activeNav === 'tools' ? 'active' : ''}">${nav.tools}</a></li>
        <li><a href="/site/experts?lang=${lang}" class="${activeNav === 'experts' ? 'active' : ''}">${nav.experts}</a></li>
      </ul>
    </div>
  </nav>

  <!-- CONTENT -->
  ${content}

  <!-- FOOTER -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <h4>${nav.siteName}</h4>
          <p>${lang === 'ar' ? 'منصة شاملة للتربية الإسلامية مبنية على القرآن والسنة وأعمال العلماء. نساعد الآباء المسلمين في تربية أبنائهم بالحكمة والعلم.' : lang === 'en' ? 'A comprehensive Islamic parenting platform built on the Qur\u2019aan, Sunnah and works of scholars. We help Muslim parents raise their children with wisdom and knowledge.' : 'Een compleet islamitisch opvoedingsplatform gebouwd op de Qur\u2019aan, Soennah en werken van geleerden. Wij helpen moslimouders hun kinderen op te voeden met wijsheid en kennis.'}</p>
        </div>
        <div class="footer-col">
          <h4>${lang === 'ar' ? 'الفئات العمرية' : lang === 'en' ? 'Age Groups' : 'Leeftijdsgroepen'}</h4>
          <ul>
            <li><a href="/site/categorie/baby?lang=${lang}">${nav.baby}</a></li>
            <li><a href="/site/categorie/peuter?lang=${lang}">${nav.peuter}</a></li>
            <li><a href="/site/categorie/kleuter?lang=${lang}">${nav.kleuter}</a></li>
            <li><a href="/site/categorie/schoolkind?lang=${lang}">${nav.schoolkind}</a></li>
            <li><a href="/site/categorie/puber?lang=${lang}">${nav.puber}</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>${lang === 'ar' ? 'الموقع' : lang === 'en' ? 'Website' : 'Website'}</h4>
          <ul>
            <li><a href="/site/over-ons?lang=${lang}">${nav.overOns}</a></li>
            <li><a href="/site/experts?lang=${lang}">${nav.experts}</a></li>
            <li><a href="/site/tools?lang=${lang}">${nav.tools}</a></li>
            <li><a href="/site/contact?lang=${lang}">${nav.contact}</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>${lang === 'ar' ? 'قانوني' : lang === 'en' ? 'Legal' : 'Juridisch'}</h4>
          <ul>
            <li><a href="/site/privacy?lang=${lang}">${lang === 'ar' ? 'سياسة الخصوصية' : lang === 'en' ? 'Privacy Policy' : 'Privacybeleid'}</a></li>
            <li><a href="/site/contact?lang=${lang}">${lang === 'ar' ? 'شروط الاستخدام' : lang === 'en' ? 'Terms of Service' : 'Gebruiksvoorwaarden'}</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>${lang === 'ar' ? '© ٢٠٢٤ نصائح التربية. جميع الحقوق محفوظة.' : '© 2024 Opvoedadvies. All rights reserved.'}</span>
        <div class="lang-links">
          <a href="?lang=nl">Nederlands</a>
          <a href="?lang=en">English</a>
          <a href="?lang=ar">العربية</a>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

// ============ ARTICLES DATABASE ============

function getArticles(lang: string) {
  const articles: Record<string, any[]> = {
    nl: [
      { slug: "fitrah-bewaken", cat: "baby", catLabel: "Baby (0-2)", icon: "🌱", title: "De fitrah van je baby bewaken: zo doe je dat", desc: "Elk kind wordt geboren op de fitrah. Leer hoe je deze zuivere aanleg beschermt en voedt in de eerste twee levensjaren.", author: "Redactie", date: "24 jun 2024", readTime: "5 min" },
      { slug: "adhaan-bij-geboorte", cat: "baby", catLabel: "Baby (0-2)", icon: "🕌", title: "De adhaan fluisteren bij de geboorte: soennah en wijsheid", desc: "De profeet ﷺ leerde ons om de adhaan in het oor van de pasgeborene te fluisteren. Wat is de wijsheid hierachter?", author: "Redactie", date: "20 jun 2024", readTime: "4 min" },
      { slug: "tahnik-aqiqah", cat: "baby", catLabel: "Baby (0-2)", icon: "🍯", title: "Tahnik en aqiqah: de eerste soennah-handelingen", desc: "Praktische gids voor het verrichten van tahnik en het organiseren van de aqiqah volgens de Soennah.", author: "Redactie", date: "18 jun 2024", readTime: "6 min" },
      { slug: "salah-aanleren-kind", cat: "kleuter", catLabel: "Kleuter (4-6)", icon: "🤲", title: "Je kind het gebed aanleren: stap voor stap", desc: "Vanaf welke leeftijd begin je? Hoe maak je het leuk? Praktische tips gebaseerd op de hadieth over het gebed.", author: "Redactie", date: "15 jun 2024", readTime: "7 min" },
      { slug: "quran-memorisatie-kinderen", cat: "schoolkind", catLabel: "Schoolkind (6-10)", icon: "📖", title: "Qur’aan memorisatie met kinderen: methoden die werken", desc: "Bewezen methoden om je kind te helpen de Qur’aan te memoriseren, met aandacht voor begrip en liefde.", author: "Redactie", date: "12 jun 2024", readTime: "8 min" },
      { slug: "islamitische-identiteit-school", cat: "schoolkind", catLabel: "Schoolkind (6-10)", icon: "🏫", title: "Islamitische identiteit op een niet-islamitische school", desc: "Hoe help je je kind trots te zijn op zijn/haar islamitische identiteit in een seculiere schoolomgeving?", author: "Redactie", date: "10 jun 2024", readTime: "6 min" },
      { slug: "puberteit-islamitisch-perspectief", cat: "puber", catLabel: "Puber (10-12+)", icon: "🌙", title: "Puberteit vanuit islamitisch perspectief", desc: "De puberteit is een cruciale fase. Hoe begeleid je je kind door deze veranderingen met islamitische wijsheid?", author: "Redactie", date: "8 jun 2024", readTime: "9 min" },
      { slug: "tawbah-kinderen-leren", cat: "peuter", catLabel: "Peuter (2-4)", icon: "💚", title: "Kinderen leren om vergeving te vragen (tawbah)", desc: "Hoe leer je een jong kind dat fouten maken menselijk is, en dat Allaah altijd vergeeft als we oprecht berouw tonen?", author: "Redactie", date: "5 jun 2024", readTime: "5 min" },
      { slug: "schermtijd-islamitisch", cat: "ouders", catLabel: "Voor ouders", icon: "📱", title: "Schermtijd beperken: een islamitische benadering", desc: "De fitrah van het kind beschermen tegen schadelijke media. Praktische richtlijnen voor moslimgezinnen.", author: "Redactie", date: "3 jun 2024", readTime: "7 min" },
      { slug: "geduld-opvoeding", cat: "ouders", catLabel: "Voor ouders", icon: "🌿", title: "Sabr in de opvoeding: wanneer het moeilijk wordt", desc: "Opvoeden is een beproeving. Hoe bewaar je geduld als ouder, en wat zegt de Qur’aan hierover?", author: "Redactie", date: "1 jun 2024", readTime: "6 min" },
      { slug: "slaapritme-baby-islam", cat: "baby", catLabel: "Baby (0-2)", icon: "🌙", title: "Slaapritme en de adhkaar voor het slapen", desc: "Combineer een gezond slaapritme met de soennah-adhkaar voor het slapengaan. Tips per leeftijd.", author: "Redactie", date: "28 mei 2024", readTime: "5 min" },
      { slug: "broers-zussen-rechtvaardigheid", cat: "peuter", catLabel: "Peuter (2-4)", icon: "⚖️", title: "Rechtvaardigheid tussen broers en zussen", desc: "De profeet ﷺ waarschuwde voor onrechtvaardigheid tussen kinderen. Hoe pas je dit toe in de dagelijkse opvoeding?", author: "Redactie", date: "25 mei 2024", readTime: "6 min" },
    ],
    en: [
      { slug: "fitrah-bewaken", cat: "baby", catLabel: "Baby (0-2)", icon: "🌱", title: "Protecting your baby's fitrah: a practical guide", desc: "Every child is born upon the fitrah. Learn how to protect and nurture this pure nature in the first two years.", author: "Editorial", date: "Jun 24, 2024", readTime: "5 min" },
      { slug: "adhaan-bij-geboorte", cat: "baby", catLabel: "Baby (0-2)", icon: "🕌", title: "Whispering the adhaan at birth: sunnah and wisdom", desc: "The Prophet ﷺ taught us to whisper the adhaan in the newborn's ear. What is the wisdom behind this?", author: "Editorial", date: "Jun 20, 2024", readTime: "4 min" },
      { slug: "tahnik-aqiqah", cat: "baby", catLabel: "Baby (0-2)", icon: "🍯", title: "Tahnik and aqiqah: the first sunnah acts", desc: "A practical guide to performing tahnik and organizing the aqiqah according to the Sunnah.", author: "Editorial", date: "Jun 18, 2024", readTime: "6 min" },
      { slug: "salah-aanleren-kind", cat: "kleuter", catLabel: "Preschool (4-6)", icon: "🤲", title: "Teaching your child to pray: step by step", desc: "At what age do you start? How do you make it enjoyable? Practical tips based on the hadieth about prayer.", author: "Editorial", date: "Jun 15, 2024", readTime: "7 min" },
      { slug: "quran-memorisatie-kinderen", cat: "schoolkind", catLabel: "School-age (6-10)", icon: "📖", title: "Qur’aan memorization with children: methods that work", desc: "Proven methods to help your child memorize the Qur’aan, with attention to understanding and love.", author: "Editorial", date: "Jun 12, 2024", readTime: "8 min" },
      { slug: "islamitische-identiteit-school", cat: "schoolkind", catLabel: "School-age (6-10)", icon: "🏫", title: "Islamic identity in a non-Islamic school", desc: "How do you help your child be proud of their Islamic identity in a secular school environment?", author: "Editorial", date: "Jun 10, 2024", readTime: "6 min" },
      { slug: "puberteit-islamitisch-perspectief", cat: "puber", catLabel: "Pre-teen (10-12+)", icon: "🌙", title: "Puberty from an Islamic perspective", desc: "Puberty is a crucial phase. How do you guide your child through these changes with Islamic wisdom?", author: "Editorial", date: "Jun 8, 2024", readTime: "9 min" },
      { slug: "tawbah-kinderen-leren", cat: "peuter", catLabel: "Toddler (2-4)", icon: "💚", title: "Teaching children to seek forgiveness (tawbah)", desc: "How do you teach a young child that making mistakes is human, and that Allaah always forgives sincere repentance?", author: "Editorial", date: "Jun 5, 2024", readTime: "5 min" },
      { slug: "schermtijd-islamitisch", cat: "ouders", catLabel: "For parents", icon: "📱", title: "Limiting screen time: an Islamic approach", desc: "Protecting the child's fitrah from harmful media. Practical guidelines for Muslim families.", author: "Editorial", date: "Jun 3, 2024", readTime: "7 min" },
      { slug: "geduld-opvoeding", cat: "ouders", catLabel: "For parents", icon: "🌿", title: "Sabr in parenting: when it gets difficult", desc: "Parenting is a trial. How do you maintain patience as a parent, and what does the Qur’aan say about it?", author: "Editorial", date: "Jun 1, 2024", readTime: "6 min" },
      { slug: "slaapritme-baby-islam", cat: "baby", catLabel: "Baby (0-2)", icon: "🌙", title: "Sleep routine and the adhkar before sleeping", desc: "Combine a healthy sleep routine with the sunnah adhkar before bedtime. Tips by age group.", author: "Editorial", date: "May 28, 2024", readTime: "5 min" },
      { slug: "broers-zussen-rechtvaardigheid", cat: "peuter", catLabel: "Toddler (2-4)", icon: "⚖️", title: "Justice between siblings", desc: "The Prophet ﷺ warned against injustice between children. How do you apply this in daily parenting?", author: "Editorial", date: "May 25, 2024", readTime: "6 min" },
    ],
    ar: [
      { slug: "fitrah-bewaken", cat: "baby", catLabel: "رضيع (٠-٢)", icon: "🌱", title: "حماية فطرة طفلك: دليل عملي", desc: "كل طفل يولد على الفطرة. تعلم كيف تحمي وتغذي هذه الطبيعة النقية في أول سنتين من حياته.", author: "التحرير", date: "٢٤ يونيو ٢٠٢٤", readTime: "٥ دقائق" },
      { slug: "adhaan-bij-geboorte", cat: "baby", catLabel: "رضيع (٠-٢)", icon: "🕌", title: "الأذان في أذن المولود: سنة وحكمة", desc: "علمنا النبي ﷺ أن نؤذن في أذن المولود. ما الحكمة من ذلك؟", author: "التحرير", date: "٢٠ يونيو ٢٠٢٤", readTime: "٤ دقائق" },
      { slug: "tahnik-aqiqah", cat: "baby", catLabel: "رضيع (٠-٢)", icon: "🍯", title: "التحنيك والعقيقة: أول سنن الاستقبال", desc: "دليل عملي لأداء التحنيك وتنظيم العقيقة وفق السنة النبوية.", author: "التحرير", date: "١٨ يونيو ٢٠٢٤", readTime: "٦ دقائق" },
      { slug: "salah-aanleren-kind", cat: "kleuter", catLabel: "ما قبل المدرسة (٤-٦)", icon: "🤲", title: "تعليم طفلك الصلاة: خطوة بخطوة", desc: "من أي عمر تبدأ؟ كيف تجعلها ممتعة؟ نصائح عملية مبنية على حديث الصلاة.", author: "التحرير", date: "١٥ يونيو ٢٠٢٤", readTime: "٧ دقائق" },
      { slug: "quran-memorisatie-kinderen", cat: "schoolkind", catLabel: "سن المدرسة (٦-١٠)", icon: "📖", title: "حفظ القرآن مع الأطفال: طرق ناجحة", desc: "طرق مجربة لمساعدة طفلك على حفظ القرآن مع الاهتمام بالفهم والمحبة.", author: "التحرير", date: "١٢ يونيو ٢٠٢٤", readTime: "٨ دقائق" },
      { slug: "islamitische-identiteit-school", cat: "schoolkind", catLabel: "سن المدرسة (٦-١٠)", icon: "🏫", title: "الهوية الإسلامية في مدرسة غير إسلامية", desc: "كيف تساعد طفلك على الاعتزاز بهويته الإسلامية في بيئة مدرسية علمانية؟", author: "التحرير", date: "١٠ يونيو ٢٠٢٤", readTime: "٦ دقائق" },
      { slug: "puberteit-islamitisch-perspectief", cat: "puber", catLabel: "ما قبل المراهقة (١٠-١٢+)", icon: "🌙", title: "البلوغ من منظور إسلامي", desc: "البلوغ مرحلة حاسمة. كيف توجه طفلك خلال هذه التغييرات بالحكمة الإسلامية؟", author: "التحرير", date: "٨ يونيو ٢٠٢٤", readTime: "٩ دقائق" },
      { slug: "tawbah-kinderen-leren", cat: "peuter", catLabel: "طفل صغير (٢-٤)", icon: "💚", title: "تعليم الأطفال الاستغفار والتوبة", desc: "كيف تعلم طفلاً صغيراً أن الخطأ بشري وأن الله يغفر دائماً لمن تاب توبة صادقة؟", author: "التحرير", date: "٥ يونيو ٢٠٢٤", readTime: "٥ دقائق" },
      { slug: "schermtijd-islamitisch", cat: "ouders", catLabel: "للوالدين", icon: "📱", title: "تقليل وقت الشاشة: منهج إسلامي", desc: "حماية فطرة الطفل من الإعلام الضار. إرشادات عملية للأسر المسلمة.", author: "التحرير", date: "٣ يونيو ٢٠٢٤", readTime: "٧ دقائق" },
      { slug: "geduld-opvoeding", cat: "ouders", catLabel: "للوالدين", icon: "🌿", title: "الصبر في التربية: عندما يصعب الأمر", desc: "التربية ابتلاء. كيف تحافظ على صبرك كوالد، وماذا يقول القرآن عن ذلك؟", author: "التحرير", date: "١ يونيو ٢٠٢٤", readTime: "٦ دقائق" },
      { slug: "slaapritme-baby-islam", cat: "baby", catLabel: "رضيع (٠-٢)", icon: "🌙", title: "نظام النوم وأذكار ما قبل النوم", desc: "اجمع بين نظام نوم صحي وأذكار السنة قبل النوم. نصائح حسب الفئة العمرية.", author: "التحرير", date: "٢٨ مايو ٢٠٢٤", readTime: "٥ دقائق" },
      { slug: "broers-zussen-rechtvaardigheid", cat: "peuter", catLabel: "طفل صغير (٢-٤)", icon: "⚖️", title: "العدل بين الإخوة", desc: "حذر النبي ﷺ من الظلم بين الأولاد. كيف تطبق ذلك في التربية اليومية؟", author: "التحرير", date: "٢٥ مايو ٢٠٢٤", readTime: "٦ دقائق" },
    ],
  };
  return articles[lang] || articles.nl;
}

// ============ PAGE GENERATORS ============

function generateHomePage(lang: string): string {
  const nav = getNavigation(lang);
  const articles = getArticles(lang);
  const isRTL = lang === "ar";

  const t = {
    nl: {
      heroTitle: "Islamitische opvoeding<br>met wijsheid en kennis",
      heroDesc: "Het complete platform voor moslimouders. Artikelen, tools en persoonlijk advies gebaseerd op de Qur’aan, Soennah en de werken van de geleerden.",
      heroCta: "Download de app",
      newArticles: "Nieuwe artikelen",
      viewAll: "Bekijk alles",
      popularTools: "Populaire tools",
      ourExperts: "Onze experts",
      hadith: "\"Elk van jullie is een herder en elk van jullie is verantwoordelijk voor zijn kudde.\"",
      hadithSource: "Overgeleverd door al-Bukhaaree en Muslim",
      newsletterTitle: "Wekelijkse opvoedtips",
      newsletterDesc: "Ontvang elke week islamitische opvoedtips in uw inbox.",
      subscribe: "Aanmelden",
      emailPlaceholder: "Uw e-mailadres",
      appTitle: "Download de Opvoedadvies app",
      appDesc: "Persoonlijk advies, weekdoelen, gebedstijden en meer — altijd bij de hand.",
      forParents: "Voor ouders",
      ageGroups: "Per leeftijd",
      readMore: "Lees meer →",
    },
    en: {
      heroTitle: "Islamic parenting<br>with wisdom and knowledge",
      heroDesc: "The complete platform for Muslim parents. Articles, tools and personalized advice based on the Qur’aan, Sunnah and the works of scholars.",
      heroCta: "Download the app",
      newArticles: "New articles",
      viewAll: "View all",
      popularTools: "Popular tools",
      ourExperts: "Our experts",
      hadith: "\"Each of you is a shepherd and each of you is responsible for his flock.\"",
      hadithSource: "Narrated by al-Bukhari and Muslim",
      newsletterTitle: "Weekly parenting tips",
      newsletterDesc: "Receive Islamic parenting tips in your inbox every week.",
      subscribe: "Subscribe",
      emailPlaceholder: "Your email address",
      appTitle: "Download the Opvoedadvies app",
      appDesc: "Personal advice, weekly goals, prayer times and more — always at hand.",
      forParents: "For parents",
      ageGroups: "By age",
      readMore: "Read more →",
    },
    ar: {
      heroTitle: "التربية الإسلامية<br>بالحكمة والعلم",
      heroDesc: "المنصة الشاملة للآباء المسلمين. مقالات وأدوات ونصائح شخصية مبنية على القرآن والسنة وأعمال العلماء.",
      heroCta: "حمّل التطبيق",
      newArticles: "مقالات جديدة",
      viewAll: "عرض الكل",
      popularTools: "أدوات مفيدة",
      ourExperts: "خبراؤنا",
      hadith: "\"كلكم راعٍ وكلكم مسؤول عن رعيته\"",
      hadithSource: "رواه البخاري ومسلم",
      newsletterTitle: "نصائح تربوية أسبوعية",
      newsletterDesc: "احصل على نصائح تربوية إسلامية في بريدك كل أسبوع.",
      subscribe: "اشترك",
      emailPlaceholder: "بريدك الإلكتروني",
      appTitle: "حمّل تطبيق نصائح التربية",
      appDesc: "نصائح شخصية، أهداف أسبوعية، أوقات الصلاة والمزيد — دائماً في متناول يدك.",
      forParents: "للوالدين",
      ageGroups: "حسب العمر",
      readMore: "← اقرأ المزيد",
    },
  };
  const text = t[lang as keyof typeof t] || t.nl;

  const featuredArticle = articles[0];
  const recentArticles = articles.slice(1, 7);

  const heroCards = [
    { icon: "🕌", title: lang === 'ar' ? 'أوقات الصلاة' : lang === 'en' ? 'Prayer Times' : 'Gebedstijden', desc: lang === 'ar' ? 'حسب موقعك' : lang === 'en' ? 'Based on location' : 'Op basis van locatie' },
    { icon: "📖", title: lang === 'ar' ? 'أهداف أسبوعية' : lang === 'en' ? 'Weekly Goals' : 'Weekdoelen', desc: lang === 'ar' ? 'مع أحاديث' : lang === 'en' ? 'With hadieth' : 'Met hadieth' },
    { icon: "🎯", title: lang === 'ar' ? 'نصائح شخصية' : lang === 'en' ? 'Personal Advice' : 'Persoonlijk advies', desc: lang === 'ar' ? 'لعائلتك' : lang === 'en' ? 'For your family' : 'Voor uw gezin' },
    { icon: "👨‍👩‍👧‍👦", title: lang === 'ar' ? 'نظام عائلي' : lang === 'en' ? 'Family System' : 'Gezinssysteem', desc: lang === 'ar' ? 'تعاون مع شريكك' : lang === 'en' ? 'Collaborate' : 'Samenwerken' },
  ];

  const tools = [
    { icon: "🕌", title: lang === 'ar' ? 'حاسبة أوقات الصلاة' : lang === 'en' ? 'Prayer Time Calculator' : 'Gebedstijden berekenen', desc: lang === 'ar' ? 'حسب موقعك' : lang === 'en' ? 'Based on location' : 'Op basis van locatie' },
    { icon: "📅", title: lang === 'ar' ? 'التقويم الهجري' : lang === 'en' ? 'Hijri Calendar' : 'Hijri kalender', desc: lang === 'ar' ? 'مع المناسبات' : lang === 'en' ? 'With events' : 'Met evenementen' },
    { icon: "📊", title: lang === 'ar' ? 'متتبع التقدم' : lang === 'en' ? 'Progress Tracker' : 'Voortgang bijhouden', desc: lang === 'ar' ? 'أهداف الأسبوع' : lang === 'en' ? 'Weekly goals' : 'Weekdoelen' },
    { icon: "🧒", title: lang === 'ar' ? 'حاسبة العمر' : lang === 'en' ? 'Age Calculator' : 'Leeftijd berekenen', desc: lang === 'ar' ? 'سنوات وأشهر' : lang === 'en' ? 'Years & months' : 'Jaren & maanden' },
    { icon: "📝", title: lang === 'ar' ? 'خطة تربوية' : lang === 'en' ? 'Parenting Plan' : 'Opvoedplan', desc: lang === 'ar' ? 'مخصصة لطفلك' : lang === 'en' ? 'For your child' : 'Voor uw kind' },
    { icon: "🤲", title: lang === 'ar' ? 'أذكار الأطفال' : lang === 'en' ? 'Kids Adhkar' : 'Adhkaar voor kinderen', desc: lang === 'ar' ? 'صباح ومساء' : lang === 'en' ? 'Morning & evening' : 'Ochtend & avond' },
  ];

  const content = `
  <!-- HERO -->
  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <div>
          <h2>${text.heroTitle}</h2>
          <p>${text.heroDesc}</p>
          <a href="#download" class="hero-cta">📱 ${text.heroCta}</a>
        </div>
        <div class="hero-featured">
          ${heroCards.map(c => `<div class="hero-card"><h4>${c.icon} ${c.title}</h4><p>${c.desc}</p></div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  <!-- HADITH BANNER -->
  <div class="container">
    <div class="hadith-banner">
      <p class="hadith-text">${text.hadith}</p>
      <p class="hadith-source">${text.hadithSource}</p>
    </div>
  </div>

  <!-- FEATURED ARTICLE -->
  <section class="section">
    <div class="container">
      <div class="section-header">
        <h2>${text.newArticles}</h2>
        <a href="/site/categorie/alle?lang=${lang}">${text.viewAll} →</a>
      </div>

      <a href="/site/artikel/${featuredArticle.slug}?lang=${lang}" class="featured-article" style="text-decoration:none;color:inherit;">
        <div class="featured-thumb">${featuredArticle.icon}</div>
        <div class="featured-body">
          <span class="category-badge">${featuredArticle.catLabel}</span>
          <h3>${featuredArticle.title}</h3>
          <p>${featuredArticle.desc}</p>
          <div class="article-meta" style="border:none;padding:0;margin-top:16px;">
            <span>${featuredArticle.author} · ${featuredArticle.date}</span>
            <span>${featuredArticle.readTime}</span>
          </div>
        </div>
      </a>

      <!-- ARTICLE GRID -->
      <div class="articles-grid">
        ${recentArticles.map(a => `
        <a href="/site/artikel/${a.slug}?lang=${lang}" class="article-card" style="text-decoration:none;color:inherit;">
          <div class="article-thumb">
            ${a.icon}
            <span class="category-badge">${a.catLabel}</span>
          </div>
          <div class="article-body">
            <h3>${a.title}</h3>
            <p>${a.desc}</p>
            <div class="article-meta">
              <span>${a.author}</span>
              <span>${a.readTime}</span>
            </div>
          </div>
        </a>`).join('')}
      </div>
    </div>
  </section>

  <!-- TOOLS -->
  <section class="section" style="background: var(--green-50);">
    <div class="container">
      <div class="section-header">
        <h2>${text.popularTools}</h2>
        <a href="/site/tools?lang=${lang}">${text.viewAll} →</a>
      </div>
      <div class="tools-grid">
        ${tools.map(t => `
        <a href="/site/tools?lang=${lang}" class="tool-card" style="text-decoration:none;color:inherit;">
          <div class="tool-icon">${t.icon}</div>
          <h4>${t.title}</h4>
          <p>${t.desc}</p>
        </a>`).join('')}
      </div>
    </div>
  </section>

  <!-- APP DOWNLOAD -->
  <section class="section">
    <div class="container">
      <div class="app-banner" id="download">
        <div class="app-banner-icon">🌿</div>
        <div class="app-banner-text">
          <h3>${text.appTitle}</h3>
          <p>${text.appDesc}</p>
          <div class="app-banner-btns">
            <a href="#" class="app-btn">🍎 App Store</a>
            <a href="#" class="app-btn">▶️ Google Play</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- NEWSLETTER -->
  <section class="section">
    <div class="container">
      <div class="newsletter-section">
        <h2>${text.newsletterTitle}</h2>
        <p>${text.newsletterDesc}</p>
        <form class="newsletter-form" onsubmit="handleSubscribe(event)">
          <input type="email" placeholder="${text.emailPlaceholder}" required>
          <button type="submit">${text.subscribe}</button>
        </form>
        <p id="sub-msg" style="margin-top:12px;font-size:0.85rem;display:none;"></p>
      </div>
    </div>
  </section>

  <script>
    async function handleSubscribe(e) {
      e.preventDefault();
      const email = e.target.querySelector('input').value;
      const msg = document.getElementById('sub-msg');
      msg.textContent = '✓ ${lang === "ar" ? "تم الاشتراك بنجاح!" : lang === "en" ? "Successfully subscribed!" : "Succesvol aangemeld!"}';
      msg.style.display = 'block';
      e.target.reset();
    }
  </script>`;

  return baseLayout(lang, nav.home, content, 'home');
}

function generateCategoryPage(lang: string, slug: string): string {
  const nav = getNavigation(lang);
  const articles = getArticles(lang);
  const filtered = slug === 'alle' ? articles : articles.filter(a => a.cat === slug);
  const catName = slug === 'alle' ? (lang === 'ar' ? 'جميع المقالات' : lang === 'en' ? 'All articles' : 'Alle artikelen') :
    (nav as any)[slug] || slug;

  const content = `
  <section class="section">
    <div class="container">
      <div class="section-header">
        <h2>${catName}</h2>
      </div>
      <div class="category-pills">
        <a href="/site/categorie/alle?lang=${lang}" class="pill ${slug === 'alle' ? 'active' : ''}"><span class="pill-icon">📚</span> ${lang === 'ar' ? 'الكل' : lang === 'en' ? 'All' : 'Alles'}</a>
        <a href="/site/categorie/baby?lang=${lang}" class="pill ${slug === 'baby' ? 'active' : ''}"><span class="pill-icon">👶</span> ${nav.baby}</a>
        <a href="/site/categorie/peuter?lang=${lang}" class="pill ${slug === 'peuter' ? 'active' : ''}"><span class="pill-icon">🧒</span> ${nav.peuter}</a>
        <a href="/site/categorie/kleuter?lang=${lang}" class="pill ${slug === 'kleuter' ? 'active' : ''}"><span class="pill-icon">🎨</span> ${nav.kleuter}</a>
        <a href="/site/categorie/schoolkind?lang=${lang}" class="pill ${slug === 'schoolkind' ? 'active' : ''}"><span class="pill-icon">📖</span> ${nav.schoolkind}</a>
        <a href="/site/categorie/puber?lang=${lang}" class="pill ${slug === 'puber' ? 'active' : ''}"><span class="pill-icon">🌙</span> ${nav.puber}</a>
        <a href="/site/categorie/ouders?lang=${lang}" class="pill ${slug === 'ouders' ? 'active' : ''}"><span class="pill-icon">👨‍👩‍👧</span> ${nav.ouders}</a>
      </div>
      ${filtered.length > 0 ? `
      <div class="articles-grid">
        ${filtered.map(a => `
        <a href="/site/artikel/${a.slug}?lang=${lang}" class="article-card" style="text-decoration:none;color:inherit;">
          <div class="article-thumb">
            ${a.icon}
            <span class="category-badge">${a.catLabel}</span>
          </div>
          <div class="article-body">
            <h3>${a.title}</h3>
            <p>${a.desc}</p>
            <div class="article-meta">
              <span>${a.author}</span>
              <span>${a.readTime}</span>
            </div>
          </div>
        </a>`).join('')}
      </div>` : `<p style="text-align:center;color:var(--text-muted);padding:60px 0;">${lang === 'ar' ? 'لا توجد مقالات في هذه الفئة بعد.' : lang === 'en' ? 'No articles in this category yet.' : 'Nog geen artikelen in deze categorie.'}</p>`}
    </div>
  </section>`;

  return baseLayout(lang, catName, content, slug);
}

function generateArticlePage(lang: string, slug: string): string {
  const articles = getArticles(lang);
  const article = articles.find(a => a.slug === slug) || articles[0];

  const sampleContent = lang === 'ar' ?
    `<p>بسم الله الرحمن الرحيم، والصلاة والسلام على رسول الله ﷺ.</p>
    <p>التربية الإسلامية تقوم على أسس ثابتة من الكتاب والسنة. في هذا المقال نتناول موضوعاً مهماً يتعلق بتربية أبنائنا وفق المنهج الرباني.</p>
    <h3>المبدأ الأساسي</h3>
    <p>قال الله تعالى: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا قُوا أَنفُسَكُمْ وَأَهْلِيكُمْ نَارًا﴾ [التحريم: ٦]. هذه الآية تبين مسؤولية الوالدين في حماية أسرهم.</p>
    <h3>التطبيق العملي</h3>
    <p>من أهم ما يمكن للوالدين فعله هو القدوة الحسنة. فالطفل يتعلم بالمشاهدة أكثر مما يتعلم بالكلام. وقد كان النبي ﷺ أحسن الناس خلقاً وأرفقهم بالأطفال.</p>
    <blockquote style="border-right:4px solid var(--gold);padding:16px 24px;margin:24px 0;background:var(--gold-light);border-radius:8px;">
      <p style="font-style:italic;margin:0;">قال رسول الله ﷺ: «ليس منا من لم يرحم صغيرنا ويعرف حق كبيرنا»</p>
      <cite style="font-size:0.85rem;color:var(--text-muted);display:block;margin-top:8px;">رواه أبو داود والترمذي</cite>
    </blockquote>
    <h3>نصائح عملية</h3>
    <ul>
      <li>ابدأ بنفسك: كن القدوة التي تريد أن يكون عليها طفلك</li>
      <li>استخدم اللطف والرفق في التوجيه</li>
      <li>اجعل العبادة محببة وليست عقوبة</li>
      <li>ادعُ لأبنائك كما كان يفعل الأنبياء</li>
      <li>تعلم العلم الشرعي لتربي على بصيرة</li>
    </ul>` :
    lang === 'en' ?
    `<p>In the name of Allaah, the Most Merciful, and peace and blessings be upon the Messenger of Allaah ﷺ.</p>
    <p>Islamic parenting is built on firm foundations from the Book and the Sunnah. In this article, we address an important topic related to raising our children according to the divine methodology.</p>
    <h3>The Core Principle</h3>
    <p>Allaah says: "O you who believe, protect yourselves and your families from a Fire" [At-Tahrim: 6]. This verse clarifies the responsibility of parents in protecting their families.</p>
    <h3>Practical Application</h3>
    <p>One of the most important things parents can do is set a good example. Children learn by observation more than by words. The Prophet ﷺ was the best of people in character and the gentlest with children.</p>
    <blockquote style="border-left:4px solid var(--gold);padding:16px 24px;margin:24px 0;background:var(--gold-light);border-radius:8px;">
      <p style="font-style:italic;margin:0;">The Messenger of Allaah ﷺ said: "He is not one of us who does not show mercy to our young ones and recognize the rights of our elders."</p>
      <cite style="font-size:0.85rem;color:var(--text-muted);display:block;margin-top:8px;">Narrated by Abu Dawud and at-Tirmidhi</cite>
    </blockquote>
    <h3>Practical Tips</h3>
    <ul>
      <li>Start with yourself: be the role model you want your child to follow</li>
      <li>Use gentleness and kindness in guidance</li>
      <li>Make worship beloved, not a punishment</li>
      <li>Make du'a for your children as the prophets used to do</li>
      <li>Seek Islamic knowledge to parent with insight</li>
    </ul>` :
    `<p>In de naam van Allaah, de Meest Barmhartige, en vrede en zegeningen zij met de Boodschapper van Allaah ﷺ.</p>
    <p>Islamitische opvoeding is gebouwd op stevige fundamenten uit het Boek en de Soennah. In dit artikel behandelen we een belangrijk onderwerp met betrekking tot het opvoeden van onze kinderen volgens de goddelijke methodologie.</p>
    <h3>Het kernprincipe</h3>
    <p>Allaah zegt: "O jullie die geloven, bescherm jullie zelf en jullie gezinnen tegen een Vuur" [At-Tahriem: 6]. Dit vers verduidelijkt de verantwoordelijkheid van ouders bij het beschermen van hun gezinnen.</p>
    <h3>Praktische toepassing</h3>
    <p>Een van de belangrijkste dingen die ouders kunnen doen is het goede voorbeeld geven. Kinderen leren door observatie meer dan door woorden. De Profeet ﷺ was de beste van de mensen in karakter en de zachtaardigste met kinderen.</p>
    <blockquote style="border-left:4px solid var(--gold);padding:16px 24px;margin:24px 0;background:var(--gold-light);border-radius:8px;">
      <p style="font-style:italic;margin:0;">De Boodschapper van Allaah ﷺ zei: "Hij hoort niet bij ons die geen barmhartigheid toont aan onze jongeren en het recht van onze ouderen niet erkent."</p>
      <cite style="font-size:0.85rem;color:var(--text-muted);display:block;margin-top:8px;">Overgeleverd door Aboe Daawoed en at-Tirmidhie</cite>
    </blockquote>
    <h3>Praktische tips</h3>
    <ul>
      <li>Begin bij jezelf: wees het rolmodel dat je wilt dat je kind volgt</li>
      <li>Gebruik zachtheid en vriendelijkheid bij het begeleiden</li>
      <li>Maak aanbidding geliefd, geen straf</li>
      <li>Maak du'aa voor je kinderen zoals de profeten deden</li>
      <li>Zoek islamitische kennis om met inzicht op te voeden</li>
    </ul>`;

  const content = `
  <section class="section">
    <div class="container" style="max-width:800px;">
      <a href="/site/categorie/${article.cat}?lang=${lang}" class="category-badge" style="display:inline-block;background:var(--green-100);color:var(--green-800);padding:6px 16px;border-radius:20px;font-size:0.8rem;font-weight:600;margin-bottom:16px;">${article.catLabel}</a>
      <h1 style="font-size:2rem;font-weight:800;line-height:1.3;margin-bottom:16px;">${article.title}</h1>
      <div style="display:flex;gap:16px;align-items:center;color:var(--text-muted);font-size:0.85rem;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--border);">
        <span>${article.author}</span>
        <span>·</span>
        <span>${article.date}</span>
        <span>·</span>
        <span>${article.readTime}</span>
      </div>
      <div style="font-size:1.05rem;line-height:1.8;color:var(--text);">
        ${sampleContent}
      </div>
      <div style="margin-top:48px;padding-top:24px;border-top:1px solid var(--border);">
        <h3 style="margin-bottom:16px;">${lang === 'ar' ? 'مقالات ذات صلة' : lang === 'en' ? 'Related articles' : 'Gerelateerde artikelen'}</h3>
        <div class="articles-grid">
          ${articles.filter(a => a.slug !== slug).slice(0, 3).map(a => `
          <a href="/site/artikel/${a.slug}?lang=${lang}" class="article-card" style="text-decoration:none;color:inherit;">
            <div class="article-thumb" style="height:120px;">
              ${a.icon}
              <span class="category-badge">${a.catLabel}</span>
            </div>
            <div class="article-body">
              <h3 style="font-size:0.9rem;">${a.title}</h3>
            </div>
          </a>`).join('')}
        </div>
      </div>
    </div>
  </section>`;

  return baseLayout(lang, article.title, content, article.cat);
}

function generateAboutPage(lang: string): string {
  const t = {
    nl: { title: "Over ons", p1: "Opvoedadvies is een platform opgericht door moslimouders, voor moslimouders. Ons doel is om islamitische opvoeding toegankelijk, praktisch en wetenschappelijk onderbouwd te maken.", p2: "Wij baseren al onze content op de Qur’aan, authentieke Soennah en de werken van erkende geleerden. Geen meningen, maar bewijs.", p3: "Ons team bestaat uit pedagogen, islamitische wetenschappers en ervaren ouders die samen werken aan de beste tools en content voor uw gezin." },
    en: { title: "About us", p1: "Opvoedadvies is a platform founded by Muslim parents, for Muslim parents. Our goal is to make Islamic parenting accessible, practical and scientifically grounded.", p2: "We base all our content on the Qur’aan, authentic Sunnah and the works of recognized scholars. No opinions, but evidence.", p3: "Our team consists of educators, Islamic scholars and experienced parents working together on the best tools and content for your family." },
    ar: { title: "من نحن", p1: "نصائح التربية منصة أسسها آباء مسلمون، لآباء مسلمين. هدفنا جعل التربية الإسلامية متاحة وعملية ومبنية على أسس علمية.", p2: "نبني كل محتوانا على القرآن والسنة الصحيحة وأعمال العلماء المعتبرين. لا آراء، بل أدلة.", p3: "يتكون فريقنا من تربويين وعلماء شرعيين وآباء ذوي خبرة يعملون معاً على أفضل الأدوات والمحتوى لأسرتك." },
  };
  const text = t[lang as keyof typeof t] || t.nl;

  const content = `
  <section class="section">
    <div class="container" style="max-width:800px;">
      <h1 style="font-size:2rem;font-weight:800;margin-bottom:24px;">${text.title}</h1>
      <p style="font-size:1.1rem;line-height:1.8;margin-bottom:20px;">${text.p1}</p>
      <p style="font-size:1.1rem;line-height:1.8;margin-bottom:20px;">${text.p2}</p>
      <p style="font-size:1.1rem;line-height:1.8;">${text.p3}</p>
    </div>
  </section>`;

  return baseLayout(lang, text.title, content, 'overOns');
}

function generateToolsPage(lang: string): string {
  const title = lang === 'ar' ? 'الأدوات' : lang === 'en' ? 'Tools' : 'Tools';
  const tools = [
    { icon: "🕌", title: lang === 'ar' ? 'حاسبة أوقات الصلاة' : lang === 'en' ? 'Prayer Time Calculator' : 'Gebedstijden berekenen', desc: lang === 'ar' ? 'احسب أوقات الصلاة لمدينتك' : lang === 'en' ? 'Calculate prayer times for your city' : 'Bereken gebedstijden voor uw stad' },
    { icon: "📅", title: lang === 'ar' ? 'التقويم الهجري' : lang === 'en' ? 'Hijri Calendar' : 'Hijri kalender', desc: lang === 'ar' ? 'تقويم هجري مع المناسبات الإسلامية' : lang === 'en' ? 'Hijri calendar with Islamic events' : 'Hijri kalender met islamitische evenementen' },
    { icon: "📊", title: lang === 'ar' ? 'متتبع التقدم الأسبوعي' : lang === 'en' ? 'Weekly Progress Tracker' : 'Wekelijkse voortgang', desc: lang === 'ar' ? 'تابع أهدافك التربوية الأسبوعية' : lang === 'en' ? 'Track your weekly parenting goals' : 'Houd uw wekelijkse opvoeddoelen bij' },
    { icon: "🧒", title: lang === 'ar' ? 'حاسبة العمر الدقيقة' : lang === 'en' ? 'Exact Age Calculator' : 'Exacte leeftijd berekenen', desc: lang === 'ar' ? 'احسب عمر طفلك بالسنوات والأشهر' : lang === 'en' ? 'Calculate your childs exact age' : 'Bereken de exacte leeftijd van uw kind' },
    { icon: "📝", title: lang === 'ar' ? 'مولد خطة التربية' : lang === 'en' ? 'Parenting Plan Generator' : 'Opvoedplan generator', desc: lang === 'ar' ? 'خطة تربوية مخصصة لعائلتك' : lang === 'en' ? 'Custom parenting plan for your family' : 'Aangepast opvoedplan voor uw gezin' },
    { icon: "🤲", title: lang === 'ar' ? 'أذكار الأطفال' : lang === 'en' ? 'Kids Adhkar Collection' : 'Adhkaar voor kinderen', desc: lang === 'ar' ? 'أذكار الصباح والمساء للأطفال' : lang === 'en' ? 'Morning and evening adhkar for kids' : 'Ochtend- en avondadhkaar voor kinderen' },
    { icon: "🎯", title: lang === 'ar' ? 'اختبار أسلوب التربية' : lang === 'en' ? 'Parenting Style Quiz' : 'Opvoedstijl test', desc: lang === 'ar' ? 'اكتشف أسلوبك التربوي' : lang === 'en' ? 'Discover your parenting style' : 'Ontdek uw opvoedstijl' },
    { icon: "📖", title: lang === 'ar' ? 'دليل أسماء الأطفال' : lang === 'en' ? 'Baby Names Guide' : 'Babynamen gids', desc: lang === 'ar' ? 'أسماء إسلامية مع معانيها' : lang === 'en' ? 'Islamic names with meanings' : 'Islamitische namen met betekenissen' },
  ];

  const content = `
  <section class="section">
    <div class="container">
      <div class="section-header"><h2>${title}</h2></div>
      <p style="color:var(--text-muted);margin-bottom:32px;font-size:1rem;">${lang === 'ar' ? 'أدوات عملية لمساعدتك في رحلة التربية الإسلامية. متوفرة في التطبيق.' : lang === 'en' ? 'Practical tools to help you on your Islamic parenting journey. Available in the app.' : 'Praktische tools om u te helpen op uw islamitische opvoedingsreis. Beschikbaar in de app.'}</p>
      <div class="tools-grid">
        ${tools.map(t => `
        <div class="tool-card">
          <div class="tool-icon">${t.icon}</div>
          <h4>${t.title}</h4>
          <p>${t.desc}</p>
        </div>`).join('')}
      </div>
      <div class="app-banner" style="margin-top:48px;">
        <div class="app-banner-icon">🌿</div>
        <div class="app-banner-text">
          <h3>${lang === 'ar' ? 'جميع الأدوات متوفرة في التطبيق' : lang === 'en' ? 'All tools available in the app' : 'Alle tools beschikbaar in de app'}</h3>
          <p>${lang === 'ar' ? 'حمّل التطبيق للوصول لجميع الأدوات والمزيد' : lang === 'en' ? 'Download the app to access all tools and more' : 'Download de app voor toegang tot alle tools en meer'}</p>
          <div class="app-banner-btns">
            <a href="#" class="app-btn">🍎 App Store</a>
            <a href="#" class="app-btn">▶️ Google Play</a>
          </div>
        </div>
      </div>
    </div>
  </section>`;

  return baseLayout(lang, title, content, 'tools');
}

function generateExpertsPage(lang: string): string {
  const title = lang === 'ar' ? 'خبراؤنا' : lang === 'en' ? 'Our Experts' : 'Onze experts';
  const experts = [
    { icon: "📚", name: lang === 'ar' ? 'فريق المحتوى الشرعي' : lang === 'en' ? 'Islamic Content Team' : 'Islamitisch content team', role: lang === 'ar' ? 'علوم شرعية' : lang === 'en' ? 'Islamic Sciences' : 'Islamitische wetenschappen', desc: lang === 'ar' ? 'فريق متخصص في العلوم الشرعية يراجع كل المحتوى لضمان صحته' : lang === 'en' ? 'A team specialized in Islamic sciences reviews all content for accuracy' : 'Een team gespecialiseerd in islamitische wetenschappen controleert alle content op juistheid' },
    { icon: "🎓", name: lang === 'ar' ? 'فريق التربية' : lang === 'en' ? 'Education Team' : 'Pedagogisch team', role: lang === 'ar' ? 'تربية وتعليم' : lang === 'en' ? 'Education & Pedagogy' : 'Opvoeding & pedagogiek', desc: lang === 'ar' ? 'تربويون ذوو خبرة يجمعون بين العلم الشرعي والتربوي الحديث' : lang === 'en' ? 'Experienced educators combining Islamic and modern pedagogical knowledge' : 'Ervaren pedagogen die islamitische en moderne pedagogische kennis combineren' },
    { icon: "👨‍👩‍👧", name: lang === 'ar' ? 'مستشارو الأسرة' : lang === 'en' ? 'Family Counselors' : 'Gezinsadviseurs', role: lang === 'ar' ? 'استشارات أسرية' : lang === 'en' ? 'Family Counseling' : 'Gezinsbegeleiding', desc: lang === 'ar' ? 'متخصصون في الإرشاد الأسري الإسلامي مع خبرة عملية واسعة' : lang === 'en' ? 'Specialists in Islamic family counseling with extensive practical experience' : 'Specialisten in islamitische gezinsbegeleiding met uitgebreide praktijkervaring' },
    { icon: "🧠", name: lang === 'ar' ? 'فريق علم النفس' : lang === 'en' ? 'Psychology Team' : 'Psychologie team', role: lang === 'ar' ? 'علم نفس الطفل' : lang === 'en' ? 'Child Psychology' : 'Kinderpsychologie', desc: lang === 'ar' ? 'أخصائيون نفسيون يفهمون تطور الطفل من منظور إسلامي' : lang === 'en' ? 'Psychologists who understand child development from an Islamic perspective' : 'Psychologen die kinderontwikkeling begrijpen vanuit islamitisch perspectief' },
  ];

  const content = `
  <section class="section">
    <div class="container">
      <div class="section-header"><h2>${title}</h2></div>
      <p style="color:var(--text-muted);margin-bottom:32px;font-size:1rem;">${lang === 'ar' ? 'فريقنا من الخبراء يضمن أن كل محتوى مبني على علم صحيح وتجربة عملية.' : lang === 'en' ? 'Our team of experts ensures all content is based on sound knowledge and practical experience.' : 'Ons team van experts zorgt ervoor dat alle content gebaseerd is op correcte kennis en praktijkervaring.'}</p>
      <div class="experts-grid">
        ${experts.map(e => `
        <div class="expert-card">
          <div class="expert-avatar">${e.icon}</div>
          <h4>${e.name}</h4>
          <p class="expert-role">${e.role}</p>
          <p>${e.desc}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>`;

  return baseLayout(lang, title, content, 'experts');
}

function generateContactPage(lang: string): string {
  const title = lang === 'ar' ? 'اتصل بنا' : lang === 'en' ? 'Contact' : 'Contact';
  const content = `
  <section class="section">
    <div class="container" style="max-width:600px;">
      <h1 style="font-size:2rem;font-weight:800;margin-bottom:24px;">${title}</h1>
      <p style="margin-bottom:32px;color:var(--text-muted);">${lang === 'ar' ? 'لديك سؤال أو اقتراح؟ تواصل معنا.' : lang === 'en' ? 'Have a question or suggestion? Get in touch.' : 'Heeft u een vraag of suggestie? Neem contact op.'}</p>
      <form style="display:flex;flex-direction:column;gap:16px;">
        <input type="text" placeholder="${lang === 'ar' ? 'الاسم' : lang === 'en' ? 'Name' : 'Naam'}" style="padding:14px 20px;border:1px solid var(--border);border-radius:12px;font-size:1rem;outline:none;">
        <input type="email" placeholder="${lang === 'ar' ? 'البريد الإلكتروني' : lang === 'en' ? 'Email' : 'E-mail'}" style="padding:14px 20px;border:1px solid var(--border);border-radius:12px;font-size:1rem;outline:none;">
        <textarea rows="5" placeholder="${lang === 'ar' ? 'رسالتك' : lang === 'en' ? 'Your message' : 'Uw bericht'}" style="padding:14px 20px;border:1px solid var(--border);border-radius:12px;font-size:1rem;outline:none;resize:vertical;"></textarea>
        <button type="submit" style="background:var(--green-800);color:white;border:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:1rem;cursor:pointer;">${lang === 'ar' ? 'إرسال' : lang === 'en' ? 'Send' : 'Versturen'}</button>
      </form>
    </div>
  </section>`;

  return baseLayout(lang, title, content);
}

function generatePrivacyPage(lang: string): string {
  const title = lang === 'ar' ? 'سياسة الخصوصية' : lang === 'en' ? 'Privacy Policy' : 'Privacybeleid';
  const content = `
  <section class="section">
    <div class="container" style="max-width:800px;">
      <h1 style="font-size:2rem;font-weight:800;margin-bottom:24px;">${title}</h1>
      <div style="line-height:1.8;color:var(--text);">
        <p style="margin-bottom:16px;">${lang === 'ar' ? 'آخر تحديث: يونيو ٢٠٢٤' : lang === 'en' ? 'Last updated: June 2024' : 'Laatst bijgewerkt: juni 2024'}</p>
        <h3 style="margin:24px 0 12px;">${lang === 'ar' ? '١. جمع البيانات' : lang === 'en' ? '1. Data Collection' : '1. Gegevensverzameling'}</h3>
        <p style="margin-bottom:16px;">${lang === 'ar' ? 'نجمع فقط البيانات التي تقدمها طوعاً: الاسم والبريد الإلكتروني ومعلومات الأسرة وتفضيلات التطبيق.' : lang === 'en' ? 'We only collect data you voluntarily provide: name, email, family information and app preferences.' : 'Wij verzamelen alleen gegevens die u vrijwillig verstrekt: naam, e-mailadres, gezinsinformatie en app-voorkeuren.'}</p>
        <h3 style="margin:24px 0 12px;">${lang === 'ar' ? '٢. استخدام البيانات' : lang === 'en' ? '2. Data Usage' : '2. Gebruik van gegevens'}</h3>
        <p style="margin-bottom:16px;">${lang === 'ar' ? 'نستخدم بياناتك فقط لتقديم نصائح تربوية مخصصة وتحسين خدماتنا.' : lang === 'en' ? 'We use your data only to provide personalized parenting advice and improve our services.' : 'Wij gebruiken uw gegevens alleen om gepersonaliseerd opvoedadvies te bieden en onze diensten te verbeteren.'}</p>
        <h3 style="margin:24px 0 12px;">${lang === 'ar' ? '٣. حماية البيانات' : lang === 'en' ? '3. Data Protection' : '3. Gegevensbescherming'}</h3>
        <p>${lang === 'ar' ? 'بياناتك مشفرة ومحمية. لا نشارك معلوماتك مع أطراف ثالثة.' : lang === 'en' ? 'Your data is encrypted and protected. We do not share your information with third parties.' : 'Uw gegevens zijn versleuteld en beschermd. Wij delen uw informatie niet met derden.'}</p>
      </div>
    </div>
  </section>`;

  return baseLayout(lang, title, content);
}


// ============ SEARCH PAGE ============

function generateSearchPage(lang: string, query: string, results: any[]): string {
  const t = {
    nl: { title: "Zoekresultaten", noResults: "Geen resultaten gevonden", searchFor: "Zoekresultaten voor", articles: "artikelen gevonden", tryAgain: "Probeer een andere zoekterm" },
    en: { title: "Search Results", noResults: "No results found", searchFor: "Search results for", articles: "articles found", tryAgain: "Try a different search term" },
    ar: { title: "نتائج البحث", noResults: "لم يتم العثور على نتائج", searchFor: "نتائج البحث عن", articles: "مقالات", tryAgain: "جرب كلمة بحث أخرى" },
  };
  const tr = t[lang as keyof typeof t] || t.nl;

  const resultCards = results.map(article => {
    const title = lang === 'ar' ? article.titleAr : lang === 'en' ? article.titleEn : article.titleNl;
    const excerpt = article.excerpt || (lang === 'ar' ? article.contentAr : lang === 'en' ? article.contentEn : article.contentNl)?.substring(0, 150) + '...';
    const slug = article.slug || `artikel-${article.id}`;
    return `
    <a href="/site/artikel/${slug}?lang=${lang}" style="display:block;padding:24px;border:1px solid var(--border);border-radius:16px;margin-bottom:16px;text-decoration:none;transition:all 0.2s;background:var(--card-bg);" onmouseover="this.style.borderColor='var(--green-600)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <span style="background:var(--green-100);color:var(--green-800);padding:4px 12px;border-radius:12px;font-size:0.75rem;font-weight:600;">${article.category || 'artikel'}</span>
        ${article.ageRange ? `<span style="color:var(--text-muted);font-size:0.8rem;">${article.ageRange}</span>` : ''}
      </div>
      <h3 style="font-size:1.1rem;font-weight:700;color:var(--text);margin-bottom:8px;">${title || 'Untitled'}</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.6;">${excerpt || ''}</p>
    </a>`;
  }).join('');

  const content = `
  <section class="section">
    <div class="container" style="max-width:800px;">
      <h1 style="font-size:2rem;font-weight:800;margin-bottom:8px;">${tr.searchFor}: "${query}"</h1>
      <p style="color:var(--text-muted);margin-bottom:32px;">${results.length} ${tr.articles}</p>
      
      <form action="/site/zoeken" method="GET" style="margin-bottom:32px;">
        <input type="hidden" name="lang" value="${lang}">
        <div style="display:flex;gap:12px;">
          <input type="text" name="q" value="${query}" style="flex:1;padding:14px 20px;border:1px solid var(--border);border-radius:12px;font-size:1rem;outline:none;" placeholder="${t[lang as keyof typeof t]?.title || 'Zoeken'}">
          <button type="submit" style="background:var(--green-800);color:white;border:none;padding:14px 28px;border-radius:12px;font-weight:600;cursor:pointer;">🔍</button>
        </div>
      </form>

      ${results.length > 0 ? resultCards : `
        <div style="text-align:center;padding:48px 0;">
          <p style="font-size:3rem;margin-bottom:16px;">🔍</p>
          <h3 style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">${tr.noResults}</h3>
          <p style="color:var(--text-muted);">${tr.tryAgain}</p>
        </div>
      `}
    </div>
  </section>`;

  return baseLayout(lang, `${tr.title}: ${query}`, content);
}

// ============ AUTHOR PROFILE PAGE ============

function generateAuthorPage(lang: string, author: any, articles: any[]): string {
  const name = lang === 'ar' ? author.nameAr : lang === 'en' ? author.nameEn : author.nameNl;
  const bio = lang === 'ar' ? author.bioAr : lang === 'en' ? author.bioEn : author.bioNl;
  const role = lang === 'ar' ? author.roleAr : lang === 'en' ? author.roleEn : author.roleNl;
  const isRTL = lang === 'ar';

  const expertiseList = Array.isArray(author.expertise) ? author.expertise : [];
  const expertiseTags = expertiseList.map((e: string) => 
    `<span style="background:var(--green-100);color:var(--green-800);padding:6px 14px;border-radius:20px;font-size:0.8rem;font-weight:500;">${e}</span>`
  ).join('');

  const articleCards = articles.map(article => {
    const title = lang === 'ar' ? article.titleAr : lang === 'en' ? article.titleEn : article.titleNl;
    const excerpt = article.excerpt || '';
    const slug = article.slug || `artikel-${article.id}`;
    return `
    <a href="/site/artikel/${slug}?lang=${lang}" style="display:block;padding:20px;border:1px solid var(--border);border-radius:12px;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--green-600)'" onmouseout="this.style.borderColor='var(--border)'">
      <span style="background:var(--green-100);color:var(--green-800);padding:3px 10px;border-radius:10px;font-size:0.7rem;font-weight:600;">${article.category || ''}</span>
      <h4 style="font-size:1rem;font-weight:600;color:var(--text);margin:8px 0 4px;">${title || 'Untitled'}</h4>
      <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.5;">${excerpt.substring(0, 100)}${excerpt.length > 100 ? '...' : ''}</p>
    </a>`;
  }).join('');

  const t = {
    nl: { articles: "Artikelen", expertise: "Expertise", noArticles: "Nog geen artikelen gepubliceerd" },
    en: { articles: "Articles", expertise: "Expertise", noArticles: "No articles published yet" },
    ar: { articles: "المقالات", expertise: "التخصصات", noArticles: "لم يتم نشر مقالات بعد" },
  };
  const tr = t[lang as keyof typeof t] || t.nl;

  const content = `
  <section class="section">
    <div class="container" style="max-width:800px;">
      <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:40px;flex-wrap:wrap;">
        <div style="width:100px;height:100px;border-radius:50%;background:var(--green-100);display:flex;align-items:center;justify-content:center;font-size:2.5rem;flex-shrink:0;">
          ${author.avatarUrl ? `<img src="${author.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '👤'}
        </div>
        <div style="flex:1;min-width:200px;">
          <h1 style="font-size:1.8rem;font-weight:800;margin-bottom:4px;">${name || 'Expert'}</h1>
          <p style="color:var(--green-700);font-weight:600;margin-bottom:12px;">${role || ''}</p>
          <p style="color:var(--text-muted);line-height:1.7;font-size:0.95rem;">${bio || ''}</p>
          ${expertiseTags ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;"><strong style="width:100%;font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">${tr.expertise}:</strong>${expertiseTags}</div>` : ''}
        </div>
      </div>

      <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid var(--green-100);">${tr.articles} (${articles.length})</h2>
      
      ${articles.length > 0 ? `<div style="display:grid;gap:16px;">${articleCards}</div>` : `<p style="color:var(--text-muted);text-align:center;padding:32px 0;">${tr.noArticles}</p>`}
    </div>
  </section>`;

  return baseLayout(lang, name || 'Expert', content, 'experts');
}

// ============ EXPERTS PAGE (DB-BACKED) ============

function generateExpertsPageDB(lang: string, authorsList: any[]): string {
  const t = {
    nl: { title: "Onze experts", desc: "Ons team van experts zorgt ervoor dat alle content gebaseerd is op correcte kennis en praktijkervaring.", viewProfile: "Bekijk profiel" },
    en: { title: "Our Experts", desc: "Our team of experts ensures all content is based on sound knowledge and practical experience.", viewProfile: "View profile" },
    ar: { title: "خبراؤنا", desc: "فريقنا من الخبراء يضمن أن كل محتوى مبني على علم صحيح وتجربة عملية.", viewProfile: "عرض الملف الشخصي" },
  };
  const tr = t[lang as keyof typeof t] || t.nl;

  const expertCards = authorsList.map(author => {
    const name = lang === 'ar' ? author.nameAr : lang === 'en' ? author.nameEn : author.nameNl;
    const role = lang === 'ar' ? author.roleAr : lang === 'en' ? author.roleEn : author.roleNl;
    const bio = lang === 'ar' ? author.bioAr : lang === 'en' ? author.bioEn : author.bioNl;
    return `
    <div class="expert-card" style="padding:32px;background:var(--card-bg);border:1px solid var(--border);border-radius:20px;text-align:center;">
      <div style="width:80px;height:80px;border-radius:50%;background:var(--green-100);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 16px;">
        ${author.avatarUrl ? `<img src="${author.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '👤'}
      </div>
      <h4 style="font-size:1.1rem;font-weight:700;margin-bottom:4px;">${name || 'Expert'}</h4>
      <p style="color:var(--green-700);font-size:0.85rem;font-weight:600;margin-bottom:12px;">${role || ''}</p>
      <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.6;margin-bottom:16px;">${(bio || '').substring(0, 120)}${(bio || '').length > 120 ? '...' : ''}</p>
      <a href="/site/expert/${author.slug}?lang=${lang}" style="display:inline-block;background:var(--green-100);color:var(--green-800);padding:8px 20px;border-radius:20px;font-size:0.8rem;font-weight:600;text-decoration:none;">${tr.viewProfile} →</a>
    </div>`;
  }).join('');

  const content = `
  <section class="section">
    <div class="container">
      <div class="section-header"><h2>${tr.title}</h2></div>
      <p style="color:var(--text-muted);margin-bottom:32px;font-size:1rem;max-width:600px;">${tr.desc}</p>
      <div class="experts-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;">
        ${expertCards}
      </div>
    </div>
  </section>`;

  return baseLayout(lang, tr.title, content, 'experts');
}
