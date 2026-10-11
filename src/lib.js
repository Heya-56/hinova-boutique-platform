// Utilitaires : sécurité, sessions signées, réponses HTTP, dates, formatage.

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// JSON injectable sans risque dans une balise <script type="application/json">
export const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export function uid() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const enc = new TextEncoder();
export const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function b64urlDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// Jeton signé HMAC-SHA256 : base64url(payload).base64url(signature)
export async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verify(tok, secret) {
  if (!tok || !secret || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (p.x && p.x < Date.now()) return null;
    return p;
  } catch { return null; }
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
export const RESERVED = new Set(['admin', 'api', 'www', 'app', 'support', 'hinova', 'img', 'static', 'demo', 'auth', 'b', 'f', 'mail']);

const BASE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};
export function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...BASE_HEADERS, ...headers } });
}
export function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}
export const withMsg = (path, key, msg) => `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(msg)}`;

export function getCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
export function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// Protection CSRF : un POST doit venir de notre propre origine (cookies SameSite=Lax en complément).
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function readForm(request) {
  try { return await request.formData(); } catch { return new FormData(); }
}

// Redirections internes uniquement (pas de //domaine ni d'URL absolue)
export const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/tableau-de-bord');

export const nowIso = () => new Date().toISOString();
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString();
export function addMonths(d, n) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString(); }

// Heure de Tahiti (UTC-10, pas d'heure d'été)
const tahiti = () => new Date(Date.now() - 10 * 3600000);
export const monthKey = () => tahiti().toISOString().slice(0, 7); // YYYY-MM
export const yearKey = () => tahiti().toISOString().slice(0, 4);
export function monthStartSql() {
  const t = tahiti();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) + 10 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
}

export function fmtXpf(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n) || 0).replace(/[\s\u202f\u00a0]/g, '\u00a0') + '\u00a0XPF';
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { timeZone: 'Pacific/Tahiti', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function int(v, def = 0) {
  const n = parseInt(String(v ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : def;
}
export const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
export const isHttps = (v) => /^https:\/\/[^\s<>"']+$/.test(v);
export const isColor = (v) => /^#[0-9a-fA-F]{6}$/.test(v);
export const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// Mot de passe : PBKDF2-SHA256, 100 000 itérations (maximum accepté par Workers), sel aléatoire
export async function hashPassword(password, saltHex) {
  const salt = saltHex || [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join(''), salt };
}
