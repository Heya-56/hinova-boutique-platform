// Hinova Boutique Platform — Worker mutualisé : accueil, vitrines, tableau de bord commerçant, admin Hinova.
// Schéma : migrations/0001 (initial) + 0002 (sections, contacts, paiements) + 0003 (comptes, inscriptions, Stripe).
import {
  esc, jsonForScript, uid, b64urlDecode, sign, verify, slugify, RESERVED, html, redirect, withMsg,
  getCookie, setCookie, sameOrigin, readForm, safeNext, nowIso, addDays, addMonths, monthKey, yearKey, monthStartSql,
  fmtXpf, fmtDate, int, clean, isHttps, isColor, isEmail, safeEqual, hashPassword,
} from './lib.js';
import {
  PLANS, getPlan, annualPrice, MODELES, getModele, PAYMENT_METHODS, ORDER_STATUSES, NEXT_STATUS, BANQUES, OSB_STATUTS, ISLANDS,
} from './plans.js';
import { appPage, storePage, storeColors, flash, dashNav, adminNav, meter } from './views.js';
import { SECTION_TYPES, defaultSections, sanitizeSections, parseSections, renderSections } from './sections.js';
import { DEMOS, demoBoutique } from './demo.js';
import { illu } from './art.js';
import { EDITOR_JS, EDITOR_CSS } from './editor.js';
import { landingPage } from './landing.js';
import { generateShop, fallbackGen, encodeGen, decodeGen } from './ai.js';
import { productPhoto } from './photos.js';
import {
  stripeReady, priceFor, createCheckout, getCheckout, getSubscription, createPortal, periodEnd, invoicePeriodEnd, invoiceSubscription, invoiceMetadata, verifyWebhook,
} from './stripe.js';

const SESSION = 'hb_s';
const OAUTH = 'hb_oauth';
const SESSION_DAYS = 30;
const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return html(appPage({ title: 'Erreur', body: '<div class="card"><h1>Une erreur est survenue</h1><p class="muted">Réessayez dans un instant. Si le problème persiste, écrivez au support.</p></div>' }), 500);
    }
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(suspendOverdue(env)); },
};

// ───────────────────────────── Routage ─────────────────────────────

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (method === 'POST' && !sameOrigin(request)) return new Response('Origine refusée', { status: 403 });

  // Boutique servie sur son propre sous-domaine : <boutique>.<ROOT_DOMAIN>
  const root = (env.ROOT_DOMAIN || '').toLowerCase();
  const host = url.hostname.toLowerCase();
  if (root && host.endsWith('.' + root) && host !== 'www.' + root) {
    if (url.pathname.startsWith('/img/')) return serveImage(url, env);
    return storefront(request, env, url, host, url.pathname, '');
  }

  const p = url.pathname.replace(/\/+$/, '') || '/';
  let parts;
  try { parts = p.split('/').filter(Boolean).map(decodeURIComponent); } catch { return notFound(); }

  if (p === '/') return html(landingPage(env), 200, { 'cache-control': 'public, max-age=300' });
  if (p === '/robots.txt') return new Response('User-agent: *\nDisallow: /tableau-de-bord\nDisallow: /admin\nDisallow: /f/\n');
  if (p === '/static/editeur.js') return new Response(EDITOR_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  if (parts[0] === 'img') return serveImage(url, env);
  if (parts[0] === 'demo' && parts[1]) return demoStore(parts[1]);
  if (p === '/api/generer' && method === 'POST') return apiGenerate(request, env);
  if (p === '/apercu') return previewStore(url);
  if (parts[0] === 'b' && parts[1]) {
    const sub = '/' + parts.slice(2).join('/');
    return storefront(request, env, url, parts[1], sub, `/b/${encodeURIComponent(parts[1])}`);
  }
  if (parts[0] === 'f' && parts[1]) return invoicePage(env, parts[1]);

  if (p === '/connexion') return method === 'POST' ? loginPost(request, env) : loginPage(env, url);
  if (p === '/bienvenue') return welcome(request, env, url);
  if (p === '/api/stripe/webhook' && method === 'POST') return stripeWebhook(request, env);
  if (p === '/admin/init') return adminInit(request, env, url);
  if (p === '/auth/google') return googleStart(request, env, url);
  if (p === '/auth/google/callback') return googleCallback(request, env, url);
  if (p === '/auth/dev') return devLogin(request, env, url);
  if (p === '/deconnexion') return redirect('/', { 'set-cookie': setCookie(SESSION, '', 0) });

  if (p === '/demarrer') {
    const who = await currentUser(request, env);
    if (who?.user) return redirect(who.user.role === 'admin' ? '/admin' : '/tableau-de-bord');
    return method === 'POST' ? onboardingPost(request, env, url) : onboardingForm(request, env, url);
  }

  if (parts[0] === 'tableau-de-bord') {
    const who = await currentUser(request, env);
    if (!who) return redirect('/connexion?next=' + encodeURIComponent(p));
    if (who.user?.role === 'admin') return redirect('/admin');
    if (!who.user) return redirect('/demarrer');
    const b = await env.DB.prepare('SELECT * FROM boutiques WHERE id = ?').bind(who.user.boutique_id).first();
    if (!b) return redirect('/demarrer');
    return dashboard(request, env, url, b, who, parts.slice(1));
  }

  if (parts[0] === 'admin') {
    const who = await currentUser(request, env);
    if (!who) return redirect('/connexion?next=/admin');
    if (who.user?.role !== 'admin') return notFound();
    return admin(request, env, url, parts.slice(1));
  }

  return notFound();
}

const notFound = () => html(appPage({ title: 'Page introuvable', body: '<div class="card"><h1>Page introuvable</h1><p><a href="/">Retour à l’accueil</a></p></div>' }), 404);

// ───────────────────────────── Comptes et sessions ─────────────────────────────

// Secret de session : variable SESSION_SECRET si présente, sinon secret généré une fois et gardé en base (table config).
let SECRET_CACHE = null;
async function sessionSecret(env) {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  if (SECRET_CACHE) return SECRET_CACHE;
  try {
    let row = await env.DB.prepare(`SELECT valeur FROM config WHERE cle = 'session_secret'`).first();
    if (!row) {
      await env.DB.prepare(`INSERT OR IGNORE INTO config (cle, valeur) VALUES ('session_secret', ?)`).bind(uid() + uid()).run();
      row = await env.DB.prepare(`SELECT valeur FROM config WHERE cle = 'session_secret'`).first();
    }
    SECRET_CACHE = row?.valeur || null;
  } catch (e) { console.error('Secret de session indisponible :', e && e.message); }
  return SECRET_CACHE;
}

async function configValue(env, cle) {
  try { return (await env.DB.prepare('SELECT valeur FROM config WHERE cle = ?').bind(cle).first())?.valeur || null; } catch { return null; }
}

async function currentUser(request, env) {
  const secret = await sessionSecret(env);
  if (!secret) return null;
  const s = await verify(getCookie(request, SESSION), secret);
  if (!s?.e) return null;
  const user = await env.DB.prepare('SELECT * FROM utilisateurs WHERE email_google = ?').bind(s.e).first();
  return { email: s.e, user };
}

async function sessionCookie(env, email) {
  const tok = await sign({ e: email.toLowerCase(), x: Date.now() + SESSION_DAYS * 86400000 }, await sessionSecret(env));
  return setCookie(SESSION, tok, SESSION_DAYS * 86400);
}

async function openSession(env, email, next) {
  const e = email.toLowerCase();
  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  if (admins.includes(e)) await env.DB.prepare(`INSERT OR IGNORE INTO utilisateurs (email_google, role) VALUES (?, 'admin')`).bind(e).run();
  return redirect(safeNext(next), { 'set-cookie': await sessionCookie(env, e) });
}

function loginPage(env, url) {
  const next = safeNext(url.searchParams.get('next') || '/tableau-de-bord');
  const google = env.GOOGLE_CLIENT_ID ? `<p class="small muted" style="margin:18px 0 6px">ou</p>
    <a class="btn google" href="/auth/google?next=${encodeURIComponent(next)}">${GOOGLE_G} Continuer avec Google</a>` : '';
  const dev = env.DEV_LOGIN === '1' ? `<form method="get" action="/auth/dev" class="card" style="margin-top:16px;border-style:dashed">
      <p class="small muted">Mode développement (désactivé en production)</p><input type="hidden" name="next" value="${esc(next)}">
      <label for="de">E-mail de test</label><input id="de" name="email" type="email" required><button class="btn small" style="margin-top:10px">Connexion test</button></form>` : '';
  const body = `<div style="max-width:440px;margin:30px auto">${flash(url)}<div class="card">
    <h1>Connexion</h1><p class="muted">Accédez à l’espace de gestion de votre boutique.</p>
    <form method="post" action="/connexion">
      <input type="hidden" name="next" value="${esc(next)}">
      <label for="em">E-mail</label><input id="em" name="email" type="email" required autocomplete="email">
      <label for="pw">Mot de passe</label><input id="pw" name="password" type="password" required autocomplete="current-password">
      <button class="btn" type="submit" style="width:100%">Se connecter</button>
    </form>${google}
    <p class="small muted" style="margin-top:16px">Pas encore de boutique ? <a href="/">Générer la mienne</a></p></div>${dev}</div>`;
  return html(appPage({ title: 'Connexion', body }));
}

async function loginPost(request, env) {
  const f = await readForm(request);
  const email = clean(f.get('email'), 120).toLowerCase();
  const password = String(f.get('password') || '');
  const next = safeNext(String(f.get('next') || '/tableau-de-bord'));
  const u = await env.DB.prepare('SELECT * FROM utilisateurs WHERE email_google = ?').bind(email).first();
  // Un hachage est toujours calculé pour ne pas révéler l'existence d'un compte par le temps de réponse
  const { hash } = await hashPassword(password, u?.sel || 'sel-leurre-constant');
  if (!u || !u.mot_de_passe || !safeEqual(hash, u.mot_de_passe)) {
    return redirect(withMsg('/connexion?next=' + encodeURIComponent(next), 'err', 'E-mail ou mot de passe incorrect.'));
  }
  return redirect(u.role === 'admin' && next === '/tableau-de-bord' ? '/admin' : next, { 'set-cookie': await sessionCookie(env, email) });
}

const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z"/></svg>';

async function googleStart(request, env, url) {
  if (!env.GOOGLE_CLIENT_ID) return redirect('/connexion');
  const state = uid();
  const next = safeNext(url.searchParams.get('next') || '/tableau-de-bord');
  const cookie = await sign({ s: state, n: next, x: Date.now() + 600000 }, await sessionSecret(env));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/auth/google/callback`, response_type: 'code',
    scope: 'openid email', state, prompt: 'select_account',
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, { 'set-cookie': setCookie(OAUTH, cookie, 600) });
}

async function googleCallback(request, env, url) {
  const saved = await verify(getCookie(request, OAUTH), await sessionSecret(env));
  const fail = (m) => redirect(withMsg('/connexion', 'err', m), { 'set-cookie': setCookie(OAUTH, '', 0) });
  if (!saved || saved.s !== url.searchParams.get('state')) return fail('Session de connexion expirée, réessayez.');
  const code = url.searchParams.get('code');
  if (!code) return fail('Connexion annulée.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/auth/google/callback`, grant_type: 'authorization_code' }),
  });
  if (!res.ok) return fail('Google a refusé la connexion.');
  const { id_token } = await res.json();
  let c;
  try { c = JSON.parse(new TextDecoder().decode(b64urlDecode(id_token.split('.')[1]))); } catch { return fail('Réponse Google illisible.'); }
  if (c.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.exp * 1000 < Date.now() || !c.email_verified || !c.email) {
    return fail('Compte Google non vérifié.');
  }
  const r = await openSession(env, c.email, saved.n);
  r.headers.append('set-cookie', setCookie(OAUTH, '', 0));
  return r;
}

async function devLogin(request, env, url) {
  if (env.DEV_LOGIN !== '1') return notFound();
  const email = clean(url.searchParams.get('email'), 120).toLowerCase();
  if (!isEmail(email)) return redirect(withMsg('/connexion', 'err', 'E-mail invalide.'));
  return openSession(env, email, url.searchParams.get('next') || '/tableau-de-bord');
}

// Premier accès administrateur : code à usage unique rangé en base (config.admin_init_code), puis supprimé.
async function adminInit(request, env, url) {
  const code = await configValue(env, 'admin_init_code');
  const given = String(url.searchParams.get('code') || '');
  if (!code || !safeEqual(given, code)) return notFound();
  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  if (request.method === 'POST') {
    const f = await readForm(request);
    const email = clean(f.get('email'), 120).toLowerCase();
    const pw = String(f.get('password') || '');
    if (!admins.includes(email)) return redirect(withMsg(`/admin/init?code=${encodeURIComponent(given)}`, 'err', 'Cet e-mail n’est pas un e-mail administrateur.'));
    if (pw.length < 10) return redirect(withMsg(`/admin/init?code=${encodeURIComponent(given)}`, 'err', 'Mot de passe : 10 caractères minimum.'));
    const { hash, salt } = await hashPassword(pw);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO utilisateurs (email_google, role, mot_de_passe, sel) VALUES (?, 'admin', ?, ?)
        ON CONFLICT(email_google) DO UPDATE SET role = 'admin', boutique_id = NULL, mot_de_passe = excluded.mot_de_passe, sel = excluded.sel`).bind(email, hash, salt),
      env.DB.prepare(`DELETE FROM config WHERE cle = 'admin_init_code'`),
    ]);
    return redirect('/admin', { 'set-cookie': await sessionCookie(env, email) });
  }
  const body = `<div class="card" style="max-width:440px;margin:30px auto">${flash(url)}<h1>Accès administrateur</h1>
    <p class="muted">Créez le mot de passe de l’administration. Ce lien ne fonctionne qu’une fois.</p>
    <form method="post"><label for="em">E-mail administrateur</label><input id="em" name="email" type="email" required>
    <label for="pw">Mot de passe (10 caractères minimum)</label><input id="pw" name="password" type="password" minlength="10" required autocomplete="new-password">
    <button class="btn" type="submit">Valider</button></form></div>`;
  return html(appPage({ title: 'Accès administrateur', body }), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
}

// ───────────────────────────── Inscription et paiement ─────────────────────────────

function onboardingForm(request, env, url, values = {}) {
  const modele = MODELES[values.modele || url.searchParams.get('modele')] ? (values.modele || url.searchParams.get('modele')) : 'lagon';
  const plan = PLANS[values.plan || url.searchParams.get('plan')] ? (values.plan || url.searchParams.get('plan')) : 'plan_1';
  const cycle = (values.cycle || url.searchParams.get('cycle')) === 'annuel' ? 'annuel' : 'mensuel';
  const gRaw = values.g || url.searchParams.get('g') || '';
  const gen = decodeGen(gRaw);
  if (gen && !values.nom) { values.nom = gen.nom === 'Ma boutique' ? '' : gen.nom; }
  const modeleSel = values.modele || (gen ? gen.modele : modele);
  const pay = stripeReady(env);
  const suffix = env.ROOT_DOMAIN ? `.${esc(env.ROOT_DOMAIN)}` : '';
  const cancelled = url.searchParams.get('annule') ? '<div class="flash err">Paiement annulé : aucune somme n’a été prélevée. Vous pouvez recommencer.</div>' : '';
  const prices = Object.fromEntries(Object.values(PLANS).map((p) => [p.key, { m: p.monthly, a: annualPrice(p) }]));
  const body = `<div class="card" style="max-width:660px;margin:0 auto">
    <h1>Créer ma boutique</h1>${flash(url)}${cancelled}
    ${gen ? `<p class="flash ok">Votre boutique générée (${gen.offres.length} produits, textes et sections) est reprise telle quelle : vous pourrez tout modifier ensuite.</p>` : ''}
    <form method="post" id="signup">
      ${gen ? `<input type="hidden" name="g" value="${esc(gRaw)}">` : ''}
      <h2 style="margin-top:8px">1. Votre boutique</h2>
      <label for="nom">Nom de la boutique</label><input id="nom" name="nom" required maxlength="60" value="${esc(values.nom)}">
      <label for="sd">Adresse de la boutique</label><input id="sd" name="sous_domaine" maxlength="40" placeholder="ex. te-mira" value="${esc(values.sous_domaine)}">
      <p class="small muted">Adresse : <b>${env.ROOT_DOMAIN ? 'nom' + suffix : '/b/nom'}</b>. Lettres, chiffres et tirets ; laissez vide pour la créer depuis le nom.</p>
      <label>Modèle</label>
      <div class="modeles">${Object.entries(MODELES).map(([k, m]) => `<label><input type="radio" name="modele" value="${k}" ${k === modeleSel ? 'checked' : ''}> ${m.label}
        <div class="swatch"><i style="background:${m.tokens.bg}"></i><i style="background:${m.primary}"></i><i style="background:${m.secondary}"></i></div></label>`).join('')}</div>
      <h2 style="margin-top:24px">2. Votre formule</h2>
      <div class="modeles">${Object.values(PLANS).map((pl) => `<label><input type="radio" name="plan" value="${pl.key}" ${pl.key === plan ? 'checked' : ''}> <b>${esc(pl.label)}</b>
        <div class="small muted">${pl.maxProducts} produits · ${pl.salesQuota} ventes / mois<br>${fmtXpf(pl.monthly)} / mois</div></label>`).join('')}</div>
      <div class="modeles" style="margin-top:10px">
        <label><input type="radio" name="cycle" value="mensuel" ${cycle === 'mensuel' ? 'checked' : ''}> <b>Mensuel</b><div class="small muted">Prélevé chaque mois, résiliable à tout moment</div></label>
        <label><input type="radio" name="cycle" value="annuel" ${cycle === 'annuel' ? 'checked' : ''}> <b>Annuel, payé comptant</b><div class="small muted">Une fois par an · 2 mois offerts</div></label>
      </div>
      <p class="flash ok" id="total" style="margin-top:12px"></p>
      <h2 style="margin-top:24px">3. Votre compte</h2>
      <div class="row">
        <div><label for="em">E-mail</label><input id="em" name="email" type="email" required maxlength="120" autocomplete="email" value="${esc(values.email)}"></div>
        <div><label for="pw">Mot de passe (8 caractères minimum)</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      </div>
      <label style="font-weight:400;display:flex;gap:8px;align-items:flex-start;margin-top:16px"><input type="checkbox" name="cgu" required style="margin-top:5px"> J’accepte les conditions générales. L’abonnement est renouvelé automatiquement ; en cas d’impayé, la boutique est mise hors ligne jusqu’à régularisation.</label>
      <button class="btn" type="submit" style="width:100%">${pay ? 'Payer par carte et créer ma boutique' : 'Créer ma boutique'}</button>
      ${pay ? '<p class="small muted" style="text-align:center;margin-top:10px">🔒 Paiement sécurisé par Stripe · votre espace est créé dès la confirmation</p>' : ''}
    </form>
    <p class="small muted">Déjà client ? <a href="/connexion">Se connecter</a></p></div>
    <script>(function(){var P=${jsonForScript(prices)},f=document.getElementById('signup'),t=document.getElementById('total');
      function fx(n){return new Intl.NumberFormat('fr-FR').format(n).replace(/[\\s\\u202f]/g,'\\u00a0')+'\\u00a0XPF';}
      function up(){var p=f.querySelector('input[name=plan]:checked'),c=f.querySelector('input[name=cycle]:checked');if(!p||!c)return;var x=P[p.value];
        t.textContent=c.value==='annuel'?'À régler aujourd’hui : '+fx(x.a)+' pour 12 mois (au lieu de '+fx(x.m*12)+').':'À régler aujourd’hui : '+fx(x.m)+', puis '+fx(x.m)+' chaque mois.';}
      f.addEventListener('change',up);up();})();</script>`;
  return html(appPage({ title: 'Créer ma boutique', body }), 200, { 'cache-control': 'no-store' });
}

async function onboardingPost(request, env, url) {
  const f = await readForm(request);
  const values = {
    nom: clean(f.get('nom'), 60), sous_domaine: slugify(f.get('sous_domaine') || f.get('nom')),
    modele: MODELES[f.get('modele')] ? f.get('modele') : 'lagon', plan: PLANS[f.get('plan')] ? f.get('plan') : 'plan_1',
    cycle: f.get('cycle') === 'annuel' ? 'annuel' : 'mensuel', g: String(f.get('g') || ''),
    email: clean(f.get('email'), 120).toLowerCase(),
  };
  const password = String(f.get('password') || '');
  const fail = (m) => { const u = new URL(url); u.search = ''; u.searchParams.set('err', m); return onboardingForm(request, env, u, values); };
  if (!values.nom) return fail('Indiquez le nom de la boutique.');
  if (values.sous_domaine.length < 3 || RESERVED.has(values.sous_domaine)) return fail('Cette adresse n’est pas disponible (3 caractères minimum).');
  if (!isEmail(values.email)) return fail('Adresse e-mail invalide.');
  if (password.length < 8) return fail('Le mot de passe doit faire au moins 8 caractères.');
  if (!f.get('cgu')) return fail('Merci d’accepter les conditions générales.');
  const domaine = env.ROOT_DOMAIN ? `${values.sous_domaine}.${env.ROOT_DOMAIN.toLowerCase()}` : values.sous_domaine;
  if (await env.DB.prepare('SELECT 1 FROM boutiques WHERE domaine = ?').bind(domaine).first()) return fail('Cette adresse de boutique est déjà prise.');
  if (await env.DB.prepare('SELECT 1 FROM utilisateurs WHERE email_google = ?').bind(values.email).first()) return fail('Un compte existe déjà avec cet e-mail : connectez-vous.');

  const { hash, salt } = await hashPassword(password);
  const id = uid();
  await env.DB.prepare(`INSERT INTO inscriptions (id, email, mot_de_passe, sel, nom, domaine, modele, plan, cycle, gen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, values.email, hash, salt, values.nom, domaine, values.modele, values.plan, values.cycle, decodeGen(values.g) ? values.g : null).run();

  if (stripeReady(env)) {
    const price = priceFor(env, values.plan, values.cycle);
    if (!price) return fail('Paiement indisponible pour cette formule : écrivez au support.');
    try {
      const s = await createCheckout(env, {
        price, email: values.email, metadata: { inscription: id }, origin: url.origin,
        description: `Hinova Boutiques — ${values.nom} (${getPlan(values.plan).label}, ${values.cycle})`,
      });
      return redirect(s.url);
    } catch (e) {
      console.error(e && e.message);
      return fail('Le paiement n’a pas pu démarrer. Réessayez dans un instant.');
    }
  }
  // Sans Stripe configuré : la boutique est créée tout de suite avec la période d'essai.
  const bid = await finalizeInscription(env, id, {});
  if (!bid) return fail('Création impossible, réessayez.');
  return redirect(withMsg('/tableau-de-bord', 'ok', 'Bienvenue ! Votre boutique est créée. Suivez les étapes ci-dessous pour l’ouvrir.'), { 'set-cookie': await sessionCookie(env, values.email) });
}

// Transforme une inscription en boutique (une seule fois, même si le webhook et le retour de paiement arrivent ensemble).
async function finalizeInscription(env, inscId, info) {
  const insc = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(inscId).first();
  if (!insc) return null;
  const echeance = info.periodEnd ? new Date(info.periodEnd).toISOString()
    : info.paid ? addMonths(nowIso(), insc.cycle === 'annuel' ? 12 : 1) : addDays(nowIso(), int(env.TRIAL_DAYS, 14));
  const attachStripe = (bid) => (info.customer || info.subscription)
    ? env.DB.prepare(`UPDATE boutiques SET stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        date_echeance = CASE WHEN ? > COALESCE(date_echeance, '') THEN ? ELSE date_echeance END, statut = 'active' WHERE id = ?`)
      .bind(info.customer || null, info.subscription || null, echeance, echeance, bid).run() : null;

  if (insc.statut === 'terminee') { if (insc.boutique_id) await attachStripe(insc.boutique_id); return insc.boutique_id; }
  const bid = uid();
  const claim = await env.DB.prepare(`UPDATE inscriptions SET statut = 'terminee', boutique_id = ? WHERE id = ? AND statut = 'en_attente'`).bind(bid, inscId).run();
  if (!claim.meta.changes) {
    const again = await env.DB.prepare('SELECT boutique_id FROM inscriptions WHERE id = ?').bind(inscId).first();
    if (again?.boutique_id) await attachStripe(again.boutique_id);
    return again?.boutique_id || null;
  }
  const existing = await env.DB.prepare('SELECT * FROM utilisateurs WHERE email_google = ?').bind(insc.email).first();
  if (existing?.boutique_id) {
    await env.DB.prepare('UPDATE inscriptions SET boutique_id = ? WHERE id = ?').bind(existing.boutique_id, inscId).run();
    await attachStripe(existing.boutique_id);
    return existing.boutique_id;
  }
  const gen = decodeGen(insc.gen);
  const m = getModele(insc.modele);
  const same = gen && gen.modele === insc.modele;
  const sections = gen ? gen.sections : defaultSections({ nom: insc.nom });
  const offres = gen ? gen.offres.slice(0, getPlan(insc.plan).maxProducts) : [];
  // L'adresse a pu être prise entre-temps : on ajoute un suffixe si besoin.
  let domaine = insc.domaine;
  for (let i = 2; i < 30 && await env.DB.prepare('SELECT 1 FROM boutiques WHERE domaine = ?').bind(domaine).first(); i++) {
    domaine = insc.domaine.replace(/^([^.]+)/, `$1-${i}`);
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO boutiques (id, nom, domaine, modele, statut, date_echeance, plan, cycle, couleur_principale, couleur_secondaire, sections_json, slogan, stripe_customer_id, stripe_subscription_id)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(bid, insc.nom, domaine, insc.modele, echeance, insc.plan, insc.cycle, same ? gen.couleur_principale : m.primary, same ? gen.couleur_secondaire : m.secondary,
        JSON.stringify(sections), gen ? gen.slogan : null, info.customer || null, info.subscription || null),
    existing
      ? env.DB.prepare(`UPDATE utilisateurs SET boutique_id = ?, role = 'client', mot_de_passe = ?, sel = ? WHERE email_google = ? AND role = 'client'`).bind(bid, insc.mot_de_passe, insc.sel, insc.email)
      : env.DB.prepare(`INSERT INTO utilisateurs (email_google, boutique_id, role, mot_de_passe, sel) VALUES (?, ?, 'client', ?, ?)`).bind(insc.email, bid, insc.mot_de_passe, insc.sel),
    ...offres.map((o, i) => env.DB.prepare('INSERT INTO offres (id, boutique_id, nom, description, prix_xpf, stock, ordre) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .bind(uid(), bid, o.nom, o.description, o.prix_xpf, i + 1)),
  ]);
  return bid;
}

// Retour de Stripe après paiement : on vérifie la session auprès de Stripe, on crée l'espace et on connecte le commerçant.
async function welcome(request, env, url) {
  if (!stripeReady(env)) return redirect('/');
  const sid = String(url.searchParams.get('session_id') || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return redirect('/demarrer');
  let s;
  try { s = await getCheckout(env, sid); } catch (e) { console.error(e && e.message); return redirect(withMsg('/connexion', 'err', 'Paiement en cours de vérification : connectez-vous dans un instant.')); }
  if (s.status !== 'complete' || Date.now() / 1000 - s.created > 86400) return redirect(withMsg('/demarrer', 'err', 'Paiement non finalisé.'));
  const sub = typeof s.subscription === 'object' ? s.subscription : null;
  const info = { customer: s.customer, subscription: sub ? sub.id : s.subscription, periodEnd: periodEnd(sub), paid: true };
  if (s.metadata?.boutique) {
    await attachToBoutique(env, s.metadata.boutique, info);
    return redirect(withMsg('/tableau-de-bord', 'ok', 'Abonnement activé, merci !'));
  }
  const bid = await finalizeInscription(env, s.metadata?.inscription, info);
  const insc = await env.DB.prepare('SELECT email FROM inscriptions WHERE id = ?').bind(s.metadata?.inscription || '').first();
  if (!bid || !insc) return redirect(withMsg('/connexion', 'err', 'Votre espace se prépare : connectez-vous dans un instant.'));
  return redirect(withMsg('/tableau-de-bord', 'ok', 'Paiement confirmé, bienvenue ! Votre espace est prêt : suivez les étapes ci-dessous.'), { 'set-cookie': await sessionCookie(env, insc.email) });
}

async function attachToBoutique(env, boutiqueId, info) {
  const echeance = info.periodEnd ? new Date(info.periodEnd).toISOString() : null;
  await env.DB.prepare(`UPDATE boutiques SET stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id),
      statut = 'active', date_echeance = COALESCE(?, date_echeance) WHERE id = ?`).bind(info.customer || null, info.subscription || null, echeance, boutiqueId).run();
}

// Notifications Stripe : paiement initial, renouvellements, impayés, résiliations, changements de formule.
async function stripeWebhook(request, env) {
  const payload = await request.text();
  const secret = env.STRIPE_WEBHOOK_SECRET || await configValue(env, 'stripe_webhook_secret');
  if (!await verifyWebhook(payload, request.headers.get('stripe-signature'), secret)) return new Response('Signature invalide', { status: 400 });
  let evt;
  try { evt = JSON.parse(payload); } catch { return new Response('JSON invalide', { status: 400 }); }
  const o = evt.data?.object || {};
  const bySub = (id) => env.DB.prepare('SELECT id FROM boutiques WHERE stripe_subscription_id = ?').bind(id).first();
  switch (evt.type) {
    case 'checkout.session.completed': {
      if (o.mode !== 'subscription') break;
      let pe = null;
      if (stripeReady(env) && o.subscription) { try { pe = periodEnd(await getSubscription(env, o.subscription)); } catch { /* la facture suivra */ } }
      const info = { customer: o.customer, subscription: o.subscription, periodEnd: pe, paid: o.payment_status === 'paid' };
      if (o.metadata?.boutique) await attachToBoutique(env, o.metadata.boutique, info);
      else if (o.metadata?.inscription) await finalizeInscription(env, o.metadata.inscription, info);
      break;
    }
    case 'invoice.paid': {
      const subId = invoiceSubscription(o);
      const pe = invoicePeriodEnd(o);
      if (!subId) break;
      const b = await bySub(subId);
      if (b) {
        await env.DB.prepare(`UPDATE boutiques SET statut = 'active', date_echeance = ? WHERE id = ?`).bind(new Date(pe || Date.now() + 30 * 86400000).toISOString(), b.id).run();
      } else {
        const meta = invoiceMetadata(o);
        const info = { customer: o.customer, subscription: subId, periodEnd: pe, paid: true };
        if (meta.boutique) await attachToBoutique(env, meta.boutique, info);
        else if (meta.inscription) await finalizeInscription(env, meta.inscription, info);
      }
      break;
    }
    case 'customer.subscription.updated': {
      const b = await bySub(o.id);
      if (!b) break;
      const price = o.items?.data?.[0]?.price?.metadata || {};
      const stopped = ['canceled', 'unpaid', 'incomplete_expired'].includes(o.status);
      const pe = periodEnd(o);
      await env.DB.prepare(`UPDATE boutiques SET plan = COALESCE(?, plan), cycle = COALESCE(?, cycle), statut = CASE WHEN ? THEN 'suspendue' ELSE statut END,
          date_echeance = COALESCE(?, date_echeance) WHERE id = ?`)
        .bind(PLANS[price.plan] ? price.plan : null, ['mensuel', 'annuel'].includes(price.cycle) ? price.cycle : null, stopped ? 1 : 0,
          !stopped && pe ? new Date(pe).toISOString() : null, b.id).run();
      break;
    }
    case 'customer.subscription.deleted': {
      const b = await bySub(o.id);
      if (b) await env.DB.prepare(`UPDATE boutiques SET statut = 'suspendue' WHERE id = ?`).bind(b.id).run();
      break;
    }
    default: break; // invoice.payment_failed : Stripe relance le client ; la tâche planifiée suspend après l'échéance + délai de grâce
  }
  return Response.json({ recu: true });
}

// ───────────────────────────── Générateur IA ─────────────────────────────

async function apiGenerate(request, env) {
  let body = {};
  try { body = await request.json(); } catch { /* corps invalide */ }
  const description = clean(body.description, 400);
  const nom = clean(body.nom, 60);
  if (description.length < 8) return Response.json({ error: 'Décrivez votre activité en une phrase (8 caractères minimum).' }, { status: 400 });
  // « rapide » : proposition instantanée ; sinon : rédaction par l'IA (avec secours automatique).
  const gen = body.mode === 'rapide' ? fallbackGen(description, nom) : await generateShop(env, description, nom);
  const g = encodeGen(gen);
  return Response.json({
    source: gen.source, nom: gen.nom, slogan: gen.slogan, modele: gen.modele, modeleLabel: getModele(gen.modele).label,
    produits: gen.offres.length, sections: gen.sections.filter((x) => x.visible).length,
    couleurs: [gen.couleur_principale, gen.couleur_secondaire],
    apercu: `/apercu?g=${g}`, creer: `/demarrer?g=${g}`,
  }, { headers: { 'cache-control': 'no-store' } });
}

function previewStore(url) {
  const gen = decodeGen(url.searchParams.get('g'));
  if (!gen) return notFound();
  const b = { id: 'apercu', nom: gen.nom, slogan: gen.slogan, modele: gen.modele, statut: 'active', couleur_principale: gen.couleur_principale,
    couleur_secondaire: gen.couleur_secondaire, logo_url: null, whatsapp: '', telephone: '', infos_livraison: 'Expédition par la poste dans toutes les îles.' };
  // Aperçu : photos d'exemple sur les produits ; la vraie boutique démarre sans, le commerçant met les siennes.
  const offres = gen.offres.map((o, i) => ({ ...o, image_url: productPhoto(gen.modele, i) }));
  return html(renderStore(b, offres, gen.sections, { base: '', demo: true }), 200, {
    'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'", 'cache-control': 'no-store', 'x-robots-tag': 'noindex',
  });
}

// ───────────────────────────── Règles métier ─────────────────────────────

function isOffline(b, env) {
  if (b.statut === 'suspendue') return true;
  if (!b.date_echeance) return false;
  return new Date(addDays(b.date_echeance, int(env.GRACE_DAYS, 3))) < new Date();
}

function methodsOf(b) {
  const m = [];
  if (b.lien_paiement_carte) m.push('carte');
  if (b.rib) m.push('virement');
  if (b.consignes_ccp) m.push('ccp');
  return m;
}

const storeUrl = (env, b, origin) => (env.ROOT_DOMAIN && b.domaine.includes('.') ? `https://${b.domaine}` : `${origin}/b/${encodeURIComponent(b.domaine)}`);

async function usage(env, b) {
  const r = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM offres WHERE boutique_id = ?1) AS offres,
      (SELECT COALESCE(ventes_count, 0) FROM ventes_mensuelles WHERE boutique_id = ?1 AND mois = ?2) AS ventes,
      (SELECT COALESCE(SUM(total_xpf), 0) FROM commandes WHERE boutique_id = ?1 AND statut IN ('payee','expediee') AND cree_le >= ?3) AS ca,
      (SELECT COUNT(*) FROM commandes WHERE boutique_id = ?1 AND statut = 'en_attente') AS attente,
      (SELECT COUNT(*) FROM commandes WHERE boutique_id = ?1 AND statut = 'payee') AS a_expedier`)
    .bind(b.id, monthKey(), monthStartSql()).first();
  return { ...r, ventes: r.ventes || 0 };
}

async function storeImage(env, ownerId, file) {
  if (!file || typeof file === 'string' || !file.size) return { url: null };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: 'Format d’image non accepté (JPG, PNG ou WebP).' };
  if (file.size > MAX_IMAGE) return { error: 'Image trop lourde (2 Mo maximum).' };
  const key = `${ownerId}/${uid()}.${ext}`;
  await env.IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return { url: `/img/${key}` };
}
async function dropImage(env, url) {
  if (url && url.startsWith('/img/')) await env.IMAGES.delete(url.slice(5));
}

async function serveImage(url, env) {
  const key = decodeURIComponent(url.pathname.replace(/^\/img\//, ''));
  if (!/^[a-f0-9]{32}\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(key)) return new Response('Introuvable', { status: 404 });
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Introuvable', { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'public, max-age=31536000, immutable');
  h.set('x-content-type-options', 'nosniff');
  return new Response(obj.body, { headers: h });
}

// ───────────────────────────── Tableau de bord commerçant ─────────────────────────────

function dash(title, active, body, extraHead = '') {
  return html(appPage({ title, body, nav: dashNav(active), brandHref: '/tableau-de-bord', extraHead }), 200, { 'cache-control': 'no-store' });
}

async function dashboard(request, env, url, b, who, sub) {
  const post = request.method === 'POST';
  const [section, id, action] = sub;
  if (!section) return dashHome(env, url, b);
  if (section === 'parametres') return post ? settingsPost(request, env, b) : settingsForm(url, b);
  if (section === 'apparence') return post ? appearancePost(request, env, b) : appearanceForm(env, url, b);
  if (section === 'osb') return post ? osbPost(request, env, b, who) : osbForm(env, url, b, who);
  if (section === 'abonnement' && post) return subscriptionAction(env, url, b, who, id);
  if (section === 'produits') {
    if (!id) return post ? productSave(request, env, b, null) : productList(env, url, b);
    if (action === 'supprimer' && post) return productDelete(env, b, id);
    return post ? productSave(request, env, b, id) : productEdit(env, url, b, id);
  }
  if (section === 'commandes') {
    if (!id) return orderList(env, url, b);
    if (action === 'avancer' && post) return orderAdvance(env, b, id);
    if (action === 'supprimer' && post) return orderDelete(env, b, id);
    return orderDetail(env, url, b, id);
  }
  return notFound();
}

async function dashHome(env, url, b) {
  const plan = getPlan(b.plan);
  const u = await usage(env, b);
  const link = storeUrl(env, b, url.origin);
  const offline = isOffline(b, env);
  const steps = [
    [methodsOf(b).length > 0, 'Indiquez au moins un moyen de paiement', '/tableau-de-bord/parametres'],
    [u.offres > 0, 'Ajoutez votre premier produit', '/tableau-de-bord/produits'],
    [!!(b.telephone || b.whatsapp), 'Ajoutez un numéro de contact', '/tableau-de-bord/parametres'],
    [!!(b.logo_url || b.slogan), 'Personnalisez votre vitrine (logo, accroche, sections)', '/tableau-de-bord/apparence'],
  ].filter((s) => !s[0]);
  const surplus = Math.max(0, u.ventes - plan.salesQuota);
  const body = `${flash(url)}
  ${offline ? '<div class="flash err"><b>Votre boutique est hors ligne</b> : l’abonnement n’est pas à jour. Réglez-le pour la remettre en ligne aussitôt.</div>' : ''}
  <div class="card">
    <h1>${esc(b.nom)}</h1>
    <p>Votre boutique : <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a></p>
    <p><span class="badge ${esc(b.statut)}">${b.statut === 'active' ? 'En ligne' : 'Suspendue'}</span>
      <span class="small muted">· ${esc(plan.label)} · ${b.cycle} · réglée jusqu’au ${fmtDate(b.date_echeance)}</span></p>
  </div>
  ${steps.length ? `<div class="card"><h2>Pour ouvrir votre boutique</h2><ol>${steps.map((s) => `<li><a href="${s[2]}">${s[1]}</a></li>`).join('')}</ol></div>` : ''}
  <div class="stats">
    <div class="stat"><b>${u.offres} / ${plan.maxProducts}</b><span>produits</span>${meter(u.offres, plan.maxProducts)}</div>
    <div class="stat"><b>${u.ventes} / ${plan.salesQuota}</b><span>ventes payées ce mois</span>${meter(u.ventes, plan.salesQuota)}</div>
    <div class="stat"><b>${fmtXpf(u.ca)}</b><span>encaissé ce mois</span></div>
    <div class="stat"><b>${u.attente} · ${u.a_expedier}</b><span>en attente · à expédier</span></div>
  </div>
  ${surplus ? `<div class="flash err">${surplus} vente(s) au-delà du quota de votre formule ce mois-ci : elles seront facturées en supplément, ou passez à la formule supérieure.</div>` : ''}
  <div class="card"><h2>Mon abonnement</h2>
    <p>${esc(plan.label)}, ${b.cycle === 'annuel' ? `annuel : <b>${fmtXpf(annualPrice(plan))}</b> / an` : `mensuel : <b>${fmtXpf(plan.monthly)}</b> / mois`} · prochaine échéance le ${fmtDate(b.date_echeance)}.</p>
    ${stripeReady(env) && b.stripe_customer_id
      ? `<form method="post" action="/tableau-de-bord/abonnement"><button class="btn">Gérer mon abonnement</button></form>
         <p class="small muted">Carte bancaire, factures, changement de formule ou résiliation, sur l’espace sécurisé Stripe.</p>`
      : stripeReady(env)
        ? `<form method="post" action="/tableau-de-bord/abonnement/activer"><button class="btn">Activer mon abonnement par carte</button></form>`
        : `<p class="muted">Pour régler votre abonnement, écrivez à <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a>.</p>`}
  </div>`;
  return dash('Tableau de bord', '/tableau-de-bord', body);
}

// Portail Stripe (carte, factures, résiliation) ou activation d'un abonnement pour une boutique créée sans paiement.
async function subscriptionAction(env, url, b, who, action) {
  if (!stripeReady(env)) return redirect('/tableau-de-bord');
  try {
    if (action === 'activer') {
      const price = priceFor(env, b.plan, b.cycle);
      if (!price) return redirect(withMsg('/tableau-de-bord', 'err', 'Formule indisponible au paiement : écrivez au support.'));
      const s = await createCheckout(env, { price, email: who.email, customer: b.stripe_customer_id || undefined, metadata: { boutique: b.id }, origin: url.origin,
        cancelPath: '/tableau-de-bord', description: `Hinova Boutiques — ${b.nom}` });
      return redirect(s.url);
    }
    if (!b.stripe_customer_id) return redirect('/tableau-de-bord');
    const portal = await createPortal(env, b.stripe_customer_id, `${url.origin}/tableau-de-bord`);
    return redirect(portal.url);
  } catch (e) {
    console.error(e && e.message);
    return redirect(withMsg('/tableau-de-bord', 'err', 'L’espace de paiement est momentanément indisponible. Réessayez dans un instant.'));
  }
}

// ───────────── Paramètres ─────────────

function settingsForm(url, b) {
  const v = (k) => esc(b[k] || '');
  const body = `${flash(url)}<div class="card"><h1>Paramètres</h1><form method="post">
    <div class="row">
      <div><label for="nom">Nom de la boutique</label><input id="nom" name="nom" required maxlength="60" value="${v('nom')}"></div>
      <div><label for="slogan">Phrase d’accroche</label><input id="slogan" name="slogan" maxlength="140" value="${v('slogan')}"></div>
    </div>
    <div class="row">
      <div><label for="tel">Téléphone</label><input id="tel" name="telephone" maxlength="30" value="${v('telephone')}"></div>
      <div><label for="wa">WhatsApp (ex. 68989123456)</label><input id="wa" name="whatsapp" maxlength="20" inputmode="numeric" value="${v('whatsapp')}"></div>
      <div><label for="ile">Île</label><select id="ile" name="ile"><option value=""></option>${ISLANDS.map((i) => `<option ${i === b.ile ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
    </div>
    <h2 style="margin-top:24px">Moyens de paiement</h2>
    <p class="muted small">L’argent des ventes va directement sur votre compte. Remplissez au moins un moyen.</p>
    <label for="rib">Virement : vos coordonnées bancaires (titulaire, banque, IBAN)</label><textarea id="rib" name="rib" maxlength="600">${v('rib')}</textarea>
    <label for="ccp">Espèces au guichet (CCP / Marara Paiement) : vos consignes</label><textarea id="ccp" name="consignes_ccp" maxlength="600">${v('consignes_ccp')}</textarea>
    <label for="carte">Carte bancaire : lien de paiement OSB / PayZen (https://…)</label><input id="carte" name="lien_paiement_carte" maxlength="500" value="${v('lien_paiement_carte')}">
    <p class="small muted">Pas encore de lien carte ? <a href="/tableau-de-bord/osb">Faire la demande à OSB</a>.</p>
    <label for="bq">Votre banque</label><select id="bq" name="banque"><option value=""></option>${BANQUES.map((x) => `<option ${x === b.banque ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <label for="liv">Livraison et retrait</label><textarea id="liv" name="infos_livraison" maxlength="600">${v('infos_livraison')}</textarea>
    <h2 style="margin-top:24px">Factures</h2>
    <div class="row">
      <div><label for="nt">N° Tahiti</label><input id="nt" name="numero_tahiti" maxlength="20" value="${v('numero_tahiti')}"></div>
    </div>
    <label for="mf">Mentions en bas de facture (statut, RCS, TVA…)</label><textarea id="mf" name="mentions_facture" maxlength="600">${v('mentions_facture')}</textarea>
    <button class="btn" type="submit">Enregistrer</button></form></div>`;
  return dash('Paramètres', '/tableau-de-bord/parametres', body);
}

async function settingsPost(request, env, b) {
  const f = await readForm(request);
  const carte = clean(f.get('lien_paiement_carte'), 500);
  if (carte && !isHttps(carte)) return redirect(withMsg('/tableau-de-bord/parametres', 'err', 'Le lien de paiement carte doit commencer par https://'));
  await env.DB.prepare(`UPDATE boutiques SET nom=?, slogan=?, telephone=?, whatsapp=?, ile=?, rib=?, consignes_ccp=?, lien_paiement_carte=?,
      banque=?, infos_livraison=?, numero_tahiti=?, mentions_facture=? WHERE id=?`)
    .bind(clean(f.get('nom'), 60) || b.nom, clean(f.get('slogan'), 140), clean(f.get('telephone'), 30), clean(f.get('whatsapp'), 20).replace(/\D/g, ''),
      ISLANDS.includes(f.get('ile')) ? f.get('ile') : null, clean(f.get('rib'), 600), clean(f.get('consignes_ccp'), 600), carte,
      BANQUES.includes(f.get('banque')) ? f.get('banque') : null, clean(f.get('infos_livraison'), 600), clean(f.get('numero_tahiti'), 20),
      clean(f.get('mentions_facture'), 600), b.id).run();
  return redirect(withMsg('/tableau-de-bord/parametres', 'ok', 'Paramètres enregistrés.'));
}

// ───────────── Apparence : modèle, couleurs, logo, sections ─────────────

function appearanceForm(env, url, b) {
  const sections = parseSections(b.sections_json, b);
  const c = storeColors(b);
  const body = `${flash(url)}<form method="post" enctype="multipart/form-data">
    <div class="card"><h1>Apparence</h1>
      <p><a href="${esc(storeUrl(env, b, url.origin))}" target="_blank" rel="noopener">Voir ma boutique ↗</a></p>
      <label>Modèle</label>
      <div class="modeles">${Object.entries(MODELES).map(([k, m]) => `<label><input type="radio" name="modele" value="${k}" ${k === b.modele ? 'checked' : ''}> ${m.label}
        <div class="small muted">${esc(m.pitch)}</div></label>`).join('')}</div>
      <div class="row">
        <div><label for="cp">Couleur principale</label><input id="cp" type="color" name="couleur_principale" value="${esc(c.primary)}"></div>
        <div><label for="cs">Couleur secondaire</label><input id="cs" type="color" name="couleur_secondaire" value="${esc(c.secondary)}"></div>
      </div>
      <label for="logo">Logo (PNG, JPG ou WebP, 2 Mo max)</label>
      ${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="Logo actuel" style="height:56px;width:auto;margin:6px 0"><label style="font-weight:400"><input type="checkbox" name="retirer_logo"> Retirer le logo</label>` : ''}
      <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp">
      <label for="banniere">Photo de bannière (en haut de la page)</label>
      ${(() => { const h = sections.find((x) => x.type === 'hero' && x.image); return h ? `<img src="${esc(h.image)}" alt="Bannière actuelle" style="height:90px;width:auto;border-radius:10px;margin:6px 0"><label style="font-weight:400"><input type="checkbox" name="retirer_banniere"> Retirer la photo (l’illustration revient)</label>` : ''; })()}
      <input id="banniere" name="banniere" type="file" accept="image/png,image/jpeg,image/webp">
      <p class="small muted">Mettez vos propres photos : produits dans « Produits », ambiance ici.</p>
    </div>
    <div class="card"><h2>Sections de la vitrine</h2>
      <p class="muted small">Ordonnez, masquez et modifiez les blocs de votre page. La section « Produits et commande » est obligatoire.</p>
      <noscript><p class="flash err">Activez JavaScript pour modifier les sections.</p></noscript>
      <div id="editeur"></div>
      <input type="hidden" name="sections_json" value="${esc(JSON.stringify(sections))}">
      <script type="application/json" id="sections-data">${jsonForScript(sections)}</script>
      <script type="application/json" id="section-types">${jsonForScript(SECTION_TYPES)}</script>
    </div>
    <button class="btn" type="submit">Enregistrer l’apparence</button>
  </form><script src="/static/editeur.js" defer></script>`;
  return dash('Apparence', '/tableau-de-bord/apparence', body, `<style>${EDITOR_CSS}</style>`);
}

async function appearancePost(request, env, b) {
  const f = await readForm(request);
  const modele = MODELES[f.get('modele')] ? f.get('modele') : b.modele;
  const cp = isColor(f.get('couleur_principale')) ? f.get('couleur_principale') : b.couleur_principale;
  const cs = isColor(f.get('couleur_secondaire')) ? f.get('couleur_secondaire') : b.couleur_secondaire;
  const sections = sanitizeSections(String(f.get('sections_json') || ''));
  let logo = b.logo_url;
  const up = await storeImage(env, b.id, f.get('logo'));
  if (up.error) return redirect(withMsg('/tableau-de-bord/apparence', 'err', up.error));
  if (up.url || f.get('retirer_logo')) { await dropImage(env, b.logo_url); logo = up.url || null; }
  const ban = await storeImage(env, b.id, f.get('banniere'));
  if (ban.error) return redirect(withMsg('/tableau-de-bord/apparence', 'err', ban.error));
  if (ban.url || f.get('retirer_banniere')) {
    for (const h of sections.filter((x) => x.type === 'hero')) { await dropImage(env, h.image); h.image = ban.url || ''; }
  }
  await env.DB.prepare('UPDATE boutiques SET modele=?, couleur_principale=?, couleur_secondaire=?, logo_url=?, sections_json=? WHERE id=?')
    .bind(modele, cp, cs, logo, JSON.stringify(sections), b.id).run();
  return redirect(withMsg('/tableau-de-bord/apparence', 'ok', 'Apparence enregistrée.'));
}

// ───────────── Produits (table offres) ─────────────

function productFields(o = {}) {
  return `<label for="nom">Nom du produit</label><input id="nom" name="nom" required maxlength="80" value="${esc(o.nom)}">
    <div class="row">
      <div><label for="prix">Prix (XPF)</label><input id="prix" name="prix_xpf" type="number" min="0" step="1" required inputmode="numeric" value="${esc(o.prix_xpf ?? '')}"></div>
      <div><label for="stock">Stock</label><input id="stock" name="stock" type="number" min="0" step="1" required inputmode="numeric" value="${esc(o.stock ?? 1)}"></div>
      <div><label for="ordre">Position (1 = en premier)</label><input id="ordre" name="ordre" type="number" min="0" step="1" value="${esc(o.ordre ?? 0)}"></div>
    </div>
    <label for="desc">Description</label><textarea id="desc" name="description" maxlength="1200">${esc(o.description)}</textarea>
    <label for="img">Photo (JPG, PNG ou WebP, 2 Mo max)</label><input id="img" name="image" type="file" accept="image/jpeg,image/png,image/webp">`;
}

async function productList(env, url, b) {
  const plan = getPlan(b.plan);
  const { results } = await env.DB.prepare('SELECT * FROM offres WHERE boutique_id = ? ORDER BY ordre, rowid').bind(b.id).all();
  const full = results.length >= plan.maxProducts;
  const body = `${flash(url)}<div class="card"><h1>Produits <span class="muted small">${results.length} / ${plan.maxProducts}</span></h1>${meter(results.length, plan.maxProducts)}
    ${results.length ? `<div class="table-scroll"><table><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th><th></th></tr></thead><tbody>
    ${results.map((o) => `<tr><td>${esc(o.nom)}</td><td>${fmtXpf(o.prix_xpf)}</td><td>${o.stock}</td><td><a class="btn small ghost" href="/tableau-de-bord/produits/${o.id}">Modifier</a></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Aucun produit pour l’instant.</p>'}</div>
  <div class="card"><h2>Ajouter un produit</h2>
    ${full ? `<p>Limite de ${plan.maxProducts} produits atteinte pour la formule ${esc(plan.label)}. <a href="mailto:${esc(env.SUPPORT_EMAIL)}">Passer à la formule supérieure</a>.</p>`
      : `<form method="post" enctype="multipart/form-data">${productFields({ ordre: results.length + 1 })}<button class="btn" type="submit">Ajouter</button></form>`}</div>`;
  return dash('Produits', '/tableau-de-bord/produits', body);
}

async function productEdit(env, url, b, id) {
  const o = await env.DB.prepare('SELECT * FROM offres WHERE id = ? AND boutique_id = ?').bind(id, b.id).first();
  if (!o) return notFound();
  const c = storeColors(b);
  const visual = o.image_url ? `<img src="${esc(o.image_url)}" alt="">` : illu('vague', c.primary, c.secondary);
  const body = `${flash(url)}<div class="card"><p><a href="/tableau-de-bord/produits">← Produits</a></p><h1>Modifier le produit</h1>
    <div style="width:160px;border-radius:12px;overflow:hidden;margin-bottom:8px">${visual}</div>
    <form method="post" enctype="multipart/form-data">${productFields(o)}<button class="btn" type="submit">Enregistrer</button></form>
    <form method="post" action="/tableau-de-bord/produits/${esc(o.id)}/supprimer" onsubmit="return confirm('Supprimer ce produit ?')">
      <button class="btn danger small" type="submit" style="margin-top:22px">Supprimer le produit</button></form></div>`;
  return dash('Modifier le produit', '/tableau-de-bord/produits', body);
}

async function productSave(request, env, b, id) {
  const back = id ? `/tableau-de-bord/produits/${id}` : '/tableau-de-bord/produits';
  let existing = null;
  if (id) {
    existing = await env.DB.prepare('SELECT * FROM offres WHERE id = ? AND boutique_id = ?').bind(id, b.id).first();
    if (!existing) return notFound();
  } else {
    const plan = getPlan(b.plan);
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM offres WHERE boutique_id = ?').bind(b.id).first()).n;
    if (n >= plan.maxProducts) return redirect(withMsg(back, 'err', `Limite de ${plan.maxProducts} produits atteinte.`));
  }
  const f = await readForm(request);
  const nom = clean(f.get('nom'), 80);
  const prix = int(f.get('prix_xpf'), -1);
  if (!nom || prix < 0) return redirect(withMsg(back, 'err', 'Nom et prix obligatoires.'));
  const up = await storeImage(env, b.id, f.get('image'));
  if (up.error) return redirect(withMsg(back, 'err', up.error));
  const vals = [nom, clean(f.get('description'), 1200), prix, Math.max(0, int(f.get('stock'), 0)), Math.max(0, int(f.get('ordre'), 0))];
  if (existing) {
    if (up.url) await dropImage(env, existing.image_url);
    await env.DB.prepare('UPDATE offres SET nom=?, description=?, prix_xpf=?, stock=?, ordre=?, image_url=? WHERE id=? AND boutique_id=?')
      .bind(...vals, up.url || existing.image_url, id, b.id).run();
  } else {
    await env.DB.prepare('INSERT INTO offres (id, boutique_id, nom, description, prix_xpf, stock, ordre, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid(), b.id, ...vals, up.url).run();
  }
  return redirect(withMsg('/tableau-de-bord/produits', 'ok', existing ? 'Produit enregistré.' : 'Produit ajouté.'));
}

async function productDelete(env, b, id) {
  const o = await env.DB.prepare('SELECT image_url FROM offres WHERE id = ? AND boutique_id = ?').bind(id, b.id).first();
  if (!o) return notFound();
  await dropImage(env, o.image_url);
  await env.DB.prepare('DELETE FROM offres WHERE id = ? AND boutique_id = ?').bind(id, b.id).run();
  return redirect(withMsg('/tableau-de-bord/produits', 'ok', 'Produit supprimé.'));
}

// ───────────── Commandes ─────────────

async function orderList(env, url, b) {
  const st = ORDER_STATUSES[url.searchParams.get('statut')] ? url.searchParams.get('statut') : '';
  const q = st
    ? env.DB.prepare('SELECT * FROM commandes WHERE boutique_id = ? AND statut = ? ORDER BY cree_le DESC, rowid DESC LIMIT 200').bind(b.id, st)
    : env.DB.prepare('SELECT * FROM commandes WHERE boutique_id = ? ORDER BY cree_le DESC, rowid DESC LIMIT 200').bind(b.id);
  const { results } = await q.all();
  const tabs = [['', 'Toutes'], ...Object.entries(ORDER_STATUSES)].map(([k, v]) =>
    `<a class="btn small ${k === st ? '' : 'ghost'}" href="/tableau-de-bord/commandes${k ? '?statut=' + k : ''}">${v}</a>`).join(' ');
  const body = `${flash(url)}<div class="card"><h1>Commandes</h1><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${tabs}</div>
    ${results.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th></th></tr></thead><tbody>
    ${results.map((o) => `<tr><td>${fmtDate(o.cree_le)}${o.numero_facture ? `<br><span class="small muted">${esc(o.numero_facture)}</span>` : ''}</td>
      <td>${esc(o.client_nom)}<br><span class="small muted">${esc(o.ile || '')} · ${esc(o.client_telephone || '')}</span></td>
      <td>${fmtXpf(o.total_xpf)}</td><td class="small">${esc(PAYMENT_METHODS[o.moyen])}</td>
      <td><span class="badge ${esc(o.statut)}">${esc(ORDER_STATUSES[o.statut])}</span></td>
      <td><a class="btn small ghost" href="/tableau-de-bord/commandes/${o.id}">Ouvrir</a></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Aucune commande.</p>'}</div>`;
  return dash('Commandes', '/tableau-de-bord/commandes', body);
}

async function orderDetail(env, url, b, id) {
  const o = await env.DB.prepare('SELECT * FROM commandes WHERE id = ? AND boutique_id = ?').bind(id, b.id).first();
  if (!o) return notFound();
  const lignes = JSON.parse(o.lignes_json);
  const next = NEXT_STATUS[o.statut];
  const factureUrl = `${url.origin}/f/${o.id}`;
  const share = o.numero_facture ? `
    <a class="btn small ghost" href="/f/${o.id}" target="_blank" rel="noopener">Voir la facture ${esc(o.numero_facture)}</a>
    <a class="btn small ghost" href="mailto:${esc(o.client_email)}?subject=${encodeURIComponent(`Votre facture ${o.numero_facture} — ${b.nom}`)}&body=${encodeURIComponent(`Bonjour ${o.client_nom},\n\nMerci pour votre commande. Votre facture : ${factureUrl}\n\n${b.nom}`)}">Envoyer par e-mail</a>
    ${o.client_telephone ? `<a class="btn small ghost" target="_blank" rel="noopener" href="https://wa.me/${esc((o.client_telephone || '').replace(/\D/g, '').replace(/^(\d{8})$/, '689$1'))}?text=${encodeURIComponent(`Ia ora na ${o.client_nom}, voici votre facture ${o.numero_facture} : ${factureUrl}`)}">Envoyer par WhatsApp</a>` : ''}` : '';
  const body = `${flash(url)}<div class="card noprint"><p><a href="/tableau-de-bord/commandes">← Commandes</a></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${next ? `<form method="post" action="/tableau-de-bord/commandes/${o.id}/avancer"><button class="btn small">${next === 'payee' ? 'Marquer payée (émet la facture)' : 'Marquer expédiée'}</button></form>` : ''}
      <button class="btn small ghost" type="button" onclick="window.print()">Imprimer bon + étiquette</button>
      ${o.statut === 'en_attente' ? `<form method="post" action="/tableau-de-bord/commandes/${o.id}/supprimer" onsubmit="return confirm('Supprimer cette commande ? Le stock sera remis.')"><button class="btn small danger">Supprimer</button></form>` : ''}
      ${share}
    </div></div>
  <div class="card"><h1>Bon de commande</h1>
    <p class="muted">${esc(b.nom)} · ${fmtDate(o.cree_le)} · ${esc(PAYMENT_METHODS[o.moyen])} · <span class="badge ${esc(o.statut)}">${esc(ORDER_STATUSES[o.statut])}</span></p>
    <table><thead><tr><th>Article</th><th>Qté</th><th>Prix</th><th>Sous-total</th></tr></thead><tbody>
    ${lignes.map((l) => `<tr><td>${esc(l.nom)}</td><td>${l.qte}</td><td>${fmtXpf(l.prix)}</td><td>${fmtXpf(l.prix * l.qte)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Total</b></td><td><b>${fmtXpf(o.total_xpf)}</b></td></tr></tbody></table>
    ${o.note ? `<p><b>Note du client :</b> ${esc(o.note)}</p>` : ''}
    <p class="small muted">Client : ${esc(o.client_email)}</p></div>
  <div class="card" style="border:2px dashed #222;max-width:430px">
    <p class="small" style="margin:0">EXPÉDITEUR : ${esc(b.nom)}${b.ile ? ' — ' + esc(b.ile) : ''}${b.telephone ? ' — ' + esc(b.telephone) : ''}</p>
    <h2 style="margin:14px 0 6px">${esc(o.client_nom)}</h2>
    <p style="margin:0;white-space:pre-line;font-size:1.1rem">${esc(o.client_adresse)}</p>
    <p style="margin:6px 0 0;font-size:1.2rem;font-weight:700">${esc(o.ile || '')} — Polynésie française</p>
    <p class="small" style="margin:8px 0 0">Tél. ${esc(o.client_telephone || '')} · Réf. ${esc(o.id.slice(0, 8).toUpperCase())}</p></div>`;
  return dash('Commande', '/tableau-de-bord/commandes', body);
}

async function orderAdvance(env, b, id) {
  const back = `/tableau-de-bord/commandes/${id}`;
  const o = await env.DB.prepare('SELECT statut FROM commandes WHERE id = ? AND boutique_id = ?').bind(id, b.id).first();
  if (!o) return notFound();
  const target = NEXT_STATUS[o.statut];
  if (!target) return redirect(back);
  const r = await env.DB.prepare('UPDATE commandes SET statut = ? WHERE id = ? AND boutique_id = ? AND statut = ?').bind(target, id, b.id, o.statut).run();
  if (!r.meta.changes) return redirect(withMsg(back, 'err', 'La commande a déjà été mise à jour.'));
  if (target === 'payee') {
    // Numéro de facture séquentiel par boutique, attribué une seule fois, puis comptage de la vente payée du mois.
    const { dernier_numero: n } = await env.DB.prepare(`INSERT INTO compteurs_factures (boutique_id, dernier_numero) VALUES (?, 1)
      ON CONFLICT(boutique_id) DO UPDATE SET dernier_numero = dernier_numero + 1 RETURNING dernier_numero`).bind(b.id).first();
    const numero = `F${yearKey()}-${String(n).padStart(4, '0')}`;
    await env.DB.batch([
      env.DB.prepare('UPDATE commandes SET numero_facture = ? WHERE id = ? AND numero_facture IS NULL').bind(numero, id),
      env.DB.prepare(`INSERT INTO ventes_mensuelles (boutique_id, mois, ventes_count) VALUES (?, ?, 1)
        ON CONFLICT(boutique_id, mois) DO UPDATE SET ventes_count = ventes_count + 1`).bind(b.id, monthKey()),
    ]);
    return redirect(withMsg(back, 'ok', `Paiement enregistré. Facture ${numero} émise.`));
  }
  return redirect(withMsg(back, 'ok', 'Commande marquée expédiée.'));
}

async function orderDelete(env, b, id) {
  const o = await env.DB.prepare(`SELECT * FROM commandes WHERE id = ? AND boutique_id = ? AND statut = 'en_attente'`).bind(id, b.id).first();
  if (!o) return redirect(withMsg('/tableau-de-bord/commandes', 'err', 'Seule une commande en attente peut être supprimée.'));
  const lignes = JSON.parse(o.lignes_json);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM commandes WHERE id = ? AND boutique_id = ?').bind(id, b.id),
    ...lignes.map((l) => env.DB.prepare('UPDATE offres SET stock = stock + ? WHERE id = ? AND boutique_id = ?').bind(l.qte, l.id, b.id)),
  ]);
  return redirect(withMsg('/tableau-de-bord/commandes', 'ok', 'Commande supprimée, stock remis.'));
}

// ───────────── Dossier OSB (paiement par carte) ─────────────

async function osbForm(env, url, b, who) {
  const { results } = await env.DB.prepare('SELECT * FROM dossiers_osb WHERE boutique_id = ? ORDER BY cree_le DESC').bind(b.id).all();
  const body = `${flash(url)}<div class="card"><h1>Paiement par carte (OSB)</h1>
    <p>Pour accepter la carte bancaire, votre boutique a besoin d’un contrat de paiement en ligne auprès d’OSB, ouvert à votre nom. Remplissez ce dossier : nous le préparons avec vous et le transmettons.</p>
    <p class="small muted">L’abonnement OSB est réglé directement par vous à OSB ; il n’est pas inclus dans votre formule Hinova.</p></div>
  ${results.length ? `<div class="card"><h2>Mes demandes</h2><table><tbody>${results.map((d) => `<tr><td>${fmtDate(d.cree_le)}</td><td>${esc(d.raison_sociale)}</td><td><span class="badge ${esc(d.statut)}">${esc(OSB_STATUTS[d.statut] || d.statut)}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="card"><h2>Nouvelle demande</h2><form method="post">
    <div class="row">
      <div><label for="rs">Raison sociale ou nom commercial</label><input id="rs" name="raison_sociale" required maxlength="120" value="${esc(b.nom)}"></div>
      <div><label for="nt">N° Tahiti</label><input id="nt" name="numero_tahiti" maxlength="20" value="${esc(b.numero_tahiti || '')}"></div>
    </div>
    <div class="row">
      <div><label for="re">Responsable</label><input id="re" name="responsable" required maxlength="80"></div>
      <div><label for="te">Téléphone</label><input id="te" name="telephone" required maxlength="30" value="${esc(b.telephone || '')}"></div>
      <div><label for="em">E-mail</label><input id="em" name="email" type="email" required maxlength="120" value="${esc(who.email)}"></div>
    </div>
    <label for="bq">Banque du compte professionnel</label><select id="bq" name="banque" required>${BANQUES.map((x) => `<option ${x === b.banque ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <button class="btn" type="submit">Envoyer la demande</button></form></div>`;
  return dash('Paiement carte', '/tableau-de-bord/osb', body);
}

async function osbPost(request, env, b) {
  const f = await readForm(request);
  const d = {
    raison_sociale: clean(f.get('raison_sociale'), 120), numero_tahiti: clean(f.get('numero_tahiti'), 20),
    responsable: clean(f.get('responsable'), 80), telephone: clean(f.get('telephone'), 30),
    email: clean(f.get('email'), 120).toLowerCase(), banque: BANQUES.includes(f.get('banque')) ? f.get('banque') : '',
  };
  if (!d.raison_sociale || !d.responsable || !d.telephone || !isEmail(d.email) || !d.banque) {
    return redirect(withMsg('/tableau-de-bord/osb', 'err', 'Merci de remplir tous les champs obligatoires.'));
  }
  const id = uid();
  await env.DB.prepare(`INSERT INTO dossiers_osb (id, boutique_id, raison_sociale, numero_tahiti, responsable, telephone, email, banque)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, b.id, d.raison_sociale, d.numero_tahiti, d.responsable, d.telephone, d.email, d.banque).run();
  if (env.OSB_WEBHOOK_URL) {
    try {
      await fetch(env.OSB_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'dossier_osb', id, boutique: { id: b.id, nom: b.nom, domaine: b.domaine }, ...d, cree_le: nowIso() }) });
    } catch (e) { console.error('Webhook OSB en échec', e); }
  }
  return redirect(withMsg('/tableau-de-bord/osb', 'ok', 'Demande envoyée. Nous revenons vers vous rapidement.'));
}

// ───────────────────────────── Vitrines ─────────────────────────────

function renderStore(b, offres, sections, { base, demo = false, flashHtml = '' }) {
  const c = storeColors(b);
  const methods = demo ? ['virement', 'ccp', 'carte'] : methodsOf(b);
  const ctx = { b, offres, base, demo, methods, canOrder: methods.length > 0 && offres.some((o) => o.stock > 0), ...c };
  const annonce = renderSections(sections.filter((s) => s.type === 'annonce'), ctx);
  const body = (flashHtml ? `<div class="wrap">${flashHtml}</div>` : '') + renderSections(sections.filter((s) => s.type !== 'annonce'), ctx);
  return storePage(b, { title: b.nom, body, base, annonce, description: b.slogan || `Boutique ${b.nom}`, cart: ctx.canOrder });
}

function demoStore(modele) {
  const d = demoBoutique(modele);
  if (!d) return notFound();
  return html(renderStore(d.boutique, d.offres, d.sections, { base: `/demo/${modele}`, demo: true }), 200, {
    'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'", 'cache-control': 'public, max-age=600', 'x-robots-tag': 'noindex',
  });
}

async function storefront(request, env, url, domaine, sub, base) {
  const b = await env.DB.prepare('SELECT * FROM boutiques WHERE domaine = ?').bind(domaine.toLowerCase()).first();
  if (!b) return notFound();
  if (isOffline(b, env)) {
    return html(storePage(b, { title: 'Boutique indisponible', base, body: '<section class="s"><div class="wrap narrow"><h1>Boutique momentanément indisponible</h1><p class="muted">Revenez bientôt.</p></div></section>' }), 503, { 'cache-control': 'no-store' });
  }
  if (sub === '/' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM offres WHERE boutique_id = ? ORDER BY ordre, rowid').bind(b.id).all();
    const msg = url.searchParams.get('err') ? `<div class="flash err" role="alert">${esc(url.searchParams.get('err'))}</div>` : '';
    return html(renderStore(b, results, parseSections(b.sections_json, b), { base, flashHtml: msg }));
  }
  if (sub === '/commander' && request.method === 'POST') return placeOrder(request, env, b, base);
  const m = sub.match(/^\/commande\/([a-f0-9]{32})$/);
  if (m && request.method === 'GET') return orderConfirmation(env, b, m[1], base);
  return notFound();
}

async function placeOrder(request, env, b, base) {
  const back = (msg) => redirect(withMsg(`${base}/`, 'err', msg) + '#produits');
  const f = await readForm(request);
  if (f.get('site_web')) return back('Commande refusée.');
  const moyen = String(f.get('moyen') || '');
  if (!methodsOf(b).includes(moyen)) return back('Choisissez un moyen de paiement.');
  const c = {
    nom: clean(f.get('client_nom'), 80), tel: clean(f.get('client_telephone'), 30), email: clean(f.get('client_email'), 120).toLowerCase(),
    adresse: clean(f.get('client_adresse'), 400), ile: ISLANDS.includes(f.get('ile')) ? f.get('ile') : '', note: clean(f.get('note'), 300),
  };
  if (!c.nom || !c.tel || !c.adresse || !c.ile) return back('Merci de remplir nom, téléphone, adresse et île.');
  if (!isEmail(c.email)) return back('Adresse e-mail invalide.');

  const wanted = [];
  for (const [k, v] of f.entries()) if (k.startsWith('q_')) { const q = int(v, 0); if (q > 0) wanted.push({ id: k.slice(2), qte: Math.min(q, 999) }); }
  if (!wanted.length) return back('Choisissez au moins un produit.');
  if (wanted.length > 40) return back('Commande trop longue.');

  const { results: offres } = await env.DB.prepare(`SELECT id, nom, prix_xpf, stock FROM offres WHERE boutique_id = ? AND id IN (${wanted.map(() => '?').join(',')})`)
    .bind(b.id, ...wanted.map((w) => w.id)).all();
  const byId = Object.fromEntries(offres.map((o) => [o.id, o]));
  const lignes = [];
  for (const w of wanted) {
    const o = byId[w.id];
    if (!o) return back('Un produit n’est plus disponible.');
    if (o.stock < w.qte) return back(`Stock insuffisant pour « ${o.nom} » (reste ${o.stock}).`);
    lignes.push({ id: o.id, nom: o.nom, qte: w.qte, prix: o.prix_xpf });
  }
  // Réservation atomique du stock, produit par produit ; retour arrière si un autre client a été plus rapide.
  const done = [];
  const release = () => done.length && env.DB.batch(done.map((l) => env.DB.prepare('UPDATE offres SET stock = stock + ? WHERE id = ? AND boutique_id = ?').bind(l.qte, l.id, b.id)));
  for (const l of lignes) {
    const r = await env.DB.prepare('UPDATE offres SET stock = stock - ? WHERE id = ? AND boutique_id = ? AND stock >= ?').bind(l.qte, l.id, b.id, l.qte).run();
    if (!r.meta.changes) { await release(); return back(`« ${l.nom} » vient d’être épuisé.`); }
    done.push(l);
  }
  const id = uid();
  try {
    await env.DB.prepare(`INSERT INTO commandes (id, boutique_id, client_nom, client_email, client_adresse, lignes_json, total_xpf, moyen, client_telephone, ile, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, b.id, c.nom, c.email, c.adresse, JSON.stringify(lignes), lignes.reduce((s, l) => s + l.prix * l.qte, 0), moyen, c.tel, c.ile, c.note).run();
  } catch (e) { await release(); throw e; }
  return redirect(`${base}/commande/${id}`);
}

async function orderConfirmation(env, b, id, base) {
  const o = await env.DB.prepare('SELECT * FROM commandes WHERE id = ? AND boutique_id = ?').bind(id, b.id).first();
  if (!o) return notFound();
  const lignes = JSON.parse(o.lignes_json);
  const ref = o.id.slice(0, 8).toUpperCase();
  const pay = {
    virement: `<p>Faites un virement de <b>${fmtXpf(o.total_xpf)}</b> avec la référence <b>${ref}</b> :</p><pre class="pay">${esc(b.rib)}</pre>`,
    ccp: `<p>Réglez <b>${fmtXpf(o.total_xpf)}</b> en espèces au guichet avec la référence <b>${ref}</b> :</p><pre class="pay">${esc(b.consignes_ccp)}</pre>`,
    carte: `<p>Réglez <b>${fmtXpf(o.total_xpf)}</b> sur la page de paiement sécurisée de la banque, en indiquant la référence <b>${ref}</b>.</p><a class="btn" href="${esc(b.lien_paiement_carte)}" target="_blank" rel="noopener">Payer par carte</a>`,
  }[o.moyen] || '';
  const wa = b.whatsapp ? `<a class="btn btn-ghost" href="https://wa.me/${esc(b.whatsapp)}?text=${encodeURIComponent(`Bonjour, je viens de passer la commande ${ref} (${fmtXpf(o.total_xpf)}).`)}" target="_blank" rel="noopener">Prévenir la boutique sur WhatsApp</a>` : '';
  const body = `<section class="s"><div class="wrap narrow">
    <h1>Merci, commande enregistrée</h1><p>Référence : <b>${ref}</b>. Notez-la pour votre paiement.</p>
    <ul>${lignes.map((l) => `<li>${l.qte} × ${esc(l.nom)} — ${fmtXpf(l.prix * l.qte)}</li>`).join('')}</ul>
    <p><b>Total : ${fmtXpf(o.total_xpf)}</b></p>
    <h2>Paiement</h2>${pay}
    <p class="muted">${esc(b.nom)} prépare votre commande dès réception du paiement ; votre facture vous sera envoyée.</p>
    <div class="row-btn">${wa}<a class="btn btn-ghost" href="${esc(base || '/')}">Retour à la boutique</a></div></div></section>`;
  return html(storePage(b, { title: `Commande ${ref}`, body, base, clearCart: true }), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
}

async function invoicePage(env, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return notFound();
  const o = await env.DB.prepare('SELECT * FROM commandes WHERE id = ? AND numero_facture IS NOT NULL').bind(id).first();
  if (!o) return notFound();
  const b = await env.DB.prepare('SELECT * FROM boutiques WHERE id = ?').bind(o.boutique_id).first();
  const lignes = JSON.parse(o.lignes_json);
  const body = `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="" style="height:48px;width:auto;margin-bottom:8px">` : ''}
        <b>${esc(b.nom)}</b><br>${b.numero_tahiti ? `N° Tahiti : ${esc(b.numero_tahiti)}<br>` : ''}${esc(b.ile || '')}${b.telephone ? ' · ' + esc(b.telephone) : ''}</div>
      <div style="text-align:right"><h1 style="margin:0">Facture</h1><b>${esc(o.numero_facture)}</b><br><span class="muted">Commande du ${fmtDate(o.cree_le)}</span></div>
    </div>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <p><b>Client</b><br>${esc(o.client_nom)}<br><span style="white-space:pre-line">${esc(o.client_adresse)}</span><br>${esc(o.ile || '')}<br>${esc(o.client_email)}</p>
    <table><thead><tr><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr></thead><tbody>
    ${lignes.map((l) => `<tr><td>${esc(l.nom)}</td><td>${l.qte}</td><td>${fmtXpf(l.prix)}</td><td>${fmtXpf(l.prix * l.qte)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Total</b></td><td><b>${fmtXpf(o.total_xpf)}</b></td></tr></tbody></table>
    <p class="small">Réglée par ${esc(PAYMENT_METHODS[o.moyen])}.</p>
    ${b.mentions_facture ? `<p class="small muted" style="white-space:pre-line">${esc(b.mentions_facture)}</p>` : ''}
    <button class="btn small ghost noprint" onclick="window.print()">Imprimer / PDF</button></div>`;
  return html(appPage({ title: `Facture ${o.numero_facture} — ${b.nom}`, body, brandHref: '/' }), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
}

// ───────────────────────────── Administration Hinova ─────────────────────────────

async function admin(request, env, url, sub) {
  const post = request.method === 'POST';
  if (sub[0] === 'b' && sub[1] && sub[2] && post) return adminBoutiqueAction(request, env, sub[1], sub[2]);
  if (sub[0] === 'osb') {
    if (sub[1] && sub[2] === 'statut' && post) return adminOsbStatus(request, env, sub[1]);
    return adminOsb(env, url);
  }
  const now = nowIso();
  const { results } = await env.DB.prepare(`SELECT b.*,
      (SELECT COUNT(*) FROM offres o WHERE o.boutique_id = b.id) AS n_offres,
      (SELECT COALESCE(ventes_count, 0) FROM ventes_mensuelles v WHERE v.boutique_id = b.id AND v.mois = ?) AS n_ventes,
      (SELECT email_google FROM utilisateurs u WHERE u.boutique_id = b.id LIMIT 1) AS email
    FROM boutiques b ORDER BY b.cree_le DESC, b.rowid DESC`).bind(monthKey()).all();
  const payees = results.filter((b) => b.statut === 'active' && b.date_echeance && b.date_echeance > now);
  const mrr = payees.reduce((s, b) => s + (b.cycle === 'annuel' ? Math.round(annualPrice(getPlan(b.plan)) / 12) : getPlan(b.plan).monthly), 0);
  const osb = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM dossiers_osb WHERE statut = 'en_attente'`).first()).n;
  const rows = results.map((b) => {
    const pl = getPlan(b.plan);
    return `<tr><td><b>${esc(b.nom)}</b><br><a class="small" href="${esc(storeUrl(env, b, url.origin))}" target="_blank" rel="noopener">${esc(b.domaine)}</a><br><span class="small muted">${esc(b.email || '')}</span></td>
      <td>${esc(pl.label)}<br><span class="small muted">${esc(b.cycle)} · ${esc(getModele(b.modele).label)}</span></td>
      <td><span class="badge ${esc(b.statut)}">${esc(b.statut)}</span><br><span class="small muted">jusqu’au ${fmtDate(b.date_echeance)}</span></td>
      <td>${b.n_offres}/${pl.maxProducts} produits<br><span class="small ${(b.n_ventes || 0) > pl.salesQuota ? '' : 'muted'}">${b.n_ventes || 0}/${pl.salesQuota} ventes</span></td>
      <td style="min-width:230px">
        <form method="post" action="/admin/b/${b.id}/paiement" style="display:flex;gap:6px"><select name="mois" style="width:auto"><option value="1">+1 mois</option><option value="12">+12 mois</option></select><button class="btn small">Encaisser</button></form>
        <form method="post" action="/admin/b/${b.id}/plan" style="display:flex;gap:6px;margin-top:6px"><select name="plan" style="width:auto">${Object.values(PLANS).map((p) => `<option value="${p.key}" ${p.key === b.plan ? 'selected' : ''}>${p.label}</option>`).join('')}</select><button class="btn small ghost">Changer</button></form>
        <form method="post" action="/admin/b/${b.id}/${b.statut === 'suspendue' ? 'reactiver' : 'suspendre'}" style="margin-top:6px"><button class="btn small ${b.statut === 'suspendue' ? 'ghost' : 'danger'}">${b.statut === 'suspendue' ? 'Réactiver' : 'Suspendre'}</button></form>
      </td></tr>`;
  }).join('');
  const body = `${flash(url)}<div class="stats">
      <div class="stat"><b>${results.length}</b><span>boutiques</span></div>
      <div class="stat"><b>${payees.length}</b><span>à jour</span></div>
      <div class="stat"><b>${fmtXpf(mrr)}</b><span>revenu mensuel récurrent</span></div>
      <div class="stat"><b>${osb}</b><span><a href="/admin/osb">dossiers OSB à traiter</a></span></div></div>
    <div class="card"><h1>Boutiques</h1><div class="table-scroll"><table><thead><tr><th>Boutique</th><th>Formule</th><th>Statut</th><th>Usage du mois</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">Aucune boutique.</td></tr>'}</tbody></table></div></div>`;
  return html(appPage({ title: 'Administration', body, nav: adminNav('/admin'), brandHref: '/admin' }), 200, { 'cache-control': 'no-store' });
}

async function adminBoutiqueAction(request, env, id, action) {
  const b = await env.DB.prepare('SELECT * FROM boutiques WHERE id = ?').bind(id).first();
  if (!b) return notFound();
  const f = await readForm(request);
  let msg;
  if (action === 'paiement') {
    const mois = f.get('mois') === '12' ? 12 : 1;
    const from = b.date_echeance && new Date(b.date_echeance) > new Date() ? b.date_echeance : nowIso();
    const until = addMonths(from, mois);
    await env.DB.prepare(`UPDATE boutiques SET statut = 'active', date_echeance = ?, cycle = ? WHERE id = ?`).bind(until, mois === 12 ? 'annuel' : 'mensuel', id).run();
    msg = `${b.nom} : réglée jusqu’au ${fmtDate(until)}.`;
  } else if (action === 'plan' && PLANS[f.get('plan')]) {
    await env.DB.prepare('UPDATE boutiques SET plan = ? WHERE id = ?').bind(f.get('plan'), id).run();
    msg = `${b.nom} : formule ${getPlan(f.get('plan')).label}.`;
  } else if (action === 'suspendre') {
    await env.DB.prepare(`UPDATE boutiques SET statut = 'suspendue' WHERE id = ?`).bind(id).run();
    msg = `${b.nom} : suspendue.`;
  } else if (action === 'reactiver') {
    const until = b.date_echeance && new Date(b.date_echeance) > new Date() ? b.date_echeance : addDays(nowIso(), 7);
    await env.DB.prepare(`UPDATE boutiques SET statut = 'active', date_echeance = ? WHERE id = ?`).bind(until, id).run();
    msg = `${b.nom} : réactivée.`;
  } else return notFound();
  return redirect(withMsg('/admin', 'ok', msg));
}

async function adminOsb(env, url) {
  const { results } = await env.DB.prepare(`SELECT d.*, b.nom AS boutique FROM dossiers_osb d JOIN boutiques b ON b.id = d.boutique_id ORDER BY d.cree_le DESC LIMIT 200`).all();
  const body = `${flash(url)}<div class="card"><h1>Dossiers OSB</h1>${results.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Boutique</th><th>Demandeur</th><th>Banque</th><th>Statut</th></tr></thead><tbody>
    ${results.map((d) => `<tr><td>${fmtDate(d.cree_le)}</td><td>${esc(d.boutique)}<br><span class="small muted">${esc(d.raison_sociale)} · ${esc(d.numero_tahiti || 's. n° Tahiti')}</span></td>
      <td>${esc(d.responsable)}<br><span class="small muted">${esc(d.telephone)} · ${esc(d.email)}</span></td><td>${esc(d.banque)}</td>
      <td><form method="post" action="/admin/osb/${d.id}/statut" style="display:flex;gap:6px"><select name="statut" style="width:auto">${Object.entries(OSB_STATUTS).map(([k, v]) => `<option value="${k}" ${k === d.statut ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="btn small ghost">OK</button></form></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Aucun dossier.</p>'}</div>`;
  return html(appPage({ title: 'Dossiers OSB', body, nav: adminNav('/admin/osb'), brandHref: '/admin' }), 200, { 'cache-control': 'no-store' });
}

async function adminOsbStatus(request, env, id) {
  const f = await readForm(request);
  const st = OSB_STATUTS[f.get('statut')] ? f.get('statut') : null;
  if (st) await env.DB.prepare('UPDATE dossiers_osb SET statut = ? WHERE id = ?').bind(st, id).run();
  return redirect(withMsg('/admin/osb', 'ok', 'Dossier mis à jour.'));
}

// ───────────────────────────── Tâche planifiée ─────────────────────────────

export async function suspendOverdue(env) {
  const limit = addDays(nowIso(), -int(env.GRACE_DAYS, 3));
  const r = await env.DB.prepare(`UPDATE boutiques SET statut = 'suspendue' WHERE statut = 'active' AND date_echeance IS NOT NULL AND date_echeance < ?`).bind(limit).run();
  return r.meta.changes;
}

export { DEMOS };
