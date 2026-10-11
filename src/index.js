// Hinova Boutiques — générateur de boutiques en ligne multi-commerçants (Cloudflare Workers + D1 + R2)
import {
  esc, uid, token, hashPassword, safeEqual, slugify, RESERVED_SLUGS, html, redirect,
  getCookie, setCookie, sameOrigin, nowIso, addDays, addMonths, fmtXpf, fmtDate, monthStartSql, int, clean,
} from './lib.js';
import { PLANS, getPlan, annualPrice, PAYMENT_METHODS, ORDER_STATUSES, ISLANDS } from './plans.js';
import { page, flash, dashNav, meter, THEME_NAMES } from './views.js';

const SESSION_COOKIE = 'hb_session';
const ADMIN_COOKIE = 'hb_admin';
const SESSION_DAYS = 30;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return html(page({ title: 'Erreur', body: '<div class="card"><h1>Une erreur est survenue</h1><p class="muted">Réessayez dans un instant. Si le problème persiste, contactez le support.</p></div>' }), 500);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(suspendOverdue(env));
  },
};

// ───────────────────────────── Routage ─────────────────────────────

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (method === 'POST' && !sameOrigin(request)) return new Response('Origine refusée', { status: 403 });

  // Sous-domaine boutique : <slug>.<ROOT_DOMAIN>
  const root = (env.ROOT_DOMAIN || '').toLowerCase();
  const host = url.hostname.toLowerCase();
  if (root && host.endsWith('.' + root)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub && sub !== 'www' && !sub.includes('.')) {
      if (url.pathname.startsWith('/img/')) return serveImage(url, env);
      return storefront(request, env, url, sub, url.pathname, '');
    }
  }

  const p = url.pathname.replace(/\/+$/, '') || '/';
  const parts = p.split('/').filter(Boolean);

  if (p === '/') return landing(env);
  if (p === '/robots.txt') return new Response('User-agent: *\nDisallow: /tableau-de-bord\nDisallow: /admin\n');
  if (parts[0] === 'img') return serveImage(url, env);
  if (parts[0] === 's' && parts[1]) {
    const sub = '/' + parts.slice(2).join('/');
    return storefront(request, env, url, parts[1], sub === '/' ? '/' : sub, `/s/${parts[1]}`);
  }

  if (p === '/inscription') return method === 'POST' ? signupPost(request, env) : signupForm(env, url);
  if (p === '/connexion') return method === 'POST' ? loginPost(request, env) : loginForm(url);
  if (p === '/deconnexion') return logout(request, env);

  if (parts[0] === 'tableau-de-bord') {
    const tenant = await currentTenant(request, env);
    if (!tenant) return redirect('/connexion');
    return dashboard(request, env, url, tenant, parts.slice(1));
  }

  if (parts[0] === 'admin') return admin(request, env, url, parts.slice(1));

  return notFound();
}

function notFound() {
  return html(page({ title: 'Page introuvable', body: '<div class="card"><h1>Page introuvable</h1><p><a href="/">Retour à l’accueil</a></p></div>' }), 404);
}

// ───────────────────────────── Accueil & offres ─────────────────────────────

function plansHtml(cta = true) {
  return `<div class="plans">${Object.values(PLANS).map((pl) => `
    <div class="card plan">
      <h3>${esc(pl.label)}</h3>
      <div class="p">${fmtXpf(pl.monthly)}<span class="muted small"> / mois</span></div>
      <p class="muted small">ou ${fmtXpf(annualPrice(pl))} / an (2 mois offerts)</p>
      <ul><li>${pl.maxProducts} produits maximum</li><li>${pl.salesQuota} ventes / mois incluses</li><li>Gestion du stock</li><li>Bon de commande et étiquette postale</li><li>Paiement versé directement sur votre compte</li></ul>
      ${cta ? `<a class="btn" href="/inscription?plan=${pl.key}">Choisir</a>` : ''}
    </div>`).join('')}</div>`;
}

function landing(env) {
  const body = `
  <section class="hero">
    <h1>Votre boutique en ligne prête en 10 minutes.</h1>
    <p>Choisissez un modèle, ajoutez vos produits depuis votre téléphone, partagez votre lien. Vos clients paient directement sur votre compte, par virement, au guichet ou par carte via OSB.</p>
    <a class="btn" href="/inscription">Créer ma boutique — ${esc(env.TRIAL_DAYS || '14')} jours offerts</a>
    <a class="btn ghost" href="/connexion">J’ai déjà une boutique</a>
  </section>
  <h2 style="margin-top:34px">Les formules</h2>
  ${plansHtml()}
  <p class="muted small">Besoin de plus de produits ou d’un site sur mesure ? Écrivez à <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a>. Ouverture du paiement par carte (dossier OSB / PayZen) sur demande au support.</p>`;
  return html(page({ title: `${env.BRAND} — boutiques en ligne pour la Polynésie`, body, description: 'Créez votre boutique en ligne en Polynésie française : modèles prêts à l’emploi, paiement direct au commerçant.' }));
}

// ───────────────────────────── Comptes commerçants ─────────────────────────────

function signupForm(env, url, values = {}) {
  const plan = values.plan || url.searchParams.get('plan') || 'mini';
  const body = `<div class="card" style="max-width:560px;margin:0 auto">
    <h1>Créer ma boutique</h1>${flash(url)}
    <form method="post">
      <label for="name">Nom de la boutique</label><input id="name" name="name" required maxlength="60" value="${esc(values.name)}">
      <label for="slug">Adresse de la boutique</label><input id="slug" name="slug" maxlength="40" placeholder="ex. te-mira-tahiti" value="${esc(values.slug)}">
      <p class="muted small">Lettres, chiffres et tirets. Laissez vide pour la générer depuis le nom.</p>
      <label for="email">E-mail</label><input id="email" name="email" type="email" required value="${esc(values.email)}">
      <label for="password">Mot de passe (8 caractères minimum)</label><input id="password" name="password" type="password" minlength="8" required>
      <div class="row">
        <div><label for="plan">Formule</label><select id="plan" name="plan">${Object.values(PLANS).map((p) => `<option value="${p.key}" ${p.key === plan ? 'selected' : ''}>${esc(p.label)} — ${fmtXpf(p.monthly)}/mois</option>`).join('')}</select></div>
        <div><label for="billing">Facturation</label><select id="billing" name="billing"><option value="mensuel">Mensuelle</option><option value="annuel" ${values.billing === 'annuel' ? 'selected' : ''}>Annuelle (2 mois offerts)</option></select></div>
      </div>
      <label style="font-weight:400"><input type="checkbox" name="cgu" required style="width:auto"> J’accepte les conditions générales d’utilisation. En cas d’impayé, la boutique est mise hors ligne jusqu’à régularisation.</label>
      <button class="btn" type="submit">Créer ma boutique — ${esc(env.TRIAL_DAYS || '14')} jours offerts</button>
    </form>
    <p class="small muted">Déjà inscrit ? <a href="/connexion">Se connecter</a></p></div>`;
  return html(page({ title: 'Créer ma boutique', body }));
}

async function signupPost(request, env) {
  const f = await readForm(request);
  const values = {
    name: clean(f.get('name'), 60), slug: slugify(f.get('slug') || f.get('name')),
    email: clean(f.get('email'), 120).toLowerCase(), plan: PLANS[f.get('plan')] ? f.get('plan') : 'mini',
    billing: f.get('billing') === 'annuel' ? 'annuel' : 'mensuel',
  };
  const password = String(f.get('password') || '');
  const fail = (msg) => {
    const u = new URL(request.url); u.searchParams.set('err', msg);
    return signupForm(env, u, values);
  };
  if (!values.name) return fail('Indiquez le nom de la boutique.');
  if (!values.slug || values.slug.length < 3 || RESERVED_SLUGS.has(values.slug)) return fail('Cette adresse de boutique n’est pas disponible.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) return fail('Adresse e-mail invalide.');
  if (password.length < 8) return fail('Le mot de passe doit faire au moins 8 caractères.');
  if (!f.get('cgu')) return fail('Merci d’accepter les conditions générales.');

  const exists = await env.DB.prepare('SELECT slug, email FROM tenants WHERE slug = ? OR email = ?').bind(values.slug, values.email).first();
  if (exists) return fail(exists.email === values.email ? 'Un compte existe déjà avec cet e-mail.' : 'Cette adresse de boutique est déjà prise.');

  const { hash, salt } = await hashPassword(password);
  const id = uid('t_');
  const paidUntil = addDays(nowIso(), int(env.TRIAL_DAYS, 14));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tenants (id, slug, name, email, password_hash, salt, plan, billing, status, paid_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'essai', ?)`).bind(id, values.slug, values.name, values.email, hash, salt, values.plan, values.billing, paidUntil),
    env.DB.prepare(`INSERT INTO billing_events (id, tenant_id, kind, detail) VALUES (?, ?, 'essai', ?)`).bind(uid('b_'), id, `Essai jusqu'au ${paidUntil.slice(0, 10)}`),
  ]);
  return startSession(env, id, '/tableau-de-bord?ok=' + encodeURIComponent('Bienvenue ! Complétez votre boutique en 3 étapes ci-dessous.'));
}

function loginForm(url) {
  const body = `<div class="card" style="max-width:440px;margin:0 auto">
    <h1>Connexion</h1>${flash(url)}
    <form method="post">
      <label for="email">E-mail</label><input id="email" name="email" type="email" required>
      <label for="password">Mot de passe</label><input id="password" name="password" type="password" required>
      <button class="btn" type="submit">Se connecter</button>
    </form>
    <p class="small muted">Pas encore de boutique ? <a href="/inscription">Créer ma boutique</a></p></div>`;
  return html(page({ title: 'Connexion', body }));
}

async function loginPost(request, env) {
  const f = await readForm(request);
  const email = clean(f.get('email'), 120).toLowerCase();
  const password = String(f.get('password') || '');
  const t = await env.DB.prepare('SELECT id, password_hash, salt FROM tenants WHERE email = ?').bind(email).first();
  // On calcule toujours un hash pour ne pas révéler l'existence du compte par le temps de réponse
  const { hash } = await hashPassword(password, t ? t.salt : 'leurre-sel-constant');
  if (!t || !safeEqual(hash, t.password_hash)) return redirect('/connexion?err=' + encodeURIComponent('E-mail ou mot de passe incorrect.'));
  return startSession(env, t.id, '/tableau-de-bord');
}

async function startSession(env, tenantId, to) {
  const tok = token();
  await env.DB.prepare('INSERT INTO sessions (token, tenant_id, expires_at) VALUES (?, ?, ?)').bind(tok, tenantId, addDays(nowIso(), SESSION_DAYS)).run();
  return redirect(to, { 'set-cookie': setCookie(SESSION_COOKIE, tok, SESSION_DAYS * 86400) });
}

async function logout(request, env) {
  const tok = getCookie(request, SESSION_COOKIE);
  if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(tok).run();
  return redirect('/connexion?ok=' + encodeURIComponent('Vous êtes déconnecté.'), { 'set-cookie': setCookie(SESSION_COOKIE, '', 0) });
}

async function currentTenant(request, env) {
  const tok = getCookie(request, SESSION_COOKIE);
  if (!tok) return null;
  return env.DB.prepare(`SELECT t.* FROM sessions s JOIN tenants t ON t.id = s.tenant_id WHERE s.token = ? AND s.expires_at > ?`).bind(tok, nowIso()).first();
}

// ───────────────────────────── Statut & quotas ─────────────────────────────

function isOffline(tenant, env) {
  if (tenant.status === 'suspendu') return true;
  return new Date(addDays(tenant.paid_until, int(env.GRACE_DAYS, 3))) < new Date();
}

async function usage(env, tenantId) {
  const r = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM products WHERE tenant_id = ?1) AS products,
      (SELECT COUNT(*) FROM orders WHERE tenant_id = ?1 AND status != 'annulee' AND created_at >= ?2) AS sales,
      (SELECT COALESCE(SUM(total_xpf),0) FROM orders WHERE tenant_id = ?1 AND status IN ('payee','expediee') AND created_at >= ?2) AS revenue,
      (SELECT COUNT(*) FROM orders WHERE tenant_id = ?1 AND status = 'en_attente') AS pending,
      (SELECT COUNT(*) FROM orders WHERE tenant_id = ?1 AND over_quota = 1 AND status != 'annulee' AND created_at >= ?2) AS overQuota`)
    .bind(tenantId, monthStartSql()).first();
  return r;
}

function paymentMethodsOf(t) {
  const m = [];
  if (t.bank_details) m.push('virement');
  if (t.ccp_details) m.push('ccp');
  if (t.osb_link) m.push('carte');
  return m;
}

function shopUrl(env, t, origin) {
  return env.ROOT_DOMAIN ? `https://${t.slug}.${env.ROOT_DOMAIN}` : `${origin}/s/${t.slug}`;
}

// ───────────────────────────── Tableau de bord ─────────────────────────────

async function dashboard(request, env, url, t, sub) {
  const method = request.method;
  const [section, id, action] = sub;

  if (!section) return dashHome(env, url, t);
  if (section === 'boutique') return method === 'POST' ? shopSettingsPost(request, env, t) : shopSettingsForm(url, t);
  if (section === 'produits') {
    if (!id) return method === 'POST' ? productCreate(request, env, t) : productList(env, url, t);
    if (action === 'supprimer' && method === 'POST') return productDelete(env, t, id);
    return method === 'POST' ? productUpdate(request, env, t, id) : productEditForm(env, url, t, id);
  }
  if (section === 'commandes') {
    if (!id) return orderList(env, url, t);
    if (action === 'statut' && method === 'POST') return orderStatus(request, env, t, id);
    return orderSlip(env, t, id);
  }
  return notFound();
}

async function dashHome(env, url, t) {
  const plan = getPlan(t.plan);
  const u = await usage(env, t.id);
  const offline = isOffline(t, env);
  const methods = paymentMethodsOf(t);
  const link = shopUrl(env, t, url.origin);
  const payLink = env['PAY_LINK_' + plan.key.toUpperCase()];
  const steps = [
    [methods.length > 0, 'Indiquez au moins un moyen de paiement (RIB, guichet ou lien OSB)', '/tableau-de-bord/boutique'],
    [u.products > 0, 'Ajoutez votre premier produit', '/tableau-de-bord/produits'],
    [!!(t.phone || t.whatsapp), 'Ajoutez un numéro de contact', '/tableau-de-bord/boutique'],
  ];
  const todo = steps.filter((s) => !s[0]);
  const body = `${flash(url)}
  ${offline ? `<div class="flash err"><b>Votre boutique est hors ligne</b> : l’abonnement n’est pas à jour. Réglez votre abonnement pour la remettre en ligne immédiatement.</div>` : ''}
  <div class="card">
    <h1>${esc(t.name)}</h1>
    <p>Votre boutique : <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a></p>
    <p><span class="badge ${esc(t.status)}">${esc({ essai: 'Période d’essai', actif: 'Actif', suspendu: 'Suspendu' }[t.status] || t.status)}</span>
    <span class="muted small">· ${esc(plan.label)} · ${t.billing === 'annuel' ? 'annuel' : 'mensuel'} · réglé jusqu’au ${fmtDate(t.paid_until)}</span></p>
  </div>
  ${todo.length ? `<div class="card"><h2>À faire pour ouvrir votre boutique</h2><ol>${todo.map((s) => `<li><a href="${s[2]}">${s[1]}</a></li>`).join('')}</ol></div>` : ''}
  <div class="stats">
    <div class="stat"><b>${u.products} / ${plan.maxProducts}</b><span>produits</span>${meter(u.products, plan.maxProducts)}</div>
    <div class="stat"><b>${u.sales} / ${plan.salesQuota}</b><span>ventes ce mois</span>${meter(u.sales, plan.salesQuota)}</div>
    <div class="stat"><b>${fmtXpf(u.revenue)}</b><span>encaissé ce mois</span></div>
    <div class="stat"><b>${u.pending}</b><span>commande(s) à traiter</span></div>
  </div>
  ${u.overQuota > 0 ? `<div class="flash err">${u.overQuota} vente(s) ce mois au-delà de votre quota. Elles seront facturées en supplément, ou passez à la formule supérieure.</div>` : ''}
  <div class="card">
    <h2>Mon abonnement</h2>
    <p>${esc(plan.label)} : <b>${fmtXpf(plan.monthly)}</b> / mois ou <b>${fmtXpf(annualPrice(plan))}</b> / an.</p>
    ${payLink ? `<a class="btn" href="${esc(payLink)}" target="_blank" rel="noopener">Régler mon abonnement</a>` : `<p class="muted">Pour régler votre abonnement, contactez <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a>.</p>`}
    <p class="small muted">Changer de formule ou ouvrir le paiement par carte (dossier OSB) : <a href="mailto:${esc(env.SUPPORT_EMAIL)}?subject=${encodeURIComponent('Boutique ' + t.slug)}">écrire au support</a>.</p>
  </div>`;
  return html(page({ title: 'Tableau de bord', body, nav: dashNav('/tableau-de-bord'), brandHref: '/tableau-de-bord' }));
}

function shopSettingsForm(url, t) {
  const body = `${flash(url)}<div class="card"><h1>Ma boutique</h1>
  <form method="post">
    <div class="row">
      <div><label for="name">Nom</label><input id="name" name="name" required maxlength="60" value="${esc(t.name)}"></div>
      <div><label for="theme">Modèle graphique</label><select id="theme" name="theme">${Object.entries(THEME_NAMES).map(([k, v]) => `<option value="${k}" ${k === t.theme ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <label for="tagline">Phrase d’accroche</label><input id="tagline" name="tagline" maxlength="140" value="${esc(t.tagline)}">
    <div class="row">
      <div><label for="phone">Téléphone</label><input id="phone" name="phone" maxlength="30" value="${esc(t.phone)}"></div>
      <div><label for="whatsapp">WhatsApp (format international, ex. 68989123456)</label><input id="whatsapp" name="whatsapp" maxlength="20" value="${esc(t.whatsapp)}"></div>
      <div><label for="island">Île</label><select id="island" name="island"><option value=""></option>${ISLANDS.map((i) => `<option ${i === t.island ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
    </div>
    <h2 style="margin-top:22px">Moyens de paiement</h2>
    <p class="muted small">L’argent va directement sur votre compte. Remplissez au moins un moyen.</p>
    <label for="bank_details">Virement : votre RIB (titulaire, banque, IBAN)</label><textarea id="bank_details" name="bank_details" maxlength="600">${esc(t.bank_details)}</textarea>
    <label for="ccp_details">Espèces au guichet (CCP / Marara Paiement) : vos consignes</label><textarea id="ccp_details" name="ccp_details" maxlength="600">${esc(t.ccp_details)}</textarea>
    <label for="osb_link">Carte bancaire : lien de paiement fourni par OSB / PayZen (https://…)</label><input id="osb_link" name="osb_link" maxlength="500" value="${esc(t.osb_link)}">
    <label for="pickup_info">Livraison / retrait (délais, envoi postal, point de retrait)</label><textarea id="pickup_info" name="pickup_info" maxlength="600">${esc(t.pickup_info)}</textarea>
    <button class="btn" type="submit">Enregistrer</button>
  </form></div>`;
  return html(page({ title: 'Ma boutique', body, nav: dashNav('/tableau-de-bord/boutique'), brandHref: '/tableau-de-bord' }));
}

async function shopSettingsPost(request, env, t) {
  const f = await readForm(request);
  const osb = clean(f.get('osb_link'), 500);
  if (osb && !/^https:\/\/[^\s]+$/.test(osb)) return redirect('/tableau-de-bord/boutique?err=' + encodeURIComponent('Le lien OSB doit commencer par https://'));
  const theme = THEME_NAMES[f.get('theme')] ? f.get('theme') : 'lagon';
  const island = ISLANDS.includes(f.get('island')) ? f.get('island') : '';
  const name = clean(f.get('name'), 60) || t.name;
  await env.DB.prepare(`UPDATE tenants SET name=?, tagline=?, theme=?, phone=?, whatsapp=?, island=?, bank_details=?, ccp_details=?, osb_link=?, pickup_info=? WHERE id=?`)
    .bind(name, clean(f.get('tagline'), 140), theme, clean(f.get('phone'), 30), clean(f.get('whatsapp'), 20).replace(/[^0-9]/g, ''),
      island, clean(f.get('bank_details'), 600), clean(f.get('ccp_details'), 600), osb, clean(f.get('pickup_info'), 600), t.id).run();
  return redirect('/tableau-de-bord/boutique?ok=' + encodeURIComponent('Boutique enregistrée.'));
}

// ───────────── Produits ─────────────

function productFields(p = {}) {
  return `
    <label for="pname">Nom du produit</label><input id="pname" name="name" required maxlength="80" value="${esc(p.name)}">
    <div class="row">
      <div><label for="price">Prix (XPF)</label><input id="price" name="price" type="number" min="0" step="1" required value="${esc(p.price_xpf ?? '')}"></div>
      <div><label for="stock">Stock</label><input id="stock" name="stock" type="number" min="0" step="1" required value="${esc(p.stock ?? 1)}"></div>
    </div>
    <label for="desc">Description</label><textarea id="desc" name="description" maxlength="1200">${esc(p.description)}</textarea>
    <label for="image">Photo (JPG, PNG ou WebP, 2 Mo max)</label><input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp">
    <label style="font-weight:400"><input type="checkbox" name="active" style="width:auto" ${p.active === 0 ? '' : 'checked'}> Visible dans la boutique</label>`;
}

async function productList(env, url, t) {
  const plan = getPlan(t.plan);
  const { results } = await env.DB.prepare('SELECT * FROM products WHERE tenant_id = ? ORDER BY created_at DESC, rowid DESC').bind(t.id).all();
  const full = results.length >= plan.maxProducts;
  const body = `${flash(url)}
  <div class="card"><h1>Produits <span class="muted small">${results.length} / ${plan.maxProducts}</span></h1>${meter(results.length, plan.maxProducts)}
  ${results.length ? `<div class="table-scroll"><table><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th><th>Visible</th><th></th></tr></thead><tbody>
  ${results.map((p) => `<tr><td>${esc(p.name)}</td><td>${fmtXpf(p.price_xpf)}</td><td>${p.stock}</td><td>${p.active ? 'Oui' : 'Non'}</td>
    <td><a class="btn small ghost" href="/tableau-de-bord/produits/${p.id}">Modifier</a></td></tr>`).join('')}
  </tbody></table></div>` : '<p class="muted">Aucun produit pour l’instant.</p>'}</div>
  <div class="card"><h2>Ajouter un produit</h2>
  ${full ? `<p>Vous avez atteint la limite de ${plan.maxProducts} produits de la formule ${esc(plan.label)}. <a href="mailto:${esc(env.SUPPORT_EMAIL)}">Passer à la formule supérieure</a>.</p>` :
    `<form method="post" enctype="multipart/form-data">${productFields()}<button class="btn" type="submit">Ajouter</button></form>`}</div>`;
  return html(page({ title: 'Produits', body, nav: dashNav('/tableau-de-bord/produits'), brandHref: '/tableau-de-bord' }));
}

async function storeImage(env, t, file) {
  if (!file || typeof file === 'string' || !file.size) return { key: null };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: 'Format de photo non accepté (JPG, PNG ou WebP).' };
  if (file.size > MAX_IMAGE_BYTES) return { error: 'Photo trop lourde (2 Mo maximum).' };
  const key = `${t.id}/${uid()}.${ext}`;
  await env.IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return { key };
}

function readProduct(f) {
  return {
    name: clean(f.get('name'), 80), description: clean(f.get('description'), 1200),
    price: Math.max(0, int(f.get('price'), -1)), stock: Math.max(0, int(f.get('stock'), 0)),
    active: f.get('active') ? 1 : 0, rawPrice: int(f.get('price'), -1),
  };
}

async function productCreate(request, env, t) {
  const plan = getPlan(t.plan);
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE tenant_id = ?').bind(t.id).first()).n;
  if (count >= plan.maxProducts) return redirect('/tableau-de-bord/produits?err=' + encodeURIComponent(`Limite de ${plan.maxProducts} produits atteinte.`));
  const f = await readForm(request);
  const p = readProduct(f);
  if (!p.name || p.rawPrice < 0) return redirect('/tableau-de-bord/produits?err=' + encodeURIComponent('Nom et prix obligatoires.'));
  const img = await storeImage(env, t, f.get('image'));
  if (img.error) return redirect('/tableau-de-bord/produits?err=' + encodeURIComponent(img.error));
  await env.DB.prepare('INSERT INTO products (id, tenant_id, name, description, price_xpf, stock, image_key, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(uid('p_'), t.id, p.name, p.description, p.price, p.stock, img.key || '', p.active).run();
  return redirect('/tableau-de-bord/produits?ok=' + encodeURIComponent('Produit ajouté.'));
}

async function productEditForm(env, url, t, id) {
  const p = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').bind(id, t.id).first();
  if (!p) return notFound();
  const body = `${flash(url)}<div class="card"><h1>Modifier le produit</h1>
    ${p.image_key ? `<img src="/img/${esc(p.image_key)}" alt="" style="max-width:220px;border-radius:12px;margin-bottom:8px">` : ''}
    <form method="post" enctype="multipart/form-data">${productFields(p)}<button class="btn" type="submit">Enregistrer</button></form>
    <form method="post" action="/tableau-de-bord/produits/${p.id}/supprimer" onsubmit="return confirm('Supprimer ce produit ?')" class="noprint">
      <button class="btn danger small" type="submit" style="margin-top:22px">Supprimer le produit</button></form></div>`;
  return html(page({ title: 'Modifier le produit', body, nav: dashNav('/tableau-de-bord/produits'), brandHref: '/tableau-de-bord' }));
}

async function productUpdate(request, env, t, id) {
  const existing = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').bind(id, t.id).first();
  if (!existing) return notFound();
  const f = await readForm(request);
  const p = readProduct(f);
  if (!p.name || p.rawPrice < 0) return redirect(`/tableau-de-bord/produits/${id}?err=` + encodeURIComponent('Nom et prix obligatoires.'));
  const img = await storeImage(env, t, f.get('image'));
  if (img.error) return redirect(`/tableau-de-bord/produits/${id}?err=` + encodeURIComponent(img.error));
  if (img.key && existing.image_key) await env.IMAGES.delete(existing.image_key);
  await env.DB.prepare('UPDATE products SET name=?, description=?, price_xpf=?, stock=?, active=?, image_key=? WHERE id=? AND tenant_id=?')
    .bind(p.name, p.description, p.price, p.stock, p.active, img.key || existing.image_key, id, t.id).run();
  return redirect('/tableau-de-bord/produits?ok=' + encodeURIComponent('Produit enregistré.'));
}

async function productDelete(env, t, id) {
  const p = await env.DB.prepare('SELECT image_key FROM products WHERE id = ? AND tenant_id = ?').bind(id, t.id).first();
  if (!p) return notFound();
  if (p.image_key) await env.IMAGES.delete(p.image_key);
  await env.DB.prepare('DELETE FROM products WHERE id = ? AND tenant_id = ?').bind(id, t.id).run();
  return redirect('/tableau-de-bord/produits?ok=' + encodeURIComponent('Produit supprimé.'));
}

// ───────────── Commandes ─────────────

async function orderList(env, url, t) {
  const filter = ORDER_STATUSES[url.searchParams.get('statut')] ? url.searchParams.get('statut') : '';
  const q = filter
    ? env.DB.prepare('SELECT * FROM orders WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT 200').bind(t.id, filter)
    : env.DB.prepare('SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200').bind(t.id);
  const { results } = await q.all();
  const tabs = [['', 'Toutes'], ...Object.entries(ORDER_STATUSES)].map(([k, v]) =>
    `<a class="btn small ${k === filter ? '' : 'ghost'}" href="/tableau-de-bord/commandes${k ? '?statut=' + k : ''}">${v}</a>`).join(' ');
  const body = `${flash(url)}<div class="card"><h1>Commandes</h1><div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:12px">${tabs}</div>
  ${results.length ? `<div class="table-scroll"><table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th></th></tr></thead><tbody>
  ${results.map((o) => `<tr><td>${esc(o.number)}${o.over_quota ? ' <span class="badge suspendu">hors quota</span>' : ''}</td><td>${fmtDate(o.created_at)}</td>
    <td>${esc(o.customer_name)}<br><span class="muted small">${esc(o.island)} · ${esc(o.customer_phone)}</span></td>
    <td>${fmtXpf(o.total_xpf)}</td><td class="small">${esc(PAYMENT_METHODS[o.payment_method] || o.payment_method)}</td>
    <td><span class="badge ${esc(o.status)}">${esc(ORDER_STATUSES[o.status] || o.status)}</span></td>
    <td><a class="btn small ghost" href="/tableau-de-bord/commandes/${o.id}">Ouvrir</a></td></tr>`).join('')}
  </tbody></table></div>` : '<p class="muted">Aucune commande.</p>'}</div>`;
  return html(page({ title: 'Commandes', body, nav: dashNav('/tableau-de-bord/commandes'), brandHref: '/tableau-de-bord' }));
}

async function orderSlip(env, t, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').bind(id, t.id).first();
  if (!o) return notFound();
  const items = JSON.parse(o.items_json);
  const statusForm = `<form method="post" action="/tableau-de-bord/commandes/${o.id}/statut" class="row noprint" style="align-items:end">
      <div><label for="status">Statut</label><select id="status" name="status">${Object.entries(ORDER_STATUSES).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><button class="btn" type="submit">Mettre à jour</button> <button class="btn ghost" type="button" onclick="window.print()">Imprimer bon + étiquette</button></div>
    </form>`;
  const body = `<div class="card noprint"><a href="/tableau-de-bord/commandes">← Commandes</a>${statusForm}</div>
  <div class="card">
    <h1>Bon de commande ${esc(o.number)}</h1>
    <p class="muted">${esc(t.name)} · ${fmtDate(o.created_at)} · ${esc(PAYMENT_METHODS[o.payment_method] || '')} · <span class="badge ${esc(o.status)}">${esc(ORDER_STATUSES[o.status])}</span></p>
    <table><thead><tr><th>Article</th><th>Qté</th><th>Prix</th><th>Sous-total</th></tr></thead><tbody>
    ${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${fmtXpf(i.price)}</td><td>${fmtXpf(i.price * i.qty)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Total</b></td><td><b>${fmtXpf(o.total_xpf)}</b></td></tr></tbody></table>
    ${o.note ? `<p><b>Note du client :</b> ${esc(o.note)}</p>` : ''}
  </div>
  <div class="card" style="border:2px dashed var(--ink);max-width:420px">
    <p class="small muted" style="margin:0">EXPÉDITEUR : ${esc(t.name)}${t.island ? ' — ' + esc(t.island) : ''}${t.phone ? ' — ' + esc(t.phone) : ''}</p>
    <h2 style="margin:14px 0 6px">${esc(o.customer_name)}</h2>
    <p style="margin:0;white-space:pre-line;font-size:1.1rem">${esc(o.address)}</p>
    <p style="margin:6px 0 0;font-size:1.2rem;font-weight:700">${esc(o.island)} — Polynésie française</p>
    <p class="small" style="margin:8px 0 0">Tél. ${esc(o.customer_phone)} · Réf. ${esc(o.number)}</p>
  </div>`;
  return html(page({ title: `Commande ${o.number}`, body, nav: dashNav('/tableau-de-bord/commandes'), brandHref: '/tableau-de-bord' }));
}

async function orderStatus(request, env, t, id) {
  const f = await readForm(request);
  const status = String(f.get('status') || '');
  if (!ORDER_STATUSES[status]) return redirect(`/tableau-de-bord/commandes/${id}`);
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').bind(id, t.id).first();
  if (!o) return notFound();
  const stmts = [env.DB.prepare('UPDATE orders SET status = ? WHERE id = ? AND tenant_id = ?').bind(status, id, t.id)];
  const items = JSON.parse(o.items_json);
  // Annulation : on remet le stock ; réactivation d'une commande annulée : on le reprend
  if (status === 'annulee' && o.status !== 'annulee') {
    for (const i of items) stmts.push(env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND tenant_id = ?').bind(i.qty, i.id, t.id));
  } else if (o.status === 'annulee' && status !== 'annulee') {
    for (const i of items) stmts.push(env.DB.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND tenant_id = ?').bind(i.qty, i.id, t.id));
  }
  await env.DB.batch(stmts);
  return redirect(`/tableau-de-bord/commandes/${id}?ok=` + encodeURIComponent('Statut mis à jour.'));
}

// ───────────────────────────── Vitrine publique ─────────────────────────────

async function storefront(request, env, url, slug, sub, base) {
  const t = await env.DB.prepare('SELECT * FROM tenants WHERE slug = ?').bind(slug).first();
  if (!t) return notFound();
  if (isOffline(t, env)) {
    return html(page({ title: 'Boutique indisponible', theme: t.theme, brand: t.name, brandHref: base || '/',
      body: '<div class="card"><h1>Boutique momentanément indisponible</h1><p class="muted">Revenez bientôt.</p></div>' }), 503, { 'cache-control': 'no-store' });
  }
  if (sub === '/' && request.method === 'GET') return shopHome(env, url, t, base);
  if (sub === '/commander' && request.method === 'POST') return placeOrder(request, env, t, base);
  const m = sub.match(/^\/commande\/([a-z0-9_]+)$/);
  if (m && request.method === 'GET') return orderConfirmation(env, t, m[1], base);
  return notFound();
}

async function shopHome(env, url, t, base) {
  const { results } = await env.DB.prepare('SELECT * FROM products WHERE tenant_id = ? AND active = 1 ORDER BY created_at DESC, rowid DESC').bind(t.id).all();
  const methods = paymentMethodsOf(t);
  const canOrder = methods.length > 0 && results.some((p) => p.stock > 0);
  const products = results.map((p) => `
    <article class="product">
      <div class="ph">${p.image_key ? `<img src="/img/${esc(p.image_key)}" alt="${esc(p.name)}" loading="lazy">` : 'Photo à venir'}</div>
      <div class="body">
        <h3 style="margin:0">${esc(p.name)}</h3>
        ${p.description ? `<p class="muted small" style="margin:0;white-space:pre-line">${esc(p.description)}</p>` : ''}
        <div class="price">${fmtXpf(p.price_xpf)}</div>
        ${p.stock > 0 && methods.length
          ? `<div class="qty"><label for="q_${p.id}" style="margin:0">Quantité</label><input form="order" id="q_${p.id}" name="q_${p.id}" type="number" min="0" max="${p.stock}" value="0"></div>`
          : `<span class="badge suspendu">${p.stock > 0 ? 'Sur demande' : 'Épuisé'}</span>`}
      </div>
    </article>`).join('');
  const wa = t.whatsapp ? `<a class="btn ghost small" href="https://wa.me/${esc(t.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : '';
  const body = `${flash(url)}
  <section class="hero" style="padding-top:8px"><h1>${esc(t.name)}</h1>${t.tagline ? `<p>${esc(t.tagline)}</p>` : ''}
    <p class="small muted">${t.island ? esc(t.island) + ' · ' : ''}${t.phone ? esc(t.phone) : ''} ${wa}</p></section>
  ${results.length ? `<div class="grid">${products}</div>` : '<div class="card"><p class="muted">Les produits arrivent bientôt.</p></div>'}
  ${canOrder ? `
  <div class="card" style="margin-top:24px"><h2>Passer commande</h2>
    <p class="muted small">Choisissez les quantités ci-dessus, puis remplissez vos coordonnées. Vous recevrez les instructions de paiement à l’écran.</p>
    <form id="order" method="post" action="${base}/commander">
      <div class="row">
        <div><label for="cn">Nom complet</label><input id="cn" name="customer_name" required maxlength="80"></div>
        <div><label for="cp">Téléphone</label><input id="cp" name="customer_phone" required maxlength="30"></div>
        <div><label for="ce">E-mail (facultatif)</label><input id="ce" name="customer_email" type="email" maxlength="120"></div>
      </div>
      <div class="row">
        <div><label for="ad">Adresse de livraison (BP, quartier, PK…)</label><textarea id="ad" name="address" required maxlength="400"></textarea></div>
        <div><label for="is">Île</label><select id="is" name="island" required><option value=""></option>${ISLANDS.map((i) => `<option>${i}</option>`).join('')}</select>
          <label for="pm">Paiement</label><select id="pm" name="payment_method" required>${methods.map((m) => `<option value="${m}">${esc(PAYMENT_METHODS[m])}</option>`).join('')}</select></div>
      </div>
      <label for="nt">Note (facultatif)</label><input id="nt" name="note" maxlength="300">
      <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <button class="btn" type="submit">Valider ma commande</button>
    </form>
    ${t.pickup_info ? `<p class="small muted" style="white-space:pre-line">${esc(t.pickup_info)}</p>` : ''}
  </div>` : ''}`;
  return html(page({ title: t.name, body, theme: t.theme, brand: t.name, brandHref: base || '/', description: t.tagline || `Boutique ${t.name}` }));
}

async function placeOrder(request, env, t, base) {
  const back = (msg) => redirect(`${base || ''}/?err=` + encodeURIComponent(msg));
  const f = await readForm(request);
  if (f.get('website')) return back('Commande refusée.'); // pot de miel anti-robots
  const methods = paymentMethodsOf(t);
  const payment = String(f.get('payment_method') || '');
  if (!methods.includes(payment)) return back('Choisissez un moyen de paiement.');
  const customer = {
    name: clean(f.get('customer_name'), 80), phone: clean(f.get('customer_phone'), 30),
    email: clean(f.get('customer_email'), 120), address: clean(f.get('address'), 400),
    island: ISLANDS.includes(f.get('island')) ? f.get('island') : '', note: clean(f.get('note'), 300),
  };
  if (!customer.name || !customer.phone || !customer.address || !customer.island) return back('Merci de remplir nom, téléphone, adresse et île.');

  const wanted = [];
  for (const [k, v] of f.entries()) {
    if (k.startsWith('q_')) { const q = int(v, 0); if (q > 0) wanted.push({ id: k.slice(2), qty: Math.min(q, 999) }); }
  }
  if (!wanted.length) return back('Choisissez au moins un produit (quantité).');

  const { results: products } = await env.DB.prepare(`SELECT id, name, price_xpf, stock FROM products WHERE tenant_id = ? AND active = 1 AND id IN (${wanted.map(() => '?').join(',')})`)
    .bind(t.id, ...wanted.map((w) => w.id)).all();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const items = [];
  for (const w of wanted) {
    const p = byId[w.id];
    if (!p) return back('Un produit n’est plus disponible.');
    if (p.stock < w.qty) return back(`Stock insuffisant pour « ${p.name} » (reste ${p.stock}).`);
    items.push({ id: p.id, name: p.name, qty: w.qty, price: p.price_xpf });
  }

  // Réservation du stock de façon atomique produit par produit ; on annule en cas d'échec concurrent
  const reserved = [];
  for (const i of items) {
    const r = await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND tenant_id = ? AND stock >= ?').bind(i.qty, i.id, t.id, i.qty).run();
    if (!r.meta.changes) {
      if (reserved.length) await env.DB.batch(reserved.map((x) => env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND tenant_id = ?').bind(x.qty, x.id, t.id)));
      return back(`« ${i.name} » vient d’être épuisé.`);
    }
    reserved.push(i);
  }

  const plan = getPlan(t.plan);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const monthSales = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE tenant_id = ? AND status != 'annulee' AND created_at >= ?`).bind(t.id, monthStartSql()).first()).n;
  const overQuota = monthSales >= plan.salesQuota ? 1 : 0;
  const id = uid('o_');
  const tahiti = new Date(Date.now() - 10 * 3600000);
  const prefix = `CMD-${String(tahiti.getUTCFullYear()).slice(2)}${String(tahiti.getUTCMonth() + 1).padStart(2, '0')}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE tenant_id = ? AND number LIKE ?').bind(t.id, prefix + '%').first()).n + 1 + attempt;
    const number = prefix + String(n).padStart(4, '0');
    try {
      await env.DB.prepare(`INSERT INTO orders (id, tenant_id, number, customer_name, customer_email, customer_phone, address, island, note, items_json, total_xpf, payment_method, over_quota)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, t.id, number, customer.name, customer.email, customer.phone, customer.address, customer.island, customer.note,
          JSON.stringify(items), total, payment, overQuota).run();
      return redirect(`${base}/commande/${id}`);
    } catch (e) {
      if (!String(e).includes('UNIQUE')) {
        await env.DB.batch(reserved.map((x) => env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND tenant_id = ?').bind(x.qty, x.id, t.id)));
        throw e;
      }
    }
  }
  await env.DB.batch(reserved.map((x) => env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND tenant_id = ?').bind(x.qty, x.id, t.id)));
  return back('Merci de réessayer dans un instant.');
}

async function orderConfirmation(env, t, id, base) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').bind(id, t.id).first();
  if (!o) return notFound();
  const items = JSON.parse(o.items_json);
  let pay = '';
  if (o.payment_method === 'virement') pay = `<p>Effectuez un virement de <b>${fmtXpf(o.total_xpf)}</b> avec la référence <b>${esc(o.number)}</b> :</p><pre style="white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:10px">${esc(t.bank_details)}</pre>`;
  if (o.payment_method === 'ccp') pay = `<p>Réglez <b>${fmtXpf(o.total_xpf)}</b> en espèces au guichet en indiquant la référence <b>${esc(o.number)}</b> :</p><pre style="white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:10px">${esc(t.ccp_details)}</pre>`;
  if (o.payment_method === 'carte') pay = `<p>Réglez <b>${fmtXpf(o.total_xpf)}</b> par carte sur la page sécurisée de la banque. Indiquez la référence <b>${esc(o.number)}</b>.</p><a class="btn" href="${esc(t.osb_link)}" target="_blank" rel="noopener">Payer par carte</a>`;
  const waText = encodeURIComponent(`Bonjour, je viens de passer la commande ${o.number} (${fmtXpf(o.total_xpf)}).`);
  const body = `<div class="card"><h1>Merci, commande enregistrée</h1>
    <p>Référence : <b>${esc(o.number)}</b> — notez-la.</p>
    <ul>${items.map((i) => `<li>${i.qty} × ${esc(i.name)} — ${fmtXpf(i.price * i.qty)}</li>`).join('')}</ul>
    <p><b>Total : ${fmtXpf(o.total_xpf)}</b></p></div>
    <div class="card"><h2>Paiement</h2>${pay}
    <p class="small muted">La commande est préparée dès réception du paiement par ${esc(t.name)}.</p>
    ${t.whatsapp ? `<a class="btn ghost" href="https://wa.me/${esc(t.whatsapp)}?text=${waText}" target="_blank" rel="noopener">Prévenir la boutique sur WhatsApp</a>` : ''}
    <p><a href="${base || '/'}">← Retour à la boutique</a></p></div>`;
  return html(page({ title: `Commande ${o.number}`, body, theme: t.theme, brand: t.name, brandHref: base || '/' }), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
}

async function serveImage(url, env) {
  const key = decodeURIComponent(url.pathname.replace(/^\/img\//, ''));
  if (!/^t_[a-f0-9]+\/[a-f0-9]+\.(jpg|png|webp)$/.test(key)) return new Response('Introuvable', { status: 404 });
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Introuvable', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(obj.body, { headers });
}

// ───────────────────────────── Administration Hinova ─────────────────────────────

function isAdmin(request, env) {
  return !!env.ADMIN_TOKEN && safeEqual(getCookie(request, ADMIN_COOKIE) || '', env.ADMIN_TOKEN);
}

async function admin(request, env, url, sub) {
  if (sub[0] === 'connexion') {
    if (request.method === 'POST') {
      const f = await readForm(request);
      if (env.ADMIN_TOKEN && safeEqual(String(f.get('token') || ''), env.ADMIN_TOKEN)) {
        return redirect('/admin', { 'set-cookie': setCookie(ADMIN_COOKIE, env.ADMIN_TOKEN, 12 * 3600) });
      }
      return redirect('/admin/connexion?err=' + encodeURIComponent('Clé incorrecte.'));
    }
    return html(page({ title: 'Admin', body: `<div class="card" style="max-width:420px;margin:0 auto"><h1>Administration</h1>${flash(url)}
      <form method="post"><label for="tk">Clé d’administration</label><input id="tk" name="token" type="password" required><button class="btn">Entrer</button></form></div>` }));
  }
  if (!isAdmin(request, env)) return redirect('/admin/connexion');

  if (request.method === 'POST' && sub[0] && sub[1]) return adminAction(request, env, sub[0], sub[1]);

  const { results } = await env.DB.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id) AS n_products,
      (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id AND o.status != 'annulee' AND o.created_at >= ?) AS n_sales,
      (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id AND o.over_quota = 1 AND o.status != 'annulee' AND o.created_at >= ?) AS n_over
    FROM tenants t ORDER BY t.created_at DESC`).bind(monthStartSql(), monthStartSql()).all();
  const active = results.filter((t) => t.status === 'actif');
  const mrr = active.reduce((s, t) => s + (t.billing === 'annuel' ? Math.round(annualPrice(getPlan(t.plan)) / 12) : getPlan(t.plan).monthly), 0);
  const rows = results.map((t) => {
    const plan = getPlan(t.plan);
    return `<tr>
      <td><b>${esc(t.name)}</b><br><a class="small" href="/s/${esc(t.slug)}" target="_blank">/s/${esc(t.slug)}</a><br><span class="small muted">${esc(t.email)}</span></td>
      <td>${esc(plan.label)}<br><span class="small muted">${esc(t.billing)}</span></td>
      <td><span class="badge ${esc(t.status)}">${esc(t.status)}</span><br><span class="small muted">jusqu’au ${fmtDate(t.paid_until)}</span></td>
      <td>${t.n_products}/${plan.maxProducts}<br><span class="small muted">${t.n_sales}/${plan.salesQuota} ventes${t.n_over ? ` · <b style="color:var(--danger)">${t.n_over} hors quota</b>` : ''}</span></td>
      <td style="min-width:220px">
        <form method="post" action="/admin/${t.id}/paiement" class="row" style="gap:6px;align-items:center">
          <select name="months" style="width:auto"><option value="1">+1 mois</option><option value="12">+12 mois (annuel)</option></select>
          <button class="btn small">Encaisser</button></form>
        <form method="post" action="/admin/${t.id}/formule" class="row" style="gap:6px;align-items:center;margin-top:6px">
          <select name="plan" style="width:auto">${Object.values(PLANS).map((p) => `<option value="${p.key}" ${p.key === t.plan ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
          <button class="btn small ghost">Changer</button></form>
        <form method="post" action="/admin/${t.id}/${t.status === 'suspendu' ? 'reactiver' : 'suspendre'}" style="margin-top:6px">
          <button class="btn small ${t.status === 'suspendu' ? 'ghost' : 'danger'}">${t.status === 'suspendu' ? 'Réactiver' : 'Suspendre'}</button></form>
      </td></tr>`;
  }).join('');
  const body = `${flash(url)}
  <div class="stats">
    <div class="stat"><b>${results.length}</b><span>boutiques</span></div>
    <div class="stat"><b>${active.length}</b><span>abonnées actives</span></div>
    <div class="stat"><b>${results.filter((t) => t.status === 'essai').length}</b><span>en essai</span></div>
    <div class="stat"><b>${fmtXpf(mrr)}</b><span>revenu mensuel récurrent</span></div>
  </div>
  <div class="card"><h1>Boutiques</h1><div class="table-scroll"><table><thead><tr><th>Boutique</th><th>Formule</th><th>Statut</th><th>Usage</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Aucune boutique.</td></tr>'}</tbody></table></div></div>`;
  return html(page({ title: 'Administration', body, brand: 'Hinova Boutiques — Admin', brandHref: '/admin' }), 200, { 'cache-control': 'no-store' });
}

async function adminAction(request, env, tenantId, action) {
  const t = await env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first();
  if (!t) return notFound();
  const f = await readForm(request);
  const log = (kind, detail) => env.DB.prepare('INSERT INTO billing_events (id, tenant_id, kind, detail) VALUES (?, ?, ?, ?)').bind(uid('b_'), t.id, kind, detail);
  let msg = '';
  if (action === 'paiement') {
    const months = f.get('months') === '12' ? 12 : 1;
    const from = new Date(t.paid_until) > new Date() ? t.paid_until : nowIso();
    const until = addMonths(from, months);
    await env.DB.batch([
      env.DB.prepare(`UPDATE tenants SET status = 'actif', paid_until = ?, billing = ? WHERE id = ?`).bind(until, months === 12 ? 'annuel' : 'mensuel', t.id),
      log('paiement', `+${months} mois, jusqu'au ${until.slice(0, 10)}`),
    ]);
    msg = `${t.name} : réglé jusqu’au ${fmtDate(until)}.`;
  } else if (action === 'formule' && PLANS[f.get('plan')]) {
    await env.DB.batch([env.DB.prepare('UPDATE tenants SET plan = ? WHERE id = ?').bind(f.get('plan'), t.id), log('changement_plan', `${t.plan} → ${f.get('plan')}`)]);
    msg = `${t.name} : formule mise à jour.`;
  } else if (action === 'suspendre') {
    await env.DB.batch([env.DB.prepare(`UPDATE tenants SET status = 'suspendu' WHERE id = ?`).bind(t.id), log('suspension', 'manuelle')]);
    msg = `${t.name} : suspendue.`;
  } else if (action === 'reactiver') {
    const until = new Date(t.paid_until) > new Date() ? t.paid_until : addDays(nowIso(), 7);
    await env.DB.batch([env.DB.prepare(`UPDATE tenants SET status = 'actif', paid_until = ? WHERE id = ?`).bind(until, t.id), log('reactivation', 'manuelle')]);
    msg = `${t.name} : réactivée.`;
  } else {
    return notFound();
  }
  return redirect('/admin?ok=' + encodeURIComponent(msg));
}

// ───────────────────────────── Tâche planifiée ─────────────────────────────

export async function suspendOverdue(env) {
  const limit = addDays(nowIso(), -int(env.GRACE_DAYS, 3));
  const { results } = await env.DB.prepare(`SELECT id FROM tenants WHERE status != 'suspendu' AND paid_until < ?`).bind(limit).all();
  if (!results.length) return 0;
  const stmts = [];
  for (const r of results) {
    stmts.push(env.DB.prepare(`UPDATE tenants SET status = 'suspendu' WHERE id = ?`).bind(r.id));
    stmts.push(env.DB.prepare(`INSERT INTO billing_events (id, tenant_id, kind, detail) VALUES (?, ?, 'suspension', 'impayé — automatique')`).bind(uid('b_'), r.id));
  }
  stmts.push(env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowIso()));
  await env.DB.batch(stmts);
  return results.length;
}

// Lecture tolérante des formulaires (un POST sans corps ne doit pas planter)
async function readForm(request) {
  try { return await request.formData(); } catch { return new FormData(); }
}
