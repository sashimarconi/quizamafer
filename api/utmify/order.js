const UTMIFY_ORDERS_URL = 'https://api.utmify.com.br/api-credentials/orders';

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

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function toUtcDateTime(input) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    return toUtcDateTime(null);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeStatus(status) {
  const raw = String(status || '').trim().toLowerCase();

  if (['waiting_payment', 'paid', 'refused', 'refunded', 'chargedback'].includes(raw)) {
    return raw;
  }

  if (['pending', 'waiting', 'created'].includes(raw)) {
    return 'waiting_payment';
  }

  if (['approved', 'completed', 'complete', 'ok', 'success'].includes(raw)) {
    return 'paid';
  }

  return 'waiting_payment';
}

function normalizePaymentMethod(method) {
  const raw = String(method || '').trim().toLowerCase();
  if (['credit_card', 'boleto', 'pix', 'paypal', 'free_price'].includes(raw)) {
    return raw;
  }
  return 'pix';
}

function normalizeCustomer(inputCustomer) {
  const customer = inputCustomer && typeof inputCustomer === 'object' ? inputCustomer : {};
  const name = String(customer.name || 'Cliente').trim() || 'Cliente';
  const email = String(customer.email || 'cliente@email.com').trim() || 'cliente@email.com';
  const phone = onlyDigits(customer.phone);
  const document = onlyDigits(customer.document);
  const country = String(customer.country || '').trim().toUpperCase();
  const ip = String(customer.ip || '').trim();

  return {
    name,
    email,
    phone: phone || null,
    document: document || null,
    country: country || undefined,
    ip: ip || undefined
  };
}

function normalizeTrackingParameters(inputTracking) {
  const tracking = inputTracking && typeof inputTracking === 'object' ? inputTracking : {};

  function nullOrString(value) {
    const raw = value === undefined || value === null ? '' : String(value).trim();
    return raw ? raw : null;
  }

  return {
    src: nullOrString(tracking.src),
    sck: nullOrString(tracking.sck),
    utm_source: nullOrString(tracking.utm_source),
    utm_campaign: nullOrString(tracking.utm_campaign),
    utm_medium: nullOrString(tracking.utm_medium),
    utm_content: nullOrString(tracking.utm_content),
    utm_term: nullOrString(tracking.utm_term)
  };
}

function normalizeProducts(inputProducts, totalPriceInCents) {
  if (Array.isArray(inputProducts) && inputProducts.length > 0) {
    return inputProducts.map((item, index) => {
      const product = item && typeof item === 'object' ? item : {};
      const quantityRaw = Number(product.quantity || 1);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.round(quantityRaw) : 1;
      const priceRaw = Number(product.priceInCents || 0);
      const priceInCents = Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw) : 0;

      return {
        id: String(product.id || `product-${index + 1}`),
        name: String(product.name || `Produto ${index + 1}`),
        planId: product.planId == null ? null : String(product.planId),
        planName: product.planName == null ? null : String(product.planName),
        quantity,
        priceInCents
      };
    });
  }

  return [
    {
      id: 'kit',
      name: 'Kit AmazonBox',
      planId: 'kit',
      planName: 'Kit',
      quantity: 1,
      priceInCents: totalPriceInCents
    }
  ];
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    return;
  }

  const apiToken = String(process.env.UTMIFY_API_TOKEN || '').trim();
  const platform = String(process.env.UTMIFY_PLATFORM || 'QuizAmazon').trim() || 'QuizAmazon';
  const forceTestMode = String(process.env.UTMIFY_IS_TEST || '').trim().toLowerCase() === 'true';

  if (!apiToken) {
    sendJson(res, 500, {
      success: false,
      error: 'UTMIFY_API_TOKEN não configurada no ambiente.'
    });
    return;
  }

  const body = normalizeBody(req);

  const status = normalizeStatus(body.status);
  const paymentMethod = normalizePaymentMethod(body.paymentMethod || 'pix');
  const orderId = String(body.orderId || body.transactionId || body.identifier || '').trim();
  const totalPriceRaw = Number(body.totalPriceInCents || body.amountInCents || body.amount || 0);
  const totalPriceInCents = Number.isFinite(totalPriceRaw) && totalPriceRaw > 0
    ? Math.round(totalPriceRaw)
    : 0;

  if (!orderId) {
    sendJson(res, 400, {
      success: false,
      error: 'orderId é obrigatório para enviar pedido à UTMify.'
    });
    return;
  }

  if (!Number.isFinite(totalPriceInCents) || totalPriceInCents <= 0) {
    sendJson(res, 400, {
      success: false,
      error: 'totalPriceInCents inválido para envio à UTMify.'
    });
    return;
  }

  const gatewayFeeRaw = Number(body.gatewayFeeInCents || 0);
  const gatewayFeeInCents = Number.isFinite(gatewayFeeRaw) && gatewayFeeRaw >= 0
    ? Math.round(gatewayFeeRaw)
    : 0;

  const userCommissionRaw = Number(body.userCommissionInCents);
  const userCommissionInCents = Number.isFinite(userCommissionRaw)
    ? Math.round(userCommissionRaw)
    : Math.max(totalPriceInCents - gatewayFeeInCents, 0);

  const createdAt = toUtcDateTime(body.createdAt || body.approvedDate || null);
  const approvedDate = status === 'paid'
    ? toUtcDateTime(body.approvedDate || body.createdAt || null)
    : null;
  const refundedAt = status === 'refunded' || status === 'chargedback'
    ? toUtcDateTime(body.refundedAt || null)
    : null;

  const payload = {
    orderId,
    platform,
    paymentMethod,
    status,
    createdAt,
    approvedDate,
    refundedAt,
    customer: normalizeCustomer(body.customer),
    products: normalizeProducts(body.products, totalPriceInCents),
    trackingParameters: normalizeTrackingParameters(body.trackingParameters),
    commission: {
      totalPriceInCents,
      gatewayFeeInCents,
      userCommissionInCents
    }
  };

  if (body.currency && ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CAD', 'COP', 'MXN', 'PYG', 'CLP', 'PEN', 'PLN'].includes(String(body.currency).toUpperCase())) {
    payload.commission.currency = String(body.currency).toUpperCase();
  }

  if (forceTestMode || body.isTest === true) {
    payload.isTest = true;
  }

  try {
    const response = await fetch(UTMIFY_ORDERS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': apiToken
      },
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    let parsed = null;

    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      sendJson(res, 502, {
        success: false,
        error: 'Falha no envio para UTMify.',
        providerStatus: response.status,
        details: parsed || rawText || null
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      orderId,
      status,
      providerStatus: response.status,
      providerResponse: parsed || rawText || null
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: 'Erro interno ao enviar pedido para UTMify.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
