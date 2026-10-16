// Envoi d'e-mails transactionnels par l'API Brevo (société française, serveurs dans l'UE).
// Secret BREVO_API_KEY ; expéditeur MAIL_FROM (adresse d'un domaine vérifié chez Brevo).
// Sans clé, rien n'est envoyé : l'appelant le signale au commerçant, qui peut télécharger le PDF.

export const mailReady = (env) => typeof env.BREVO_API_KEY === 'string' && env.BREVO_API_KEY.length > 10 && !!env.MAIL_FROM;

function b64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function sendMail(env, { to, subject, html, attachments = [] }) {
  if (!mailReady(env)) return { ok: false, raison: 'non_configure' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM, name: env.BRAND || 'Hinova Boutiques' },
      to: [{ email: to }], subject, htmlContent: html,
      attachment: attachments.map((a) => ({ name: a.name, content: b64(a.bytes) })),
    }),
  });
  if (!res.ok) return { ok: false, raison: `brevo_${res.status}` };
  return { ok: true };
}
