// Abonnements des commerçants via Stripe (Checkout, portail client, webhook signé). Aucune bibliothèque : appels HTTP directs.
const API = 'https://api.stripe.com/v1';

export const stripeReady = (env) => typeof env.STRIPE_SECRET_KEY === 'string' && /^(sk|rk)_(live|test)_/.test(env.STRIPE_SECRET_KEY);

export const priceFor = (env, plan, cycle) => env[`STRIPE_PRICE_${String(plan).toUpperCase()}_${cycle === 'annuel' ? 'ANNUEL' : 'MENSUEL'}`] || null;

// Encodage application/x-www-form-urlencoded avec objets et tableaux imbriqués (format attendu par Stripe)
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(env, method, path, params) {
  const init = { method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } };
  let url = API + path;
  if (params && method === 'GET') url += '?' + formEncode(params).toString();
  else if (params) { init.body = formEncode(params).toString(); init.headers['content-type'] = 'application/x-www-form-urlencoded'; }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status} : ${data?.error?.message || 'erreur'}`);
  return data;
}

export function createCheckout(env, { price, email, customer, metadata, origin, cancelPath = '/demarrer?annule=1', description }) {
  return call(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: email }),
    client_reference_id: metadata.inscription || metadata.boutique,
    metadata,
    subscription_data: { metadata, description },
    success_url: `${origin}/bienvenue?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: origin + cancelPath,
    locale: 'fr',
    allow_promotion_codes: true,
  });
}

export const getCheckout = (env, id) => call(env, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`, { expand: ['subscription'] });
export const getSubscription = (env, id) => call(env, 'GET', `/subscriptions/${encodeURIComponent(id)}`);
export const createPortal = (env, customer, returnUrl) => call(env, 'POST', '/billing_portal/sessions', { customer, return_url: returnUrl });

// Fin de la période payée (champ déplacé sur les lignes d'abonnement dans les versions récentes de l'API)
export function periodEnd(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const t = sub.current_period_end || sub.items?.data?.reduce((m, it) => Math.max(m, it.current_period_end || 0), 0);
  return t ? t * 1000 : null;
}
export function invoicePeriodEnd(inv) {
  const t = (inv?.lines?.data || []).reduce((m, l) => Math.max(m, l.period?.end || 0), 0);
  return t ? t * 1000 : null;
}
export const invoiceSubscription = (inv) => inv?.subscription || inv?.parent?.subscription_details?.subscription || null;
export const invoiceMetadata = (inv) => inv?.parent?.subscription_details?.metadata || inv?.subscription_details?.metadata || {};

// Vérification de la signature du webhook : en-tête « t=…,v1=… », HMAC-SHA256 de « t.corps », tolérance 5 minutes
export async function verifyWebhook(payload, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  let t = null; const sigs = [];
  for (const item of header.split(',')) {
    const [k, v] = item.split('=');
    if (k === 't') t = v;
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === expected.length && [...s].reduce((r, c, i) => r | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}
