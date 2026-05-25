function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}

function cleanText(s = '') {
  return String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function meta(html, key) {
  const a = new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const ma = html.match(a) || html.match(b);
  return ma && ma[1] ? cleanText(ma[1]) : '';
}

function safeUrl(input) {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'instagram.com') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  let body = {};
  try { body = await context.request.json(); } catch { return json({ ok:false, message:'Invalid request.' }, 400); }
  const url = safeUrl(body.url || '');
  if (!url) return json({ ok:false, message:'Paste a valid instagram.com link.' }, 400);

  const out = { ok:false, url, title:'', description:'', caption:'', author:'', message:'' };
  try {
    const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0', 'accept':'text/html' }, cf: { cacheTtl: 0, cacheEverything: false } });
    const html = await r.text();
    out.title = meta(html, 'og:title') || meta(html, 'twitter:title');
    out.description = meta(html, 'og:description') || meta(html, 'description') || meta(html, 'twitter:description');
    if ((out.title + out.description).trim().length > 40) {
      out.ok = true;
      out.message = 'Found public Instagram metadata. This is a rough vibe check, not an audio transcript.';
      return json(out);
    }
  } catch (e) {}

  out.message = 'Could not access enough public Reel text from this link alone.';
  return json(out);
}

export async function onRequestGet() {
  return json({ ok:true, message:'gotme analyze function is installed. Send a POST request with an Instagram url.' });
}
