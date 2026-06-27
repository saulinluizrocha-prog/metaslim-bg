const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const CONFIG = {
  api_key:    'c66289394c2a6e8515c8e8b382fba719',
  offer_id:   '14363',
  user_id:    '75329',
  api_domain: 'https://t-api.org',
};

// ── SHA1 checksum ──────────────────────────────────────────────────────────
function checkSum(jsonData) {
  return crypto.createHash('sha1').update(jsonData + CONFIG.api_key).digest('hex');
}

// ── HTTP POST to Terra API ─────────────────────────────────────────────────
function apiRequest(data, model, method) {
  return new Promise((resolve, reject) => {
    const payload   = { user_id: CONFIG.user_id, data };
    const jsonData  = JSON.stringify(payload);
    const sum       = checkSum(jsonData);
    const urlObj    = new URL(`${CONFIG.api_domain}/api/${model}/${method}?check_sum=${sum}`);

    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(jsonData),
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.status === 'ok')    return resolve(parsed.data);
          if (parsed.status === 'error') return reject(new Error(parsed.error || 'API error'));
          reject(new Error('Unknown API status'));
        } catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', e => reject(e));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(jsonData);
    req.end();
  });
}

// ── Parse URL-encoded body ────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(querystring.parse(body)); } catch { resolve({}); } });
  });
}

// ── Get real IP ───────────────────────────────────────────────────────────
function getIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress || ''
  );
}

// ── Phone normalization for BG ────────────────────────────────────────────
// Accepts: +359XXXXXXXXX | 00359XXXXXXXXX | 0XXXXXXXXX | 8/9XXXXXXXX
function normalizePhone(raw) {
  const d = (raw || '').replace(/[\s\-().]/g, '');
  if (/^\+359\d{9}$/.test(d))  return d;
  if (/^00359\d{9}$/.test(d))  return '+359' + d.slice(5);
  if (/^0\d{9}$/.test(d))      return '+359' + d.slice(1);
  if (/^[89]\d{8}$/.test(d))   return '+359' + d;
  return null;
}

// ── Serverless handler ────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.redirect(302, '/bg');

  const post = await parseBody(req);

  // ── Validate required fields ──────────────────────────────────────────
  if (!post.name || !post.phone) {
    return res.redirect(302, req.headers['referer'] || '/bg');
  }

  const phone = normalizePhone(post.phone);
  if (!phone) {
    return res.redirect(302, (req.headers['referer'] || '/bg') + '?err=phone');
  }

  const name = String(post.name).trim();
  if (name.length < 2) {
    return res.redirect(302, (req.headers['referer'] || '/bg') + '?err=name');
  }

  const ip = getIp(req);
  const reqUrl = new URL(req.url, `https://${req.headers.host}`);
  const get    = Object.fromEntries(reqUrl.searchParams.entries());

  // ── Build lead payload ────────────────────────────────────────────────
  const data = {
    name,
    phone,
    offer_id: CONFIG.offer_id,
    country:  'BG',
    user_agent: req.headers['user-agent'] || 'Unknown',
    ip,
    referer: get.referer || req.headers['referer'] || null,
  };

  // Optional tracking params
  const optionals = {
    utm_source:   get.utm_source   || post.utm_source,
    utm_medium:   get.utm_medium   || post.utm_medium,
    utm_campaign: get.utm_campaign || post.utm_campaign,
    utm_term:     get.utm_term     || post.utm_term,
    utm_content:  get.utm_content  || post.utm_content,
    sub_id:   get.sub1 || post.sub1,
    sub_id_1: get.sub2 || post.sub2,
    sub_id_2: get.sub3 || post.sub3,
    sub_id_3: get.sub4 || post.sub4,
    sub_id_4: get.sub5 || post.sub5,
    // gclid as sub_id_5
    sub_id_5: get.gclid || post.gclid,
  };

  for (const [k, v] of Object.entries(optionals)) {
    if (v !== undefined && v !== null && v !== '') data[k] = v;
  }

  try {
    const lead = await apiRequest(data, 'lead', 'create');
    return res.redirect(302, `/bg-success.html?id=${lead.id}`);
  } catch (err) {
    console.error('[bg-submit] API error:', err.message);
    return res.redirect(302, '/bg-success.html');   // still redirect on error
  }
};
