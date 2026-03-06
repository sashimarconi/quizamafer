function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  let body = {};
  try {
    const text = await new Promise((r) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => r(data));
    });
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    body = {};
  }

  // Basic acceptance: log and reply 200 quickly. Do not expose secrets.
  try {
    console.log('[GhostsPay Webhook] received event:', (body && body.type) || 'unknown', 'id:', (body && (body.objectId || body.id)) || null);
    console.log('[GhostsPay Webhook] payload sample:', JSON.stringify(body).slice(0, 2000));
  } catch (e) {
    console.log('[GhostsPay Webhook] received (unserializable payload)');
  }

  // Return 200 immediately. GhostsPay will retry on non-2xx.
  sendJson(res, 200, { ok: true });
};
