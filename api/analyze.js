function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.end(JSON.stringify(data));
}

function decodeEntities(s = '') {
  return String(s)
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u002F/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(s = '') {
  return decodeEntities(String(s))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksMachineGenerated(text = '') {
  const s = cleanText(text);
  if (!s) return true;
  if (s.length < 4) return true;
  if (/^#[a-f0-9]{8,}$/i.test(s)) return true;
  if (/^(#[a-f0-9]{6,}\s*){2,}$/i.test(s)) return true;
  if (/^[a-f0-9]{16,}$/i.test(s)) return true;
  if (/^[A-Z0-9_]{18,}$/.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  if (/__bbox|requireLazy|RelayPrefetchedStreamCache|Comet|Polaris|InstagramWeb|DTSG|LSD|csrftoken/i.test(s)) return true;
  const letters = (s.match(/[a-z]/gi) || []).length;
  const vowels = (s.match(/[aeiou]/gi) || []).length;
  const hexish = (s.match(/[a-f0-9#]/gi) || []).length;
  if (s.length > 24 && hexish / s.length > 0.82) return true;
  if (letters > 12 && vowels / letters < 0.18) return true;
  return false;
}

function usefulText(text = '') {
  const s = cleanText(text);
  if (looksMachineGenerated(s)) return '';
  if (/log in|sign up|privacy|terms|cookies|browser is not supported/i.test(s)) return '';
  return s;
}

function meta(html, key) {
  const propertyPattern = new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const namePattern = new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const match = html.match(propertyPattern) || html.match(namePattern);
  return match && match[1] ? usefulText(match[1]) : '';
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

function unique(arr) {
  const seen = new Set();
  return arr.map(usefulText).filter(Boolean).filter(item => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashtagsFromTrustedText(text) {
  return unique((text.match(/#[\p{L}\p{N}_]{2,40}/gu) || [])).slice(0, 30);
}

function numbersFromText(text) {
  const likes = text.match(/([\d,.]+[KMBkmb]?)\s+likes?/i);
  const comments = text.match(/([\d,.]+[KMBkmb]?)\s+comments?/i);
  return {
    likes: likes ? likes[1] : '',
    comments: comments ? comments[1] : ''
  };
}

function findJsonStrings(html, keys) {
  const out = [];
  for (const key of keys) {
    const patterns = [
      new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'gi'),
      new RegExp(`'${key}'\\s*:\\s*'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'`, 'gi')
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(html)) && out.length < 80) {
        let val = m[1];
        try { val = JSON.parse('"' + val.replace(/"/g, '\\"') + '"'); } catch {}
        val = usefulText(val);
        if (val && /[a-z]{3,}/i.test(val) && !/^https?:/i.test(val)) out.push(val);
      }
    }
  }
  return unique(out);
}

function findCommentLikeSnippets(html) {
  const snippets = [];
  const keys = ['text', 'comment_text', 'comment', 'preview_comments', 'edge_media_to_parent_comment', 'edge_media_preview_comment'];
  snippets.push(...findJsonStrings(html, keys));

  const aria = html.match(/aria-label=["']([^"']{8,220})["']/gi) || [];
  for (const item of aria) {
    const val = usefulText(item.replace(/^aria-label=["']|["']$/gi, ''));
    if (val && /comment|reply|said|😂|🤣|❤️|husband|wife|relationship|lol|lmao/i.test(val)) snippets.push(val);
  }

  return unique(snippets)
    .filter(x => x.length >= 8 && x.length <= 280)
    .filter(x => /[a-z]{3,}/i.test(x))
    .slice(0, 12);
}

function findAuthor(html, title = '') {
  const byline = meta(html, 'author') || meta(html, 'article:author');
  if (byline) return byline;
  const m = title.match(/^(.+?)\s+on Instagram/i);
  return m ? usefulText(m[1]) : '';
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, {
      ok: true,
      version: '0.3.1',
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
    version: '0.3.1',
    url,
    title: '',
    description: '',
    caption: '',
    author: '',
    hashtags: [],
    comments: [],
    counts: { likes: '', comments: '' },
    sources: {
      publicMetadata: false,
      captionOrDescription: false,
      hashtags: false,
      commentSnippets: false,
      spokenAudio: false,
      onScreenText: false,
      visualAction: false
    },
    message: ''
  };

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    });

    const html = await response.text();
    out.status = response.status;
    out.title = meta(html, 'og:title') || meta(html, 'twitter:title');
    out.description = meta(html, 'og:description') || meta(html, 'description') || meta(html, 'twitter:description');
    out.caption = out.description;
    out.author = findAuthor(html, out.title);

    const trustedText = [out.title, out.description, out.author].filter(Boolean).join(' ');
    out.hashtags = hashtagsFromTrustedText(trustedText);
    out.comments = findCommentLikeSnippets(html);
    out.counts = numbersFromText(cleanText(html.slice(0, 200000)));

    out.sources.publicMetadata = Boolean(out.title || out.description || out.author);
    out.sources.captionOrDescription = Boolean(out.description && out.description.length > 10);
    out.sources.hashtags = out.hashtags.length > 0;
    out.sources.commentSnippets = out.comments.length > 0;

    const combined = [out.title, out.description, out.author, out.hashtags.join(' '), out.comments.join(' ')].join(' ').trim();
    if (combined.length > 40) {
      out.ok = true;
      out.message = out.sources.commentSnippets
        ? 'Found human-readable public metadata and possible comment/audience snippets. Still not an audio transcript.'
        : 'Found human-readable public Instagram metadata. Still not an audio transcript.';
      return sendJson(res, out);
    }
  } catch (error) {
    out.error = 'Fetch failed';
  }

  out.message = 'Could not access enough human-readable Reel text from this link alone.';
  return sendJson(res, out);
}
