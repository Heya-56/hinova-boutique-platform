// Page d'accueil « générateur » : le visiteur décrit son activité, l'IA construit sa boutique en direct.
// Les modèles en carrousel viennent ensuite, puis l'offre.
import { esc, fmtXpf } from './lib.js';
import { PLANS, MODELES, annualPrice } from './plans.js';
import { DEMOS } from './demo.js';

const CSS = `
:root{--bg:#04090B;--panel:rgba(255,255,255,.035);--panel-2:rgba(255,255,255,.06);--line:rgba(255,255,255,.09);--ink:#E8F1F0;--muted:#8FA3A1;
--cyan:#3FE0C5;--gold:#E2B04A;--violet:#8B7CF6;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--head:'Space Grotesk',Inter,system-ui,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:inherit}h1,h2,h3{font-family:var(--head);font-weight:600;line-height:1.08;letter-spacing:-.02em;margin:0 0 .4em}
.grid-bg{position:relative;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:44px 44px;background-position:-1px -1px}
.grid-bg::before{content:'';position:absolute;inset:0;background:radial-gradient(60% 50% at 50% 0%,rgba(63,224,197,.22),transparent 70%),radial-gradient(40% 40% at 90% 30%,rgba(139,124,246,.16),transparent 70%),linear-gradient(180deg,transparent 60%,var(--bg));pointer-events:none}
.grid-bg>*{position:relative}
.bar{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;max-width:1160px;margin:0 auto}
.mark{font-family:var(--head);font-weight:700;font-size:1.05rem;text-decoration:none;display:flex;align-items:center;gap:8px}
.mark i{width:10px;height:10px;border-radius:3px;background:linear-gradient(135deg,var(--cyan),var(--violet));box-shadow:0 0 12px var(--cyan)}
.bar a.login{font-size:.88rem;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:7px 14px}
.hero{max-width:1160px;margin:0 auto;padding:18px 18px 56px;display:grid;gap:36px;grid-template-columns:1.05fr .95fr;align-items:center}
.badge{display:inline-flex;align-items:center;gap:8px;font:500 .78rem/1 var(--mono);color:var(--cyan);border:1px solid rgba(63,224,197,.35);background:rgba(63,224,197,.07);border-radius:999px;padding:7px 12px;text-transform:uppercase;letter-spacing:.06em}
.badge::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px var(--cyan);animation:pulse 2s infinite}
@keyframes pulse{50%{opacity:.35}}
.hero h1{font-size:clamp(2rem,6.4vw,3.7rem);margin-top:16px}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--muted);font-size:1.06rem;max-width:34em;margin:0 0 20px}
.gen{background:rgba(8,16,19,.82);border:1px solid var(--line);border-radius:20px;padding:16px;box-shadow:0 0 0 1px rgba(63,224,197,.06),0 30px 80px rgba(0,0,0,.5);backdrop-filter:blur(8px)}
.gen label{display:block;font:500 .74rem/1 var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:4px 2px 8px}
.gen textarea,.gen input{width:100%;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:12px;color:var(--ink);font:inherit;padding:12px 14px;outline:none;transition:border-color .2s,box-shadow .2s}
.gen textarea{min-height:92px;resize:vertical;font-size:1.02rem}
.gen textarea:focus,.gen input:focus{border-color:rgba(63,224,197,.6);box-shadow:0 0 0 3px rgba(63,224,197,.15)}
.gen input{margin-top:10px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}
.chip{font:.8rem/1 Inter,sans-serif;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:8px 11px;cursor:pointer}
.chip:hover{color:var(--ink);border-color:rgba(63,224,197,.4)}
.go{margin-top:14px;width:100%;border:0;border-radius:12px;padding:15px 18px;font:700 1.02rem/1 var(--head);color:#03211C;cursor:pointer;
background:linear-gradient(90deg,var(--cyan),#7FF0DD 45%,var(--gold));box-shadow:0 10px 30px rgba(63,224,197,.25);display:flex;justify-content:center;gap:10px;align-items:center}
.go:disabled{opacity:.7;cursor:progress}
.go .spin{width:16px;height:16px;border:2px solid rgba(3,33,28,.35);border-top-color:#03211C;border-radius:50%;animation:spin .8s linear infinite;display:none}
.go.busy .spin{display:inline-block}@keyframes spin{to{transform:rotate(360deg)}}
.err{color:#FF8A80;font-size:.9rem;margin:10px 2px 0;min-height:1em}
.term{margin-top:14px;font:.82rem/1.7 var(--mono);color:var(--muted);background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:none}
.term.on{display:block}.term .ok{color:var(--cyan)}.term .cur::after{content:'▍';animation:pulse 1s infinite;color:var(--cyan)}
.result{display:none;margin-top:14px;border:1px solid rgba(63,224,197,.35);background:linear-gradient(180deg,rgba(63,224,197,.08),transparent);border-radius:14px;padding:14px}
.result.on{display:block}
.result .src{font:500 .74rem/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--cyan)}
.result h3{font-size:1.35rem;margin:8px 0 2px}.result p{margin:0;color:var(--muted);font-size:.92rem}
.facts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.facts span{font:.78rem/1 var(--mono);border:1px solid var(--line);border-radius:8px;padding:7px 9px;color:var(--ink);display:inline-flex;gap:6px;align-items:center}
.facts i{width:12px;height:12px;border-radius:3px;display:inline-block}
.acts{display:flex;gap:10px;flex-wrap:wrap}
.ai-wait{display:flex;align-items:center;gap:8px;color:var(--cyan)!important;font:.82rem/1.4 var(--mono)!important;margin:0 0 12px!important}
.ai-wait[hidden]{display:none}.ai-wait .spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(63,224,197,.3);border-top-color:var(--cyan);border-radius:50%;animation:spin .8s linear infinite}
.note{font-size:.78rem!important;margin:0 0 12px!important}
.btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;border-radius:12px;padding:13px 18px;font:700 .98rem/1 var(--head);text-decoration:none;border:0;cursor:pointer}
.btn.gold{background:var(--gold);color:#1B1305;flex:1}.btn.line{background:transparent;color:var(--ink);border:1px solid var(--line)}
.stage{position:relative;display:flex;justify-content:center}
.phone{position:relative;width:min(100%,320px);aspect-ratio:390/780;border-radius:40px;background:#05080A;padding:10px;
box-shadow:0 0 0 1px rgba(255,255,255,.12),0 0 60px rgba(63,224,197,.18),0 40px 80px rgba(0,0,0,.6)}
.screen{position:relative;width:100%;height:100%;border-radius:31px;overflow:hidden;background:#fff}
.screen iframe{position:absolute;top:0;left:0;width:390px;height:780px;border:0;transform-origin:0 0;transform:scale(var(--k,.77));pointer-events:none;transition:opacity .4s}
.scan{position:absolute;inset:0;display:none;background:linear-gradient(180deg,rgba(4,9,11,.82),rgba(4,9,11,.92));color:var(--cyan);font:.8rem/1.6 var(--mono);padding:22px;flex-direction:column;justify-content:center;gap:10px}
.scan.on{display:flex}.scan::after{content:'';position:absolute;left:0;right:0;height:2px;background:var(--cyan);box-shadow:0 0 18px var(--cyan);animation:scan 1.6s ease-in-out infinite}
@keyframes scan{0%{top:6%}50%{top:92%}100%{top:6%}}
.scan .sk{height:10px;border-radius:6px;background:rgba(63,224,197,.18)}.scan .sk.w6{width:60%}.scan .sk.w8{width:80%}.scan .sk.w4{width:40%}.scan .sk.blk{height:90px;border-radius:12px}
.tag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font:500 .72rem/1 var(--mono);background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 10px;border-radius:999px;white-space:nowrap;z-index:3}
.phone a.open{position:absolute;inset:0;border-radius:40px;z-index:2}

.sec{padding:clamp(56px,9vw,96px) 18px;border-top:1px solid var(--line)}.in{max-width:1160px;margin:0 auto}
.kick{font:500 .76rem/1 var(--mono);color:var(--cyan);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px}
.sec h2{font-size:clamp(1.6rem,4.6vw,2.6rem)}
.lead2{color:var(--muted);max-width:40em;margin:0}

.car{position:relative;margin-top:24px}
.track{display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;padding:14px calc(50% - min(43vw,160px));scrollbar-width:none;outline:none}
.track::-webkit-scrollbar{display:none}
.slide{flex:0 0 min(86vw,320px);scroll-snap-align:center;display:flex;flex-direction:column;align-items:center;transition:transform .35s,opacity .35s;opacity:.45;transform:scale(.93)}
.slide.on{opacity:1;transform:none}
.slide .phone{width:min(100%,280px)}
.meta{text-align:center;margin-top:16px;max-width:290px;width:100%}
.meta h3{font-size:1.3rem;margin:0}.meta p{margin:2px 0 0;color:var(--muted);font-size:.9rem}
.sw{display:flex;gap:6px;justify-content:center;margin:10px 0 0}.sw i{width:14px;height:14px;border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.25)}
.meta .btn{margin-top:12px;width:100%}
.ctrl{display:flex;justify-content:center;align-items:center;gap:14px;padding:10px 0 0}
.ctrl button.arw{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:1.1rem;cursor:pointer}
.dots{display:flex;gap:8px}.dots button{width:8px;height:8px;border-radius:3px;border:0;padding:0;background:rgba(255,255,255,.25);cursor:pointer}
.dots button[aria-current=true]{background:var(--cyan);width:22px;box-shadow:0 0 10px var(--cyan)}

.cards{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin-top:24px}
.cardx{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px}
.cardx b{font:600 .8rem/1 var(--mono);color:var(--cyan)}.cardx p{color:var(--muted);margin:0}
.plan{display:flex;flex-direction:column}.plan.hi{border-color:rgba(63,224,197,.5);box-shadow:0 0 40px rgba(63,224,197,.12)}
.plan .p{font-family:var(--head);font-size:2rem;font-weight:700}.plan ul{padding-left:18px;color:var(--muted);flex:1}
.plan .btn{background:var(--ink);color:var(--bg)}
footer{padding:28px 18px;text-align:center;color:var(--muted);font-size:.85rem;border-top:1px solid var(--line)}
@media (min-width:861px){.hero{align-items:start}.hero .stage{position:sticky;top:24px;padding-top:40px}}
@media (max-width:860px){.hero{grid-template-columns:1fr;gap:28px}.hero .stage .phone{width:min(78vw,300px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const EXAMPLES = [
  'Bijoux en nacre et coquillages faits main à Moorea',
  'Monoï, savons et soins au tiare, préparés à Tahiti',
  'Sculpture sur bois et tapa, atelier à Raiatea',
  'Perles de Tahiti montées en bijoux, Rangiroa',
];

const JS = `(function(){
  var d=document;
  // Mise à l'échelle des aperçus téléphone
  function fit(){ [].forEach.call(d.querySelectorAll('.screen'),function(sc){ sc.style.setProperty('--k', sc.clientWidth/390); }); }
  window.addEventListener('resize',fit); fit();

  // ── Générateur ──
  var form=d.getElementById('gen'), desc=d.getElementById('desc'), nom=d.getElementById('nom'), go=d.getElementById('go'), err=d.getElementById('err');
  var term=d.getElementById('term'), res=d.getElementById('result'), frame=d.getElementById('live'), scan=d.getElementById('scan'), tag=d.getElementById('livetag'), open=d.getElementById('liveopen');
  [].forEach.call(d.querySelectorAll('.chip'),function(c){ c.addEventListener('click',function(){ desc.value=c.textContent; desc.focus(); }); });
  function line(txt,cls){ var p=d.createElement('div'); if(cls) p.className=cls; p.textContent=txt; term.appendChild(p); return p; }
  function wait(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  var running=false, run=0;
  function post(mode,v){ return fetch('/api/generer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({description:v,nom:nom.value.trim(),mode:mode})})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'Erreur'); return j; }); }); }
  function show(j,label){
    frame.style.opacity=0;
    frame.onload=function(){ fit(); frame.style.opacity=1; scan.classList.remove('on'); };
    frame.src=j.apercu; open.href=j.apercu; tag.textContent='aperçu de votre boutique';
    d.getElementById('r-src').textContent=label;
    d.getElementById('r-nom').textContent=j.nom; d.getElementById('r-slogan').textContent=j.slogan;
    d.getElementById('r-modele').textContent='modèle '+j.modeleLabel;
    d.getElementById('r-prod').textContent=j.produits+' produits';
    d.getElementById('r-c1').style.background=j.couleurs[0]; d.getElementById('r-c2').style.background=j.couleurs[1];
    d.getElementById('r-create').href=j.creer; res.classList.add('on');
  }
  function done(){ running=false; go.disabled=false; go.classList.remove('busy'); go.querySelector('span').textContent='Régénérer ✦'; }
  form.addEventListener('submit',function(e){ e.preventDefault(); if(running) return;
    var v=desc.value.trim(); err.textContent='';
    if(v.length<8){ err.textContent='Décrivez votre activité en une phrase.'; desc.focus(); return; }
    var me=++run; running=true; go.disabled=true; go.classList.add('busy'); go.querySelector('span').textContent='Génération…';
    res.classList.remove('on'); term.textContent=''; term.classList.add('on'); scan.classList.add('on'); tag.textContent='génération…';
    var refine=d.getElementById('r-ai'); refine.hidden=true;
    var ia=post('ia',v);
    (async function(){
      try{
        line('> analyse de votre activité…'); var j=await post('rapide',v); await wait(250);
        line('✓ modèle '+j.modeleLabel+', couleurs et sections','ok'); await wait(200);
        line('✓ première version prête','ok');
        show(j,'✦ Première version'); refine.hidden=false;
        if(window.innerWidth<860) d.getElementById('preview').scrollIntoView({behavior:'smooth',block:'center'});
        done();
        var cur=line('> l’IA rédige vos textes et votre catalogue…','cur');
        try{ var k=await ia; if(me!==run) return; cur.className='';
          if(k.source==='ia'){ line('✓ boutique affinée par l’IA','ok'); scan.classList.add('on'); show(k,'✦ Affinée par IA'); }
          else { line('· version automatique conservée'); d.getElementById('r-src').textContent='✦ Proposition automatique'; }
        }catch(x){ if(me===run){ cur.className=''; line('· version automatique conservée'); } }
        if(me===run) refine.hidden=true;
      }catch(x){ err.textContent=x.message||'La génération a échoué, réessayez.'; scan.classList.remove('on'); tag.textContent='exemple'; done(); }
    })();
  });
  d.getElementById('r-again').addEventListener('click',function(){ form.requestSubmit ? form.requestSubmit() : go.click(); });

  // ── Carrousel des modèles ──
  var track=d.getElementById('track'); if(!track) return;
  var slides=[].slice.call(track.querySelectorAll('.slide')), dots=[].slice.call(d.querySelectorAll('.dots button')), cur=0;
  function goTo(i){ i=(i+slides.length)%slides.length; var s=slides[i]; track.scrollTo({left:s.offsetLeft-(track.clientWidth-s.clientWidth)/2,behavior:'smooth'}); }
  function mark(i){ cur=i; slides.forEach(function(s,k){ s.classList.toggle('on',k===i); s.setAttribute('aria-hidden',k===i?'false':'true'); s.querySelectorAll('a').forEach(function(a){ a.tabIndex=k===i?0:-1; }); });
    dots.forEach(function(x,k){ x.setAttribute('aria-current',k===i?'true':'false'); }); }
  function nearest(){ var c=track.scrollLeft+track.clientWidth/2,b=0,dd=1e9; slides.forEach(function(s,k){ var x=Math.abs(s.offsetLeft+s.clientWidth/2-c); if(x<dd){dd=x;b=k;} }); return b; }
  var raf=0; track.addEventListener('scroll',function(){ cancelAnimationFrame(raf); raf=requestAnimationFrame(function(){ var n=nearest(); if(n!==cur) mark(n); }); },{passive:true});
  dots.forEach(function(x,k){ x.addEventListener('click',function(){ goTo(k); }); });
  d.getElementById('prev').addEventListener('click',function(){ goTo(cur-1); });
  d.getElementById('next').addEventListener('click',function(){ goTo(cur+1); });
  track.addEventListener('keydown',function(e){ if(e.key==='ArrowRight') goTo(cur+1); if(e.key==='ArrowLeft') goTo(cur-1); });
  cur=-1; mark(0); track.scrollLeft=slides[0].offsetLeft-(track.clientWidth-slides[0].clientWidth)/2;
})();`;

export function landingPage(env) {
  const keys = Object.keys(MODELES);
  const slides = keys.map((k, i) => {
    const m = MODELES[k], d = DEMOS[k];
    return `<article class="slide${i === 0 ? ' on' : ''}" aria-roledescription="diapositive" aria-label="${i + 1} sur ${keys.length} : modèle ${esc(m.label)}">
      <div class="phone"><div class="screen"><iframe src="/demo/${k}" title="Aperçu de la boutique ${esc(d.nom)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></div>
        <a class="open" href="/demo/${k}" aria-label="Ouvrir la boutique d’exemple ${esc(d.nom)}"></a></div>
      <div class="meta"><h3>${esc(m.label)}</h3><p>${esc(m.pitch)}</p>
        <div class="sw" aria-hidden="true"><i style="background:${m.tokens.bg}"></i><i style="background:${m.primary}"></i><i style="background:${m.secondary}"></i></div>
        <a class="btn line" href="/demarrer?modele=${k}">Partir de ce modèle</a></div></article>`;
  }).join('');
  const dots = keys.map((k, i) => `<button type="button" aria-label="Modèle ${esc(MODELES[k].label)}" aria-current="${i === 0}"></button>`).join('');
  const plans = Object.values(PLANS).map((p, i) => `<div class="cardx plan${i === 1 ? ' hi' : ''}"><b>${esc(p.label.toUpperCase())}</b>
      <div class="p">${fmtXpf(p.monthly)}<span style="font-size:.9rem;font-weight:400;color:var(--muted)"> / mois</span></div>
      <p style="margin:0 0 8px">ou ${fmtXpf(annualPrice(p))} / an, 2 mois offerts</p>
      <ul><li>${p.maxProducts} produits</li><li>${p.salesQuota} ventes payées / mois</li><li>Générateur IA, 4 modèles, sections</li><li>Panier, factures, étiquettes postales</li></ul>
      <a class="btn" href="/demarrer?plan=${p.key}">Commencer</a></div>`).join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(env.BRAND || 'Hinova Boutiques')} — générateur de boutiques en ligne pour la Polynésie</title>
<meta name="description" content="Décrivez votre activité en une phrase : l’IA construit votre boutique en ligne, prête à vendre dans toutes les îles. Paiement direct au commerçant.">
<meta name="theme-color" content="#04090B">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="grid-bg">
  <div class="bar"><a class="mark" href="/"><i></i>Hinova Boutiques</a><a class="login" href="/connexion">Se connecter</a></div>
  <section class="hero">
    <div>
      <span class="badge">Générateur IA · Polynésie</span>
      <h1>Décrivez votre activité.<br><em>L’IA construit votre boutique.</em></h1>
      <p class="sub">Une phrase suffit : nom, modèle, couleurs, textes et catalogue sont prêts en quelques secondes. Vous ajustez, vous vendez dans toutes les îles.</p>
      <form class="gen" id="gen" novalidate>
        <label for="desc">Votre activité</label>
        <textarea id="desc" maxlength="400" placeholder="Ex. : je fais des bijoux en nacre et en coquillages à Moorea, je veux vendre dans toutes les îles"></textarea>
        <input id="nom" maxlength="60" placeholder="Nom de la boutique (facultatif)" aria-label="Nom de la boutique (facultatif)">
        <div class="chips" aria-label="Exemples">${EXAMPLES.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join('')}</div>
        <button class="go" id="go" type="submit"><i class="spin"></i><span>Générer ma boutique ✦</span></button>
        <p class="err" id="err" role="alert"></p>
        <div class="term" id="term" aria-live="polite"></div>
        <div class="result" id="result" aria-live="polite">
          <span class="src" id="r-src"></span><h3 id="r-nom"></h3><p id="r-slogan"></p>
          <div class="facts"><span id="r-modele"></span><span id="r-prod"></span><span><i id="r-c1"></i><i id="r-c2"></i>couleurs</span></div>
          <p class="ai-wait" id="r-ai" hidden><i class="spin"></i> L’IA affine votre boutique, l’aperçu se met à jour tout seul…</p>
          <p class="note">Photos d’exemple : dans votre boutique, vous mettrez les vôtres.</p>
          <div class="acts"><a class="btn gold" id="r-create" href="/demarrer">Créer cette boutique</a><button class="btn line" id="r-again" type="button">Régénérer</button></div>
        </div>
      </form>
    </div>
    <div class="stage" id="preview">
      <div class="phone"><span class="tag" id="livetag">exemple</span>
        <div class="screen"><iframe id="live" src="/demo/lagon" title="Aperçu de la boutique" tabindex="-1"></iframe>
          <div class="scan" id="scan" aria-hidden="true"><div class="sk w6"></div><div class="sk w8"></div><div class="sk blk"></div><div class="sk w4"></div><div class="sk w8"></div><div class="sk blk"></div></div></div>
        <a class="open" id="liveopen" href="/demo/lagon" aria-label="Ouvrir l’aperçu en grand"></a></div>
    </div>
  </section>
</div>

<section class="sec"><div class="in">
  <div class="kick">// modèles</div>
  <h2>Ou partez d’un modèle</h2>
  <p class="lead2">Quatre ambiances prêtes à l’emploi. Glissez pour les découvrir, touchez un téléphone pour visiter la boutique.</p>
  <div class="car" aria-roledescription="carrousel" aria-label="Boutiques modèles">
    <div class="track" id="track" tabindex="0">${slides}</div>
    <div class="ctrl"><button class="arw" id="prev" type="button" aria-label="Modèle précédent">‹</button><div class="dots">${dots}</div><button class="arw" id="next" type="button" aria-label="Modèle suivant">›</button></div>
  </div>
</div></section>

<section class="sec"><div class="in">
  <div class="kick">// comment ça marche</div>
  <h2>De l’idée à la vente, sans technique</h2>
  <div class="cards">
    <div class="cardx"><b>01</b><h3>Décrivez</h3><p>Une phrase sur votre activité : l’IA propose nom, modèle, textes et catalogue.</p></div>
    <div class="cardx"><b>02</b><h3>Ajustez</h3><p>Depuis votre téléphone : photos, prix, stock, sections de la page.</p></div>
    <div class="cardx"><b>03</b><h3>Vendez</h3><p>Panier, instructions de paiement, bon de commande, étiquette postale et facture automatiques.</p></div>
    <div class="cardx"><b>04</b><h3>Encaissez directement</h3><p>Virement, guichet ou carte via votre contrat OSB : l’argent va sur votre compte, jamais chez nous.</p></div>
  </div>
</div></section>

<section class="sec" id="formules"><div class="in">
  <div class="kick">// formules</div>
  <h2>Un abonnement simple</h2>
  <p class="lead2">${esc(env.TRIAL_DAYS || '14')} jours offerts, sans engagement.</p>
  <div class="cards">${plans}</div>
  <p class="lead2" style="margin-top:18px;font-size:.9rem">Plus de produits ou un site sur mesure ? <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a></p>
</div></section>

<footer>Hinova Digital · Boutiques en ligne pour la Polynésie française</footer>
<script>${JS}</script>
</body></html>`;
}
