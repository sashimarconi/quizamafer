const PARADISE_CHECK_BASE_URL = 'https://multi.paradisepags.com/api/v1/check_status.php';

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
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'approved', 'completed', 'success', 'succeeded'].includes(normalized)) return 'paid';
  if (['pending', 'waiting', 'processing', 'created'].includes(normalized)) return 'pending';
  if (['cancelled', 'canceled', 'voided', 'rejected'].includes(normalized)) return 'cancelled';
  if (['expired', 'expire', 'timeout'].includes(normalized)) return 'expired';
  if (['refunded', 'refund'].includes(normalized)) return 'refunded';
  return 'pending';
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
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

  const apiKey = process.env.PARADISE_API_KEY;
  const upsellUrl = process.env.PARADISE_UPSELL_URL;

  if (!apiKey) {
    sendJson(res, 500, {
      error: 'PARADISE_API_KEY não configurada no ambiente.'
    });
    return;
  }

  if (!upsellUrl) {
    sendJson(res, 500, {
      error: 'PARADISE_UPSELL_URL não configurada no ambiente.'
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
    const queryHash = encodeURIComponent(String(transactionId));
    const response = await fetch(`${PARADISE_CHECK_BASE_URL}?hash=${queryHash}`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey
      }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      sendJson(res, 502, {
        status: 'error',
        source: 'paradisepags',
        checkerVersion: 'vercel-proxy-v1',
        checkedIds: [transactionId],
        error: result.message || result.error || 'Falha ao consultar status no Paradise.',
        details: result
      });
      return;
    }

    const data = result.data || result.transaction || result;
    const rawStatus = pickFirst(data.status, data.payment_status, data.paymentStatus, data.transaction_status);
    const mappedStatus = mapStatus(rawStatus);

    if (mappedStatus === 'paid') {
      sendJson(res, 200, {
        status: 'paid',
        redirect_url: upsellUrl,
        source: 'paradisepags',
        checkerVersion: 'vercel-proxy-v1',
        checkedIds: [transactionId],
        rawStatus: rawStatus || 'paid'
      });
      return;
    }

    sendJson(res, 200, {
      status: 'pending',
      source: 'paradisepags',
      checkerVersion: 'vercel-proxy-v1',
      checkedIds: [transactionId],
      rawStatus: rawStatus || 'pending'
    });
  } catch (error) {
    sendJson(res, 500, {
      status: 'error',
      source: 'paradisepags',
      checkerVersion: 'vercel-proxy-v1',
      checkedIds: [transactionId],
      error: 'Erro interno ao consultar status no Paradise.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
