const BLACKCAT_BASE_URL = 'https://api.blackcatpay.com.br/api';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function mapStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAID') return 'paid';
  if (normalized === 'PENDING') return 'pending';
  if (normalized === 'CANCELLED') return 'cancelled';
  if (normalized === 'REFUNDED') return 'refunded';
  return normalized.toLowerCase() || 'unknown';
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

  const apiKey = process.env.BLACKCATPAY_SECRET_KEY || process.env.BLACKCATPAY_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, {
      error: 'BLACKCATPAY_SECRET_KEY não configurada no ambiente.'
    });
    return;
  }

  const body = normalizeBody(req);
  const transactionId = body.transactionId || body.orderId || body.identifier;

  if (!transactionId) {
    sendJson(res, 400, { error: 'transactionId/orderId é obrigatório.' });
    return;
  }

  try {
    const response = await fetch(
      `${BLACKCAT_BASE_URL}/sales/${encodeURIComponent(String(transactionId))}/status`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey
        }
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.data) {
      sendJson(res, 502, {
        status: 'error',
        source: 'blackcatpay',
        checkerVersion: 'vercel-proxy-v1',
        checkedIds: [transactionId],
        error: result.message || result.error || 'Falha ao consultar status no BlackCatPay.',
        details: result
      });
      return;
    }

    const data = result.data;

    sendJson(res, 200, {
      status: mapStatus(data.status),
      source: 'blackcatpay',
      checkerVersion: 'vercel-proxy-v1',
      checkedIds: [transactionId],
      transactionId: data.transactionId,
      rawStatus: data.status,
      paidAt: data.paidAt || null,
      endToEndId: data.endToEndId || null
    });
  } catch (error) {
    sendJson(res, 500, {
      status: 'error',
      source: 'blackcatpay',
      checkerVersion: 'vercel-proxy-v1',
      checkedIds: [transactionId],
      error: 'Erro interno ao consultar status no BlackCatPay.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
