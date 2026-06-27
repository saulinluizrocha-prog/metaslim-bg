const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const CONFIG = {
    api_key: 'c66289394c2a6e8515c8e8b382fba719',
    offer_id: '14363',
    user_id: '75329',
    api_domain: 'https://t-api.org',
};

function checkSum(jsonData) {
    return crypto.createHash('sha1').update(jsonData + CONFIG.api_key).digest('hex');
}

function apiRequest(data, model, method) {
    return new Promise((resolve, reject) => {
        const payload = {
            user_id: CONFIG.user_id,
            data: data,
        };

        const jsonData = JSON.stringify(payload);
        const sum = checkSum(jsonData);
        const url = `${CONFIG.api_domain}/api/${model}/${method}?check_sum=${sum}`;

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonData),
            },
            rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed.status === 'ok') {
                        resolve(parsed.data);
                    } else {
                        reject(new Error(parsed.error || 'API error'));
                    }
                } catch (e) {
                    reject(new Error('JSON parse error'));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(jsonData);
        req.end();
    });
}

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(querystring.parse(body));
            } catch (e) {
                resolve({});
            }
        });
    });
}

function getIp(req) {
    return (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-real-ip'] ||
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        ''
    );
}

module.exports = async (req, res) => {
    // Allow CORS from same origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.redirect(302, '/');
    }

    const post = await parseBody(req);

    if (!post.name || !post.phone) {
        const referer = req.headers['referer'] || '/';
        return res.redirect(302, referer);
    }

    // Parse query string from referer or request URL
    const reqUrl = new URL(req.url, `https://${req.headers.host}`);
    const get = Object.fromEntries(reqUrl.searchParams.entries());

    const ip = getIp(req);

    const NOT_REQUIRED = [
        'tz', 'address', 'region', 'city', 'zip', 'stream_id', 'count',
        'email', 'user_comment',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'sub_id', 'sub_id_1', 'sub_id_2', 'sub_id_3', 'sub_id_4',
        'referer', 'user_agent', 'ip',
    ];

    const data = {
        name: (post.name || '').trim(),
        phone: (post.phone || '').trim(),
        offer_id: CONFIG.offer_id,
        country: 'BG',
    };

    const extras = {
        region: post.region,
        city: post.city,
        count: post.count,
        stream_id: '',
        address: post.address,
        email: post.email,
        zip: post.zip,
        user_comment: post.user_comment,
        referer: get.referer || req.headers['referer'] || null,
        user_agent: req.headers['user-agent'] || 'Unknown',
        ip: ip,
        utm_source: get.utm_source,
        utm_medium: get.utm_medium,
        utm_campaign: get.utm_campaign,
        utm_term: get.utm_term,
        utm_content: get.utm_content,
        sub_id: get.sub_id,
        sub_id_1: get.sub_id_1,
        sub_id_2: get.sub_id_2,
        sub_id_3: get.sub_id_3,
        sub_id_4: get.sub_id_4,
    };

    for (const [key, value] of Object.entries(extras)) {
        if (NOT_REQUIRED.includes(key) && value !== undefined && value !== null) {
            data[key] = value;
        }
    }

    try {
        const lead = await apiRequest(data, 'lead', 'create');
        return res.redirect(302, `/success.html?id=${lead.id}`);
    } catch (err) {
        console.error('API error:', err.message);
        return res.status(500).send(`Error: ${err.message}`);
    }
};
