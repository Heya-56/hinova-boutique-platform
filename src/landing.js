// Page d'accueil : le visiteur découvre d'abord les boutiques en carrousel, l'offre vient ensuite.
import { esc, fmtXpf } from './lib.js';
import { PLANS, MODELES, annualPrice } from './plans.js';
import { DEMOS } from './demo.js';

const CSS = `
:root{--deep:#06282C;--deep-2:#0B3A40;--sand:#F6F1E9;--ink:#0E2224;--muted:#5C6F6E;--gold:#D9A441;--line:rgba(255,255,255,.14)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--sand)}
a{color:inherit}h1,h2,h3{font-family:Fraunces,Georgia,serif;font-weight:600;line-height:1.1;margin:0 0 .4em}
.btn{display:inline-block;background:var(--gold);color:#1B1305;border-radius:999px;padding:13px 22px;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:1rem}
.btn.line{background:transparent;color:#fff;border:1px solid var(--line)}
.btn.dark{background:var(--deep);color:#fff}

/* Écran 1 : carrousel */
.stage{min-height:100svh;background:radial-gradient(120% 80% at 50% 0%,#0F4B52 0%,var(--deep) 60%);color:#fff;display:flex;flex-direction:column;overflow:hidden}
.bar{display:flex;justify-content:space-between;align-items:center;padding:14px 18px}
.mark{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:1.05rem;text-decoration:none}.mark i{font-style:normal;color:var(--gold)}
.bar a.login{font-size:.9rem;opacity:.8;text-decoration:none}
.lead{text-align:center;padding:0 20px}
.lead h1{font-size:clamp(1.5rem,6vw,2.6rem)}
.lead p{margin:0;opacity:.7;font-size:.95rem}
.car{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center}
.track{display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;padding:14px calc(50% - min(43vw,170px));scrollbar-width:none;-webkit-overflow-scrolling:touch;outline:none}
.track::-webkit-scrollbar{display:none}
.slide{flex:0 0 min(86vw,340px);scroll-snap-align:center;display:flex;flex-direction:column;align-items:center;transition:transform .35s,opacity .35s;opacity:.55;transform:scale(.94)}
.slide.on{opacity:1;transform:none}
.phone{position:relative;width:min(100%,300px,calc((100svh - 390px) / 2));min-width:200px;aspect-ratio:390/780;border-radius:38px;background:#0A0F10;padding:10px;box-shadow:0 30px 60px rgba(0,0,0,.45),inset 0 0 0 1.5px rgba(255,255,255,.12)}
.screen{position:relative;width:100%;height:100%;border-radius:29px;overflow:hidden;background:#fff}
.screen iframe{position:absolute;top:0;left:0;width:390px;height:780px;border:0;transform-origin:0 0;transform:scale(var(--k,.72));pointer-events:none}
.phone a.open{position:absolute;inset:0;border-radius:38px;z-index:3}
.phone a.open:focus-visible{outline:3px solid var(--gold);outline-offset:4px}
.meta{text-align:center;margin-top:14px;max-width:300px;width:100%}
.meta h2{font-size:1.4rem;margin:0}.meta p{margin:2px 0 0;opacity:.75;font-size:.9rem}
.meta .ex{font-size:.8rem;opacity:.55}
.sw{display:flex;gap:6px;justify-content:center;margin:10px 0 0}.sw i{width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(255,255,255,.35)}
.meta .btn{margin-top:12px;width:100%;padding:12px 16px}
.meta .see{display:inline-block;margin-top:10px;font-size:.88rem;opacity:.75}
.ctrl{display:flex;justify-content:center;align-items:center;gap:14px;padding:4px 0 18px}
.ctrl button.arw{width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:transparent;color:#fff;font-size:1.2rem;cursor:pointer}
.dots{display:flex;gap:8px}.dots button{width:9px;height:9px;border-radius:50%;border:0;padding:0;background:rgba(255,255,255,.3);cursor:pointer}
.dots button[aria-current=true]{background:var(--gold);width:24px;border-radius:9px}
.down{display:block;text-align:center;font-size:.85rem;opacity:.6;padding-bottom:14px;text-decoration:none}

/* Suite : l'offre */
.sec{padding:clamp(48px,9vw,90px) 18px}.in{max-width:1040px;margin:0 auto}
.steps{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:20px}
.step{background:#fff;border-radius:18px;padding:22px;border:1px solid #E7DFD2}
.step b{font-family:Fraunces,Georgia,serif;font-size:2rem;color:var(--gold)}
.step p{color:var(--muted);margin:0}
.plans{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:20px}
.plan{background:#fff;border-radius:18px;padding:22px;border:1px solid #E7DFD2;display:flex;flex-direction:column}
.plan.hi{border:2px solid var(--deep)}
.plan .p{font-family:Fraunces,Georgia,serif;font-size:2rem;font-weight:700}
.plan ul{padding-left:18px;color:var(--muted);flex:1}
.promise{background:var(--deep);color:#fff}
.promise .grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:16px}
.promise p{opacity:.75;margin:0}
footer{padding:28px 18px;text-align:center;color:var(--muted);font-size:.85rem}
@media (prefers-reduced-motion:reduce){.slide{transition:none}html{scroll-behavior:auto}}
`;

const JS = `(function(){
  var track=document.getElementById('track'); if(!track) return;
  var slides=[].slice.call(track.querySelectorAll('.slide'));
  var dots=[].slice.call(document.querySelectorAll('.dots button'));
  var cur=0, timer=null, still=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fit(){ slides.forEach(function(s){ var sc=s.querySelector('.screen'); if(sc) sc.style.setProperty('--k', sc.clientWidth/390); }); }
  function go(i){ i=(i+slides.length)%slides.length; var s=slides[i]; track.scrollTo({left:s.offsetLeft-(track.clientWidth-s.clientWidth)/2, behavior: still?'auto':'smooth'}); }
  function mark(i){ cur=i; slides.forEach(function(s,k){ s.classList.toggle('on',k===i); s.setAttribute('aria-hidden', k===i?'false':'true'); s.querySelectorAll('a').forEach(function(a){ a.tabIndex = k===i?0:-1; }); });
    dots.forEach(function(d,k){ d.setAttribute('aria-current', k===i?'true':'false'); }); }
  function nearest(){ var c=track.scrollLeft+track.clientWidth/2, best=0, d=1e9;
    slides.forEach(function(s,k){ var x=Math.abs(s.offsetLeft+s.clientWidth/2-c); if(x<d){d=x;best=k;} }); return best; }
  var raf=0; track.addEventListener('scroll',function(){ cancelAnimationFrame(raf); raf=requestAnimationFrame(function(){ var n=nearest(); if(n!==cur) mark(n); }); },{passive:true});
  dots.forEach(function(d,k){ d.addEventListener('click',function(){ stop(); go(k); }); });
  document.getElementById('prev').addEventListener('click',function(){ stop(); go(cur-1); });
  document.getElementById('next').addEventListener('click',function(){ stop(); go(cur+1); });
  track.addEventListener('keydown',function(e){ if(e.key==='ArrowRight'){stop();go(cur+1);} if(e.key==='ArrowLeft'){stop();go(cur-1);} });
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }
  ['pointerdown','wheel','touchstart','focusin'].forEach(function(ev){ track.addEventListener(ev,stop,{passive:true}); });
  if(!still) timer=setInterval(function(){ if(!document.hidden) go(cur+1); },5500);
  window.addEventListener('resize',function(){ fit(); go(cur); }); fit(); cur=-1; mark(0); track.scrollLeft=slides[0].offsetLeft-(track.clientWidth-slides[0].clientWidth)/2;
})();`;

export function landingPage(env) {
  const keys = Object.keys(MODELES);
  const slides = keys.map((k, i) => {
    const m = MODELES[k], d = DEMOS[k];
    return `<article class="slide${i === 0 ? ' on' : ''}" aria-roledescription="diapositive" aria-label="${i + 1} sur ${keys.length} : modèle ${esc(m.label)}">
      <div class="phone"><div class="screen"><iframe src="/demo/${k}" title="Aperçu de la boutique ${esc(d.nom)}" loading="${i < 2 ? 'eager' : 'lazy'}" tabindex="-1" aria-hidden="true"></iframe></div>
        <a class="open" href="/demo/${k}" aria-label="Ouvrir la boutique de démonstration ${esc(d.nom)}"></a></div>
      <div class="meta"><h2>${esc(m.label)}</h2><p>${esc(m.pitch)}</p><p class="ex">Exemple : ${esc(d.nom)}</p>
        <div class="sw" aria-hidden="true"><i style="background:${m.tokens.bg}"></i><i style="background:${m.primary}"></i><i style="background:${m.secondary}"></i></div>
        <a class="btn" href="/demarrer?modele=${k}">Créer ma boutique avec ce modèle</a>
        <a class="see" href="/demo/${k}">Visiter la boutique d’exemple ↗</a></div></article>`;
  }).join('');
  const dots = keys.map((k, i) => `<button type="button" aria-label="Modèle ${esc(MODELES[k].label)}" aria-current="${i === 0}"></button>`).join('');
  const plans = Object.values(PLANS).map((p, i) => `<div class="plan${i === 1 ? ' hi' : ''}"><h3>${esc(p.label)}</h3>
      <div class="p">${fmtXpf(p.monthly)}<span style="font-size:.9rem;font-weight:400;color:var(--muted)"> / mois</span></div>
      <p style="color:var(--muted);margin:0 0 8px">ou ${fmtXpf(annualPrice(p))} / an, 2 mois offerts</p>
      <ul><li>${p.maxProducts} produits</li><li>${p.salesQuota} ventes payées / mois</li><li>4 modèles, sections personnalisables</li><li>Factures et étiquettes postales</li></ul>
      <a class="btn dark" href="/demarrer?plan=${p.key}" style="text-align:center">Commencer</a></div>`).join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(env.BRAND || 'Hinova Boutiques')} — votre boutique en ligne au fenua</title>
<meta name="description" content="Choisissez un modèle, ajoutez vos produits depuis votre téléphone : votre boutique en ligne est prête. Paiement direct au commerçant, livraison dans les îles.">
<meta name="theme-color" content="#06282C">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<section class="stage">
  <div class="bar"><a class="mark" href="/">Hinova <i>Boutiques</i></a><a class="login" href="/connexion">Se connecter</a></div>
  <div class="lead"><h1>Laquelle sera la vôtre ?</h1><p>Glissez pour découvrir les boutiques.</p></div>
  <div class="car" aria-roledescription="carrousel" aria-label="Boutiques modèles">
    <div class="track" id="track" tabindex="0">${slides}</div>
    <div class="ctrl"><button class="arw" id="prev" type="button" aria-label="Boutique précédente">‹</button><div class="dots">${dots}</div><button class="arw" id="next" type="button" aria-label="Boutique suivante">›</button></div>
  </div>
  <a class="down" href="#comment">Comment ça marche ↓</a>
</section>

<section class="sec" id="comment"><div class="in">
  <h2>Votre boutique en ligne, en trois étapes</h2>
  <div class="steps">
    <div class="step"><b>1</b><h3>Choisissez un modèle</h3><p>Lagon, Pae, Tiare ou Nuit : vos couleurs, votre logo, vos textes.</p></div>
    <div class="step"><b>2</b><h3>Ajoutez vos produits</h3><p>Depuis votre téléphone : une photo, un prix, un stock. C’est tout.</p></div>
    <div class="step"><b>3</b><h3>Partagez votre lien</h3><p>Vos clients commandent ; vous recevez bon de commande, étiquette et facture.</p></div>
  </div>
</div></section>

<section class="sec promise"><div class="in">
  <h2>L’argent va directement chez vous</h2>
  <div class="grid">
    <div><h3>Paiement direct</h3><p>Virement, espèces au guichet ou carte via votre contrat OSB : nous ne touchons jamais vos ventes.</p></div>
    <div><h3>Livraison dans les îles</h3><p>Adresse, île et téléphone du client sur chaque étiquette postale.</p></div>
    <div><h3>Sans engagement</h3><p>${esc(env.TRIAL_DAYS || '14')} jours offerts, puis un abonnement mensuel ou annuel.</p></div>
  </div>
</div></section>

<section class="sec" id="formules"><div class="in">
  <h2>Les formules</h2>
  <div class="plans">${plans}</div>
  <p style="color:var(--muted);font-size:.9rem;margin-top:18px">Plus de produits ou un site sur mesure ? Écrivez à <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a>.</p>
</div></section>

<footer>Hinova Digital · Boutiques en ligne pour la Polynésie française</footer>
<script>${JS}</script>
</body></html>`;
}
