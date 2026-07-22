import type { Express, Request, Response, NextFunction } from "express";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "../shared/const.js";

/** Middleware: check session cookie, redirect to login if missing */
async function requireWebAuth(req: Request, res: Response, next: NextFunction) {
  try {
    await sdk.authenticateRequest(req);
    next();
  } catch {
    res.redirect("/auth/login");
  }
}

/**
 * Logged-in Web Dashboard
 * A web interface for authenticated users to:
 * - View their children's progress
 * - Access weekly goals and advice
 * - Manage family settings
 * - View messages
 * - Access admin features (if admin role)
 */
export function mountWebDashboard(app: Express) {
  app.get("/dashboard", requireWebAuth, (req, res) => {
    res.send(generateDashboardPage());
  });

  app.get("/dashboard/*", requireWebAuth, (req, res) => {
    res.send(generateDashboardPage());
  });
}

function generateDashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opvoedadvies — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #1B4332;
      --primary-light: #2D6A4F;
      --bg: #F8FAF9;
      --surface: #FFFFFF;
      --text: #1B4332;
      --muted: #4A6B5D;
      --border: #E2E8E5;
      --success: #22C55E;
      --warning: #F59E0B;
      --error: #EF4444;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .app { display: flex; min-height: 100vh; }
    .sidebar {
      width: 260px;
      background: var(--primary);
      color: white;
      padding: 24px 0;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      overflow-y: auto;
    }
    .sidebar-logo {
      padding: 0 24px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 16px;
    }
    .sidebar-logo h1 { font-size: 1.2rem; font-weight: 800; }
    .sidebar-logo p { font-size: 0.75rem; opacity: 0.7; margin-top: 4px; }
    .nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 24px; cursor: pointer;
      transition: background 0.2s; font-size: 0.9rem;
      text-decoration: none; color: rgba(255,255,255,0.8);
    }
    .nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.1); color: white; }
    .nav-item .icon { width: 20px; text-align: center; }
    .nav-section { padding: 8px 24px; font-size: 0.7rem; text-transform: uppercase; opacity: 0.5; margin-top: 16px; }
    .main { margin-left: 260px; flex: 1; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
    .header h2 { font-size: 1.5rem; font-weight: 700; }
    .user-info { display: flex; align-items: center; gap: 12px; }
    .user-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--primary-light); color: white;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.9rem;
    }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .stat-card .value { font-size: 2rem; font-weight: 800; color: var(--primary); }
    .stat-card .label { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
    }
    .card h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; }
    .goal-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 0; border-bottom: 1px solid var(--border);
    }
    .goal-item:last-child { border-bottom: none; }
    .goal-check {
      width: 20px; height: 20px; border-radius: 50%;
      border: 2px solid var(--border); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; flex-shrink: 0; margin-top: 2px;
    }
    .goal-check.done { background: var(--success); border-color: var(--success); color: white; }
    .goal-text { font-size: 0.9rem; line-height: 1.5; }
    .goal-source { font-size: 0.75rem; color: var(--muted); margin-top: 4px; font-style: italic; }
    .message-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 0; border-bottom: 1px solid var(--border);
    }
    .message-item:last-child { border-bottom: none; }
    .message-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--primary-light); color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 700; flex-shrink: 0;
    }
    .message-content { flex: 1; }
    .message-name { font-size: 0.85rem; font-weight: 600; }
    .message-preview { font-size: 0.8rem; color: var(--muted); }
    .message-time { font-size: 0.7rem; color: var(--muted); }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 20px; border-radius: 8px; font-size: 0.85rem;
      font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-light); }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: var(--bg); }
    .login-screen {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .login-card h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .login-card p { color: var(--muted); margin-bottom: 24px; }
    .login-card .btn { width: 100%; justify-content: center; padding: 14px; }
    #app-content { display: none; }
    #login-screen { display: flex; }
    .lang-selector { display: flex; gap: 4px; }
    .lang-btn {
      padding: 4px 10px; border-radius: 4px; font-size: 0.7rem;
      border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7);
      cursor: pointer; background: transparent;
    }
    .lang-btn.active { background: rgba(255,255,255,0.15); color: white; }
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 16px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <!-- Login Screen -->
  <div id="login-screen" class="login-screen">
    <div class="login-card">
      <h1>Opvoedadvies</h1>
      <p>Log in om uw dashboard te bekijken</p>
      <button class="btn btn-primary" onclick="handleLogin()">Inloggen met Manus Account</button>
      <p style="margin-top:16px; font-size:0.8rem; color:var(--muted);">
        Nog geen account? <a href="/site" style="color:var(--primary);">Download de app</a>
      </p>
    </div>
  </div>

  <!-- Dashboard -->
  <div id="app-content" class="app">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <h1>Opvoedadvies</h1>
        <p>Islamitische opvoeding</p>
        <div class="lang-selector" style="margin-top:8px;">
          <button class="lang-btn active" onclick="setLang('nl')">NL</button>
          <button class="lang-btn" onclick="setLang('en')">EN</button>
          <button class="lang-btn" onclick="setLang('ar')">عربي</button>
        </div>
      </div>
      <a class="nav-item active" data-page="overview"><span class="icon">📊</span> Overzicht</a>
      <a class="nav-item" data-page="goals"><span class="icon">🎯</span> Weekdoelen</a>
      <a class="nav-item" data-page="children"><span class="icon">👶</span> Kinderen</a>
      <a class="nav-item" data-page="messages"><span class="icon">💬</span> Berichten</a>
      <div class="nav-section">Beheer</div>
      <a class="nav-item" data-page="family"><span class="icon">👨‍👩‍👧</span> Gezin</a>
      <a class="nav-item" data-page="content"><span class="icon">📝</span> Content</a>
      <a class="nav-item" data-page="newsletters"><span class="icon">📰</span> Nieuwsbrieven</a>
      <a class="nav-item" data-page="settings"><span class="icon">⚙️</span> Instellingen</a>
      <div style="position:absolute; bottom:16px; left:24px; right:24px;">
        <a class="nav-item" onclick="handleLogout()" style="opacity:0.6;"><span class="icon">🚪</span> Uitloggen</a>
      </div>
    </aside>

    <main class="main">
      <!-- Overview Page -->
      <div id="page-overview" class="page">
        <div class="header">
          <h2>Welkom terug</h2>
          <div class="user-info">
            <div class="user-avatar" id="user-avatar">?</div>
            <span id="user-name" style="font-size:0.9rem; font-weight:600;">Laden...</span>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="value" id="stat-children">0</div><div class="label">Kinderen</div></div>
          <div class="stat-card"><div class="value" id="stat-goals">0</div><div class="label">Weekdoelen voltooid</div></div>
          <div class="stat-card"><div class="value" id="stat-streak">0</div><div class="label">Dagen streak</div></div>
          <div class="stat-card"><div class="value" id="stat-messages">0</div><div class="label">Nieuwe berichten</div></div>
        </div>
        <div class="card">
          <h3>Weekdoelen deze week</h3>
          <div id="current-goals">
            <p style="color:var(--muted); font-size:0.9rem;">Laden...</p>
          </div>
        </div>
        <div class="card">
          <h3>Recente berichten</h3>
          <div id="recent-messages">
            <p style="color:var(--muted); font-size:0.9rem;">Geen berichten.</p>
          </div>
        </div>
      </div>

      <!-- Goals Page -->
      <div id="page-goals" class="page" style="display:none;">
        <div class="header">
          <h2>Weekdoelen</h2>
          <button class="btn btn-outline" onclick="refreshGoals()">Vernieuwen</button>
        </div>
        <div class="card" id="goals-list">
          <p style="color:var(--muted);">Laden...</p>
        </div>
      </div>

      <!-- Children Page -->
      <div id="page-children" class="page" style="display:none;">
        <div class="header">
          <h2>Kinderen</h2>
        </div>
        <div id="children-list">
          <p style="color:var(--muted);">Laden...</p>
        </div>
      </div>

      <!-- Messages Page -->
      <div id="page-messages" class="page" style="display:none;">
        <div class="header">
          <h2>Berichten</h2>
        </div>
        <div class="card" id="messages-list">
          <p style="color:var(--muted);">Geen berichten.</p>
        </div>
      </div>

      <!-- Family Page -->
      <div id="page-family" class="page" style="display:none;">
        <div class="header">
          <h2>Gezinsbeheer</h2>
        </div>
        <div class="card">
          <h3>Gezinsleden</h3>
          <div id="family-members">
            <p style="color:var(--muted);">Laden...</p>
          </div>
        </div>
        <div class="card">
          <h3>Uitnodigingscode</h3>
          <p style="font-size:0.85rem; color:var(--muted); margin-bottom:12px;">Deel deze code met uw partner of specialist om hen uit te nodigen.</p>
          <div style="display:flex; gap:8px; align-items:center;">
            <code id="invite-code" style="background:var(--bg); padding:10px 16px; border-radius:8px; font-size:1.1rem; font-weight:700; letter-spacing:2px;">------</code>
            <button class="btn btn-outline" onclick="copyInviteCode()">Kopiëren</button>
          </div>
        </div>
      </div>

      <!-- Content Page -->
      <div id="page-content" class="page" style="display:none;">
        <div class="header">
          <h2>Content beheer</h2>
          <button class="btn btn-primary" onclick="window.location.href='/dashboard/content/new'">+ Nieuwe content</button>
        </div>
        <div id="content-list" class="card">
          <p style="color:var(--muted);">Laden...</p>
        </div>
      </div>

      <!-- Newsletters Page -->
      <div id="page-newsletters" class="page" style="display:none;">
        <div class="header">
          <h2>Nieuwsbrieven</h2>
          <button class="btn btn-primary" onclick="window.location.href='/dashboard/newsletters/new'">+ Nieuwe nieuwsbrief</button>
        </div>
        <div id="newsletters-list" class="card">
          <p style="color:var(--muted);">Laden...</p>
        </div>
      </div>

      <!-- Settings Page -->
      <div id="page-settings" class="page" style="display:none;">
        <div class="header">
          <h2>Instellingen</h2>
        </div>
        <div class="card">
          <h3>Profiel</h3>
          <p style="color:var(--muted); font-size:0.9rem;">Profielinstellingen zijn beschikbaar in de mobiele app.</p>
        </div>
        <div class="card">
          <h3>Notificaties</h3>
          <p style="color:var(--muted); font-size:0.9rem;">Beheer uw notificatie-instellingen in de mobiele app.</p>
        </div>
      </div>
    </main>
  </div>

  <script>
    let currentUser = null;
    let currentLang = 'nl';

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        document.getElementById('page-' + page).style.display = 'block';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
      });
    });

    function setLang(lang) {
      currentLang = lang;
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
    }

    async function handleLogin() {
      // Redirect to OAuth flow
      window.location.href = '/auth/login';
    }

    function handleLogout() {
      document.getElementById('app-content').style.display = 'none';
      document.getElementById('login-screen').style.display = 'flex';
      currentUser = null;
    }

    function copyInviteCode() {
      const code = document.getElementById('invite-code').textContent;
      navigator.clipboard.writeText(code);
      alert('Code gekopieerd!');
    }

    async function checkAuth() {
      try {
        const res = await fetch('/api/trpc/system.me');
        if (res.ok) {
          const data = await res.json();
          if (data.result?.data?.json) {
            currentUser = data.result.data.json;
            showDashboard();
            return;
          }
        }
      } catch(e) {}
      // Show login screen
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-content').style.display = 'none';
    }

    function showDashboard() {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-content').style.display = 'flex';
      if (currentUser) {
        const name = currentUser.name || currentUser.email || 'Gebruiker';
        document.getElementById('user-name').textContent = name;
        document.getElementById('user-avatar').textContent = name[0].toUpperCase();
      }
      loadDashboardData();
    }

    async function loadDashboardData() {
      // Load stats and data via tRPC calls
      try {
        const res = await fetch('/api/trpc/admin.dashboard');
        if (res.ok) {
          const data = await res.json();
          const stats = data.result?.data?.json;
          if (stats) {
            document.getElementById('stat-children').textContent = stats.totalChildren || '0';
            document.getElementById('stat-messages').textContent = stats.totalMessages || '0';
          }
        }
      } catch(e) {}
    }

    function refreshGoals() {
      alert('Weekdoelen worden vernieuwd...');
    }

    // Check auth on load
    checkAuth();
  </script>
</body>
</html>`;
}
