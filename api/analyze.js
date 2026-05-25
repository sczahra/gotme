function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.end(JSON.stringify(data));
}

function cleanText(s = '') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function meta(html, key) {
  const propertyPattern = new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const namePattern = new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const match = html.match(propertyPattern) || html.match(namePattern);
  return match && match[1] ? cleanText(match[1]) : '';
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

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, {
      ok: true,
      message: 'gotme analyze function is installed on Vercel. Send a POST request with an Instagram url.'
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, { ok: false, message: 'Method not allowed.' }, 405);
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const url = safeUrl(body.url || '');

  if (!url) {
    return sendJson(res, { ok: false, message: 'Paste a valid instagram.com link.' }, 400);
  }

  const out = {
    ok: false,
    url,
    title: '',
    description: '',
    caption: '',
    author: '',
    message: ''
  };

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'accept': 'text/html'
      }
    });

    const html = await response.text();

    out.title = meta(html, 'og:title') || meta(html, 'twitter:title');
    out.description = meta(html, 'og:description') || meta(html, 'description') || meta(html, 'twitter:description');

    if ((out.title + out.description).trim().length > 40) {
      out.ok = true;
      out.message = 'Found public Instagram metadata. This is a rough vibe check, not an audio transcript.';
      return sendJson(res, out);
    }
  } catch (error) {
    out.error = 'Fetch failed';
  }

  out.message = 'Could not access enough public Reel text from this link alone.';
  return sendJson(res, out);
}
