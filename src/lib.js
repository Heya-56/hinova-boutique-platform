// Utilitaires : sécurité, identifiants, réponses HTTP, dates.

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function uid(prefix = '') {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return prefix + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

// PBKDF2-SHA256, 100 000 itérations (maximum supporté par Workers)
export async function hashPassword(password, saltHex) {
  const salt = saltHex || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: toHex(bits), salt };
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export const RESERVED_SLUGS = new Set(['admin', 'api', 'www', 'app', 'support', 'hinova', 'img', 's', 'static']);

export function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      ...headers,
    },
  });
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

export function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// Protection CSRF : un POST doit venir de notre propre origine.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // certains navigateurs omettent Origin sur les formulaires same-origin ; cookie SameSite=Lax couvre ce cas
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export const nowIso = () => new Date().toISOString();
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString();
export const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString(); };

export function fmtXpf(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n) || 0).replace(/[\s\u202f\u00a0]/g, '\u00a0') + '\u00a0XPF';
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z'))
    .toLocaleDateString('fr-FR', { timeZone: 'Pacific/Tahiti', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Début du mois courant (heure de Tahiti) au format SQLite, pour compter les ventes du mois
export function monthStartSql() {
  const t = new Date(Date.now() - 10 * 3600000); // UTC-10
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) + 10 * 3600000;
  return new Date(start).toISOString().replace('T', ' ').slice(0, 19);
}

export function int(v, def = 0) {
  const n = parseInt(String(v ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : def;
}

export function clean(v, max = 500) {
  return String(v ?? '').trim().slice(0, max);
}
