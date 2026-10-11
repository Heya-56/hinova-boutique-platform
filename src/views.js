import { esc } from './lib.js';

const THEMES = {
  lagon: { bg: '#f4faf9', surface: '#ffffff', ink: '#0d2b2a', muted: '#55716f', accent: '#0f7c74', accentInk: '#ffffff', line: '#d6e8e5' },
  sable: { bg: '#fbf6ee', surface: '#ffffff', ink: '#2e2316', muted: '#7a6650', accent: '#b5622d', accentInk: '#ffffff', line: '#ecdfcb' },
  nuit:  { bg: '#0f1517', surface: '#182124', ink: '#eef4f3', muted: '#9bb0ad', accent: '#3fc1b0', accentInk: '#08201d', line: '#26343a' },
};

export const THEME_NAMES = { lagon: 'Lagon', sable: 'Sable', nuit: 'Nuit' };

function themeCss(name) {
  const t = THEMES[name] || THEMES.lagon;
  return `:root{--bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--accent-ink:${t.accentInk};--line:${t.line};--danger:#c0392b;--ok:#1e8a4c;--warn:#b7791f}`;
}

const BASE_CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}img{max-width:100%;display:block}
h1,h2,h3{font-family:Fraunces,Georgia,serif;line-height:1.15;margin:0 0 .5em;font-weight:600}
h1{font-size:clamp(1.7rem,5vw,2.6rem)}h2{font-size:1.4rem}h3{font-size:1.1rem}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--line);background:var(--surface)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;flex-wrap:wrap}
.brand{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:1.15rem;color:var(--ink);text-decoration:none}
nav{display:flex;gap:16px;overflow-x:auto;white-space:nowrap;max-width:100%;padding-bottom:2px}nav a{text-decoration:none;color:var(--muted);font-size:.95rem}nav a.on{color:var(--ink);font-weight:600}
main{padding:28px 0 60px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(155px,1fr))}
.stats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:18px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:1.5rem;font-family:Fraunces,Georgia,serif}.stat span{color:var(--muted);font-size:.85rem}
label{display:block;font-weight:600;font-size:.9rem;margin:12px 0 4px}
input,select,textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:inherit}
textarea{min-height:90px;resize:vertical}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:999px;padding:12px 22px;font:600 1rem/1 inherit;cursor:pointer;text-decoration:none;margin-top:14px}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.btn.small{padding:8px 14px;font-size:.85rem;margin-top:0}
.btn.danger{background:var(--danger);color:#fff}
.muted{color:var(--muted)}.small{font-size:.85rem}
.flash{padding:12px 16px;border-radius:10px;margin-bottom:16px;border:1px solid}
.flash.err{background:#fdecea;border-color:#f5c2bd;color:#8a1f14}.flash.ok{background:#e8f6ee;border-color:#b9e2c8;color:#145c33}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid var(--line)}
.badge.actif,.badge.payee,.badge.expediee{color:var(--ok);border-color:currentColor}
.badge.essai,.badge.en_attente{color:var(--warn);border-color:currentColor}
.badge.suspendu,.badge.annulee{color:var(--danger);border-color:currentColor}
table{width:100%;border-collapse:collapse;font-size:.92rem}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
.table-scroll{overflow-x:auto}
.product{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.product .ph{aspect-ratio:1/1;background:var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.85rem}
.product .ph img{width:100%;height:100%;object-fit:cover}
.product .body{padding:14px;display:flex;flex-direction:column;gap:6px;flex:1}
.price{font-weight:700;font-size:1.05rem}
.qty{display:flex;align-items:center;gap:8px;margin-top:auto}.qty input{width:72px}
@media(max-width:520px){header.top .wrap{padding-top:10px;padding-bottom:10px}.product .body{padding:10px}.product h3{font-size:1rem}.qty label{font-size:.8rem}}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1 1 220px}
.meter{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:6px}.meter i{display:block;height:100%;background:var(--accent)}
.meter.full i{background:var(--danger)}
.hero{padding:36px 0 10px}.hero p{font-size:1.1rem;color:var(--muted);max-width:620px}
.plans{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.plan h3{margin-bottom:4px}.plan .p{font-size:1.8rem;font-family:Fraunces,Georgia,serif;font-weight:700}
.plan ul{padding-left:18px;color:var(--muted)}
footer{border-top:1px solid var(--line);padding:22px 0;color:var(--muted);font-size:.85rem}
@media print{header.top,footer,.noprint{display:none!important}body{background:#fff}.card{border:0;padding:0}}
`;

export function page({ title, body, theme = 'lagon', nav = '', brand = 'Hinova Boutiques', brandHref = '/', description = '' }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>${themeCss(theme)}${BASE_CSS}</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="${esc(brandHref)}">${esc(brand)}</a><nav>${nav}</nav></div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap">Propulsé par Hinova Digital · Paiements versés directement au commerçant</div></footer>
</body></html>`;
}

export function flash(url) {
  const ok = url.searchParams.get('ok');
  const err = url.searchParams.get('err');
  if (err) return `<div class="flash err">${esc(err)}</div>`;
  if (ok) return `<div class="flash ok">${esc(ok)}</div>`;
  return '';
}

export function dashNav(active) {
  const items = [
    ['/tableau-de-bord', 'Accueil'],
    ['/tableau-de-bord/produits', 'Produits'],
    ['/tableau-de-bord/commandes', 'Commandes'],
    ['/tableau-de-bord/boutique', 'Ma boutique'],
    ['/deconnexion', 'Déconnexion'],
  ];
  return items.map(([h, l]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${l}</a>`).join('');
}

export function meter(used, max) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return `<div class="meter ${used >= max ? 'full' : ''}"><i style="width:${pct}%"></i></div>`;
}
