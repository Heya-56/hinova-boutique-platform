// Gabarits HTML : l'application (Hinova) et les vitrines (thème du modèle + couleurs de la boutique).
import { esc } from './lib.js';
import { getModele } from './plans.js';
import { heroPattern } from './art.js';

// Couleur de texte lisible sur un fond donné : blanc ou encre, selon le meilleur contraste (WCAG)
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function onColor(hex) {
  const L = lum(hex), dark = '#101418';
  const cWhite = 1.05 / (L + 0.05), cDark = (L + 0.05) / (lum(dark) + 0.05);
  return cWhite >= cDark ? '#ffffff' : dark;
}

const FONT_LINK = (q) => `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${q}&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

// ───────────── Application (accueil, tableau de bord, admin) ─────────────

const APP_CSS = `
:root{--bg:#F5F7F6;--surface:#fff;--ink:#0E2224;--muted:#5C6F6E;--line:#DCE6E4;--accent:#08343A;--accent-2:#B5823A;--accent-ink:#fff;--danger:#B42318;--ok:#157A44;--warn:#A35F00}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}img,svg{max-width:100%;display:block}
h1,h2,h3{font-family:Fraunces,Georgia,serif;line-height:1.15;margin:0 0 .5em;font-weight:600}
h1{font-size:clamp(1.6rem,5vw,2.4rem)}h2{font-size:1.35rem}h3{font-size:1.08rem}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:5}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;flex-wrap:wrap}
.brand{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:1.12rem;color:var(--ink);text-decoration:none}
.brand i{font-style:normal;color:var(--accent-2)}
nav{display:flex;gap:16px;overflow-x:auto;white-space:nowrap;max-width:100%;padding:4px 0}
nav a{text-decoration:none;color:var(--muted);font-size:.93rem}nav a.on{color:var(--ink);font-weight:600}
main{padding:24px 0 60px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.stats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:16px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:1.45rem;font-family:Fraunces,Georgia,serif}.stat span{color:var(--muted);font-size:.85rem}
label{display:block;font-weight:600;font-size:.9rem;margin:12px 0 4px}
input,select,textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit}
input[type=color]{padding:2px;height:44px}textarea{min-height:88px;resize:vertical}
input[type=checkbox],input[type=radio]{width:auto}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:999px;padding:12px 22px;font:600 1rem/1.1 Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;margin-top:14px;text-align:center}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.btn.small{padding:8px 14px;font-size:.85rem;margin-top:0}.btn.danger{background:var(--danger);color:#fff}
.btn.google{background:#fff;color:#1f1f1f;border:1px solid #c7c7c7;display:inline-flex;gap:10px;align-items:center}
.muted{color:var(--muted)}.small{font-size:.85rem}
.flash{padding:12px 16px;border-radius:10px;margin-bottom:16px;border:1px solid}
.flash.err{background:#FDECEA;border-color:#F5C2BD;color:#7A1A10}.flash.ok{background:#E8F6EE;border-color:#B9E2C8;color:#145C33}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid currentColor}
.badge.active,.badge.payee,.badge.expediee,.badge.valide{color:var(--ok)}
.badge.en_attente,.badge.transmis,.badge.essai{color:var(--warn)}
.badge.suspendue,.badge.refuse{color:var(--danger)}
table{width:100%;border-collapse:collapse;font-size:.92rem}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}
.table-scroll{overflow-x:auto}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1 1 220px}
.meter{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:6px}.meter i{display:block;height:100%;background:var(--accent)}.meter.full i{background:var(--danger)}
.plans{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.plan .p{font-size:1.7rem;font-family:Fraunces,Georgia,serif;font-weight:700}.plan ul{padding-left:18px;color:var(--muted)}
.modeles{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.modeles label{margin:0;border:2px solid var(--line);border-radius:12px;padding:10px;cursor:pointer;font-weight:500}
.modeles label:has(input:checked){border-color:var(--accent)}
.swatch{display:flex;gap:4px;margin-top:6px}.swatch i{width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.1)}
footer.app{border-top:1px solid var(--line);padding:22px 0;color:var(--muted);font-size:.85rem}
@media print{header.top,footer,.noprint{display:none!important}body{background:#fff}.card{border:0;padding:0}main{padding:0}}
`;

export function appPage({ title, body, nav = '', brandHref = '/', description = '', extraHead = '', headers }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}">` : ''}
${FONT_LINK('family=Fraunces:opsz,wght@9..144,600;9..144,700')}
<style>${APP_CSS}</style>${extraHead}</head><body>
<header class="top"><div class="wrap"><a class="brand" href="${esc(brandHref)}">Hinova <i>Boutiques</i></a><nav>${nav}</nav></div></header>
<main><div class="wrap">${body}</div></main>
<footer class="app"><div class="wrap">Hinova Digital · Les paiements des clients sont versés directement aux commerçants.</div></footer>
</body></html>`;
}

export function flash(url) {
  const err = url.searchParams.get('err'), ok = url.searchParams.get('ok');
  if (err) return `<div class="flash err" role="alert">${esc(err)}</div>`;
  if (ok) return `<div class="flash ok" role="status">${esc(ok)}</div>`;
  return '';
}

export function dashNav(active) {
  return [
    ['/tableau-de-bord', 'Accueil'], ['/tableau-de-bord/produits', 'Produits'], ['/tableau-de-bord/commandes', 'Commandes'],
    ['/tableau-de-bord/apparence', 'Apparence'], ['/tableau-de-bord/parametres', 'Paramètres'], ['/tableau-de-bord/osb', 'Paiement carte'],
    ['/deconnexion', 'Déconnexion'],
  ].map(([h, l]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${l}</a>`).join('');
}

export const adminNav = (active) => [['/admin', 'Boutiques'], ['/admin/osb', 'Dossiers OSB'], ['/deconnexion', 'Déconnexion']]
  .map(([h, l]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${l}</a>`).join('');

export function meter(used, max) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return `<div class="meter ${used >= max ? 'full' : ''}"><i style="width:${pct}%"></i></div>`;
}

// ───────────── Vitrine ─────────────

export function storeColors(b) {
  const m = getModele(b.modele);
  const primary = /^#[0-9a-f]{6}$/i.test(b.couleur_principale || '') ? b.couleur_principale : m.primary;
  const secondary = /^#[0-9a-f]{6}$/i.test(b.couleur_secondaire || '') ? b.couleur_secondaire : m.secondary;
  return { m, primary, secondary, onPrimary: onColor(primary), onSecondary: onColor(secondary) };
}

function storeCss(c) {
  const t = c.m.tokens;
  return `:root{--bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--line:${t.line};--r:${t.radius};--br:${t.btnRadius};
--p:${c.primary};--on-p:${c.onPrimary};--s:${c.secondary};--on-s:${c.onSecondary};--head:${t.head};--hw:${t.headWeight};--hc:${t.headCase};--hs:${t.headSpacing}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
img,svg{display:block;max-width:100%}a{color:inherit}
h1,h2,h3{font-family:var(--head);font-weight:var(--hw);text-transform:var(--hc);letter-spacing:var(--hs);line-height:1.12;margin:0 0 .45em}
h1{font-size:clamp(2rem,7vw,3.4rem)}h2{font-size:clamp(1.4rem,4.4vw,2rem)}h3{font-size:1.05rem}
.wrap{max-width:1120px;margin:0 auto;padding:0 18px}.narrow{max-width:720px}
.muted{color:var(--muted)}
.s-annonce{background:var(--s);color:var(--on-s);text-align:center;font-size:.85rem;font-weight:600;padding:8px 14px;letter-spacing:.02em}
header.shop{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
header.shop .wrap{display:flex;align-items:center;justify-content:space-between;min-height:62px;gap:12px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:var(--head);font-weight:var(--hw);text-transform:var(--hc);letter-spacing:var(--hs);font-size:1.2rem}
.logo img{height:40px;width:auto}
.head-cta{font-size:.9rem;font-weight:600;text-decoration:none;border:1px solid var(--line);border-radius:var(--br);padding:8px 14px}
.s{padding:clamp(40px,8vw,80px) 0}
${c.m.tokens.hero === 'surface' ? `.s-hero{background:var(--surface) ${heroPattern(c.primary)};color:var(--ink);border-bottom:1px solid var(--line)}.s-hero h1{color:var(--p)}` : `.s-hero{background:var(--p) ${heroPattern(c.onPrimary)};color:var(--on-p)}`}
.hero-grid{display:grid;gap:28px;align-items:center;grid-template-columns:1.2fr .8fr}
.hero-grid p{font-size:1.12rem;opacity:.9;max-width:34em}
.hero-art{background:var(--surface);border-radius:var(--r);overflow:hidden;aspect-ratio:1/1;max-width:340px;justify-self:end;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.18)}
.hero-art svg{width:100%;height:100%}
.btn{display:inline-block;background:var(--p);color:var(--on-p);border:0;border-radius:var(--br);padding:13px 24px;font:600 1rem/1.1 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;margin-top:10px}
${c.m.tokens.hero === 'surface' ? '.btn-on{background:var(--p);color:var(--on-p)}' : '.btn-on{background:var(--on-p);color:var(--p)}'}
.btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.grid-p{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.card-p{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}
.card-p .ph{aspect-ratio:1/1;background:var(--line)}.card-p .ph img,.card-p .ph svg{width:100%;height:100%;object-fit:cover}
.card-p .body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:4px;flex:1}
.card-p h3{font-size:1rem;margin:0}.desc{color:var(--muted);font-size:.86rem;margin:0}
.price{font-weight:700;margin-top:auto}
.qty{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.82rem;color:var(--muted);margin-top:6px}
.qty input{width:74px}
.tag{display:inline-block;font-size:.78rem;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 10px;align-self:flex-start;margin-top:6px}
.order{margin-top:34px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:clamp(16px,4vw,28px)}
.order label{display:block;font-weight:600;font-size:.88rem;margin:10px 0 0}
input,select,textarea{display:block;width:100%;margin-top:4px;padding:11px 12px;border:1px solid var(--line);border-radius:calc(var(--r) / 2);background:var(--bg);color:var(--ink);font:inherit}
textarea{min-height:84px;resize:vertical}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1 1 200px}
.hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important}
.s-texte p{font-size:1.08rem}
.s-avantages{background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.grid-a{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.a .num{font-family:var(--head);font-size:1.6rem;color:var(--s)}.a p{color:var(--muted);margin:0}
details{border-bottom:1px solid var(--line);padding:14px 0}summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::after{content:'+';color:var(--s);font-size:1.3rem;line-height:1}details[open] summary::after{content:'−'}summary::-webkit-details-marker{display:none}
details p{color:var(--muted);margin:10px 0 0}
.row-btn{display:flex;gap:10px;flex-wrap:wrap}
.flash{padding:12px 16px;border-radius:calc(var(--r) / 2);margin:16px 0;border:1px solid;font-weight:500}
.flash.err{background:#FDECEA;border-color:#F5C2BD;color:#7A1A10}.flash.ok{background:#E8F6EE;border-color:#B9E2C8;color:#145C33}
footer.shop{border-top:1px solid var(--line);padding:26px 0;color:var(--muted);font-size:.82rem}
pre.pay{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);padding:12px;border-radius:calc(var(--r) / 2);font:inherit}
@media(max-width:700px){.hero-grid{grid-template-columns:1fr}.hero-art{justify-self:start;max-width:220px}.grid-p{grid-template-columns:repeat(2,1fr);gap:10px}.card-p .body{padding:10px}}
@media print{header.shop,footer.shop,.noprint{display:none!important}}`;
}

const CART_CSS = `
.add{display:none;margin-top:8px;width:100%;background:var(--p);color:var(--on-p);border:0;border-radius:var(--br);padding:10px 12px;font:600 .9rem/1.1 Inter,system-ui,sans-serif;cursor:pointer}
.add:active{transform:scale(.97)}
.js .qty{display:none}.js .add{display:block}.js .no-js-only{display:none}
.cart-btn{display:none;align-items:center;gap:8px;font:600 .9rem/1 Inter,system-ui,sans-serif;background:var(--p);color:var(--on-p);border:0;border-radius:var(--br);padding:9px 14px;cursor:pointer}
.js .cart-btn{display:inline-flex}
.cart-btn b{background:var(--on-p);color:var(--p);border-radius:99px;min-width:22px;height:22px;display:inline-grid;place-items:center;font-size:.78rem;padding:0 6px}
.cart-btn.bump{animation:bump .35s}@keyframes bump{50%{transform:scale(1.12)}}
.drawer[hidden]{display:none}
.drawer{position:fixed;inset:0;z-index:50}
.drawer-bg{position:absolute;inset:0;background:rgba(0,0,0,.45);animation:fade .2s}
.drawer-panel{position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:var(--bg);color:var(--ink);display:flex;flex-direction:column;box-shadow:-20px 0 50px rgba(0,0,0,.25);animation:slide .25s ease-out}
@keyframes slide{from{transform:translateX(100%)}}@keyframes fade{from{opacity:0}}
.drawer-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--line)}
.drawer-head h2{margin:0;font-size:1.3rem}
.x{background:none;border:0;font-size:1.8rem;line-height:1;color:var(--ink);cursor:pointer;padding:4px 8px}
.drawer-body{overflow-y:auto;padding:6px 18px 24px;flex:1}
.line{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:12px 0;border-bottom:1px solid var(--line)}
.line .n{font-weight:600}.line .p{color:var(--muted);font-size:.88rem}
.stepper{display:flex;align-items:center;gap:6px;grid-row:span 2;align-self:center}
.stepper button{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:1.1rem;cursor:pointer}
.stepper span{min-width:22px;text-align:center;font-weight:600}
.cart-total{display:flex;justify-content:space-between;font-size:1.1rem;padding:14px 0 4px}
.empty{color:var(--muted);padding:26px 0;text-align:center}
.drawer .order{margin-top:10px;border:0;padding:0;background:none}
@media (prefers-reduced-motion:reduce){.drawer-panel,.drawer-bg,.cart-btn.bump{animation:none}}
`;

const CART_JS = `(function(){
  var d=document, root=d.documentElement; root.classList.add('js');
  var drawer=d.getElementById('panier'); if(!drawer) return;
  var key='panier:'+(d.body.getAttribute('data-cart')||location.pathname);
  var inputs=[].slice.call(d.querySelectorAll('input[form="commande"][name^="q_"]'));
  var byName={}; inputs.forEach(function(i){ byName[i.name]=i; });
  var lines=d.getElementById('cart-lines'), total=d.getElementById('cart-total'), count=d.getElementById('cart-count');
  var order=d.querySelector('.order'), slot=d.getElementById('cart-checkout'), btn=d.getElementById('cart-open'), last=null;
  if(order&&slot) slot.appendChild(order);
  try{ var saved=JSON.parse(localStorage.getItem(key)||'{}'); Object.keys(saved).forEach(function(k){ if(byName[k]) byName[k].value=Math.min(+saved[k]||0,+byName[k].max||999); }); }catch(e){}
  function fmt(n){ return new Intl.NumberFormat('fr-FR').format(n).replace(/[\\s\\u202f]/g,'\\u00a0')+'\\u00a0XPF'; }
  function save(){ var o={}; inputs.forEach(function(i){ if(+i.value>0) o[i.name]=+i.value; }); try{ localStorage.setItem(key,JSON.stringify(o)); }catch(e){} }
  function el(t,c,txt){ var n=d.createElement(t); if(c) n.className=c; if(txt!=null) n.textContent=txt; return n; }
  function set(i,v){ i.value=Math.max(0,Math.min(v,+i.max||999)); save(); render(); }
  function render(){
    var n=0,t=0; lines.textContent='';
    inputs.forEach(function(i){ var q=+i.value||0; if(!q) return; n+=q; t+=q*(+i.getAttribute('data-prix'));
      var row=el('div','line'); row.appendChild(el('div','n',i.getAttribute('data-nom')));
      var st=el('div','stepper'); var m=el('button',null,'−'); m.type='button'; m.setAttribute('aria-label','Retirer un'); m.onclick=function(){ set(i,q-1); };
      var p=el('button',null,'+'); p.type='button'; p.setAttribute('aria-label','Ajouter un'); p.onclick=function(){ set(i,q+1); }; if(q>=(+i.max||999)) p.disabled=true;
      st.appendChild(m); st.appendChild(el('span',null,q)); st.appendChild(p); row.appendChild(st);
      row.appendChild(el('div','p',q+' × '+fmt(+i.getAttribute('data-prix')))); lines.appendChild(row); });
    if(!n) lines.appendChild(el('p','empty','Votre panier est vide.'));
    total.textContent=fmt(t); count.textContent=n; slot.hidden=!n; d.getElementById('cart-sum').hidden=!n;
  }
  function open(){ last=d.activeElement; drawer.hidden=false; d.body.style.overflow='hidden'; drawer.querySelector('.x').focus(); }
  function close(){ drawer.hidden=true; d.body.style.overflow=''; if(last&&last.focus) last.focus(); }
  [].forEach.call(d.querySelectorAll('[data-add]'),function(b){ b.addEventListener('click',function(){ var i=byName[b.getAttribute('data-add')]; if(!i) return;
    if(+i.value>=(+i.max||999)){ b.textContent='Stock maximum atteint'; return; } set(i,(+i.value||0)+1);
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); open(); }); });
  btn.addEventListener('click',open);
  [].forEach.call(drawer.querySelectorAll('[data-close]'),function(x){ x.addEventListener('click',close); });
  d.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!drawer.hidden) close(); });
  render();
})();`;

export function storePage(b, { title, body, base = '', annonce = '', description = '', cart = false, clearCart = false }) {
  const c = storeColors(b);
  const logo = b.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : '';
  const ctaHref = b.whatsapp ? `https://wa.me/${esc(b.whatsapp)}` : `${esc(base)}/#produits`;
  const cartKey = base || 'site';
  const drawer = cart ? `<div class="drawer" id="panier" role="dialog" aria-modal="true" aria-labelledby="panier-t" hidden>
  <div class="drawer-bg" data-close></div>
  <aside class="drawer-panel">
    <div class="drawer-head"><h2 id="panier-t">Mon panier</h2><button class="x" type="button" data-close aria-label="Fermer le panier">×</button></div>
    <div class="drawer-body"><div id="cart-lines"></div>
      <div class="cart-total" id="cart-sum"><span>Total</span><b id="cart-total"></b></div>
      <div id="cart-checkout"></div></div>
  </aside></div>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="theme-color" content="${esc(c.primary)}">
${FONT_LINK(c.m.fonts)}
<style>${storeCss(c)}${CART_CSS}</style></head><body data-cart="${esc(cartKey)}">
${annonce}
<header class="shop"><div class="wrap"><a class="logo" href="${esc(base || '/')}">${logo}<span>${esc(b.nom)}</span></a>
${cart ? '<button class="cart-btn" id="cart-open" type="button" aria-controls="panier">Panier <b id="cart-count">0</b></button>'
  : `<a class="head-cta" href="${ctaHref}"${b.whatsapp ? ' target="_blank" rel="noopener"' : ''}>${b.whatsapp ? 'WhatsApp' : 'Collection'}</a>`}</div></header>
<main>${body}</main>
<footer class="shop"><div class="wrap">© ${esc(b.nom)}${b.ile ? ' · ' + esc(b.ile) : ''} · Boutique propulsée par Hinova Digital</div></footer>
${drawer}
${cart ? `<script>${CART_JS}</script>` : ''}
${clearCart ? `<script>try{localStorage.removeItem('panier:'+${JSON.stringify(cartKey)})}catch(e){}</script>` : ''}
</body></html>`;
}
