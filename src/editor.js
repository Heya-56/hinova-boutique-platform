// Script de l'éditeur de sections (servi tel quel au navigateur sur /static/editeur.js).
// Construit l'interface avec le DOM (jamais innerHTML avec des données) ; le serveur revalide tout.
export const EDITOR_JS = String.raw`(function () {
  var root = document.getElementById('editeur');
  if (!root) return;
  var TYPES = JSON.parse(document.getElementById('section-types').textContent);
  var state = JSON.parse(document.getElementById('sections-data').textContent);
  var MAX = 12;
  var form = root.closest('form');
  var out = form.querySelector('input[name=sections_json]');

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function field(def, obj) {
    var id = 'f' + Math.random().toString(36).slice(2, 8);
    var input;
    if (def.options) {
      input = el('select', { id: id });
      def.options.forEach(function (o) { input.appendChild(el('option', { value: o, text: o, selected: obj[def.k] === o })); });
    } else if (def.area) {
      input = el('textarea', { id: id, maxlength: def.max });
      input.value = obj[def.k] || '';
    } else {
      input = el('input', { id: id, maxlength: def.max });
      input.value = obj[def.k] || '';
    }
    input.addEventListener('input', function () { obj[def.k] = input.value; sync(); });
    input.addEventListener('change', function () { obj[def.k] = input.value; sync(); });
    return el('div', {}, [el('label', { for: id, text: def.label }), input]);
  }
  function move(i, d) {
    var j = i + d; if (j < 0 || j >= state.length) return;
    var t = state[i]; state[i] = state[j]; state[j] = t; render();
  }
  function card(s, i) {
    var def = TYPES[s.type];
    var head = el('div', { class: 'ed-head' }, [
      el('strong', { text: (i + 1) + '. ' + def.label }),
      el('span', { class: 'ed-tools' }, [
        el('label', { class: 'ed-vis' }, [el('input', { type: 'checkbox', checked: s.visible, onchange: function (e) { s.visible = e.target.checked; sync(); } }), document.createTextNode(' Visible')]),
        el('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Monter', text: '↑', onclick: function () { move(i, -1); } }),
        el('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Descendre', text: '↓', onclick: function () { move(i, 1); } }),
        def.required ? null : el('button', { type: 'button', class: 'btn small danger', text: 'Retirer', onclick: function () { if (confirm('Retirer cette section ?')) { state.splice(i, 1); render(); } } })
      ])
    ]);
    var body = el('div', { class: 'ed-body' }, def.fields.map(function (f) { return field(f, s); }));
    if (def.items) {
      s.items = s.items || [];
      s.items.forEach(function (it, k) {
        var box = el('div', { class: 'ed-item' }, def.items.fields.map(function (f) { return field(f, it); }));
        box.appendChild(el('button', { type: 'button', class: 'btn small ghost', text: 'Supprimer ce ' + def.items.label.toLowerCase(), onclick: function () { s.items.splice(k, 1); render(); } }));
        body.appendChild(box);
      });
      if (s.items.length < def.items.max) {
        body.appendChild(el('button', { type: 'button', class: 'btn small ghost', text: '+ ' + def.items.label, onclick: function () {
          var it = {}; def.items.fields.forEach(function (f) { it[f.k] = ''; }); s.items.push(it); render(); } }));
      }
    }
    return el('div', { class: 'ed-card' + (s.visible ? '' : ' off') }, [head, body]);
  }
  function adder() {
    if (state.length >= MAX) return el('p', { class: 'muted small', text: 'Maximum ' + MAX + ' sections.' });
    var sel = el('select', { 'aria-label': 'Type de section' });
    Object.keys(TYPES).forEach(function (k) {
      if (TYPES[k].unique && state.some(function (s) { return s.type === k; })) return;
      sel.appendChild(el('option', { value: k, text: TYPES[k].label }));
    });
    return el('div', { class: 'row', style: 'align-items:end' }, [
      el('div', {}, [el('label', { text: 'Ajouter une section' }), sel]),
      el('div', {}, [el('button', { type: 'button', class: 'btn ghost', text: 'Ajouter', onclick: function () {
        var t = sel.value, s = { id: Math.random().toString(36).slice(2, 10), type: t, visible: true };
        TYPES[t].fields.forEach(function (f) { s[f.k] = f.options ? f.options[0] : ''; });
        if (TYPES[t].items) s.items = [];
        state.push(s); render();
        root.lastElementChild.previousElementSibling.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } })])
    ]);
  }
  function sync() { out.value = JSON.stringify(state); }
  function render() {
    root.textContent = '';
    state.forEach(function (s, i) { root.appendChild(card(s, i)); });
    root.appendChild(adder());
    sync();
  }
  render();
})();`;

export const EDITOR_CSS = `
.ed-card{border:1px solid var(--line);border-radius:12px;margin:12px 0;background:#fff}
.ed-card.off{opacity:.6}
.ed-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line);background:#FAFBFA;border-radius:12px 12px 0 0}
.ed-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ed-tools .btn{min-width:38px}
.ed-vis{margin:0;font-weight:500;font-size:.85rem}
.ed-body{padding:4px 14px 14px}
.ed-item{border-left:3px solid var(--accent-2);padding:2px 0 10px 12px;margin:12px 0}
`;
