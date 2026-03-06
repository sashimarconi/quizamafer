const GHOSTS_BASE_URL = 'https://api.ghostspaysv2.com/functions/v1/transactions';

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
  if (['paid', 'pago', 'approved', 'completed', 'success', 'succeeded'].includes(normalized)) return 'paid';
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

function isLikelyBase64(str) {
  if (typeof str !== 'string') return false;
  return /^[A-Za-z0-9+/=]+$/.test(str.trim());
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

function resolveAmountInCents(data) {
  const candidates = [
    data.amount_in_cents,
    data.amount,
    data.amount_cents,
    data.amountInCents,
    data.total,
    data.total_amount,
    data.total_in_cents,
    data.total_cents,
    data.totalInCents
  ];

  for (const raw of candidates) {
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount > 0) {
      if (String(raw).includes('.') || amount < 1000) {
        return Math.round(amount * 100);
      }
      return Math.round(amount);
    }
  }

  return 0;
}

function toNullOrTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  return raw ? raw : null;
}

function parseQueryFromUrl(url) {
  if (!url || typeof url !== 'string') return {};

  try {
    const parsed = new URL(url, 'http://localhost');
    const output = {};

    ['src', 'sck', 'utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term'].forEach((key) => {
      const value = parsed.searchParams.get(key);
      if (value && String(value).trim() !== '') {
        output[key] = String(value).trim();
      }
    });

    return output;
  } catch {
    return {};
  }
}

function resolveTrackingParameters(req, body, providerData) {
  const bodyObj = body && typeof body === 'object' ? body : {};
  const providerObj = providerData && typeof providerData === 'object' ? providerData : {};
  const explicit = bodyObj.trackingParameters && typeof bodyObj.trackingParameters === 'object'
    ? bodyObj.trackingParameters
    : {};

  const providerTracking = providerObj.trackingParameters && typeof providerObj.trackingParameters === 'object'
    ? providerObj.trackingParameters
    : {};

  const fromReferer = parseQueryFromUrl(req && req.headers ? req.headers.referer : null);
  const fromUrl = parseQueryFromUrl(req && req.url ? req.url : null);

  return {
    src: toNullOrTrimmedString(pickFirst(explicit.src, providerTracking.src, bodyObj.src, fromUrl.src, fromReferer.src)),
    sck: toNullOrTrimmedString(pickFirst(explicit.sck, providerTracking.sck, bodyObj.sck, fromUrl.sck, fromReferer.sck)),
    utm_source: toNullOrTrimmedString(pickFirst(explicit.utm_source, providerTracking.utm_source, bodyObj.utm_source, fromUrl.utm_source, fromReferer.utm_source)),
    utm_campaign: toNullOrTrimmedString(pickFirst(explicit.utm_campaign, providerTracking.utm_campaign, bodyObj.utm_campaign, fromUrl.utm_campaign, fromReferer.utm_campaign)),
    utm_medium: toNullOrTrimmedString(pickFirst(explicit.utm_medium, providerTracking.utm_medium, bodyObj.utm_medium, fromUrl.utm_medium, fromReferer.utm_medium)),
    utm_content: toNullOrTrimmedString(pickFirst(explicit.utm_content, providerTracking.utm_content, bodyObj.utm_content, fromUrl.utm_content, fromReferer.utm_content)),
    utm_term: toNullOrTrimmedString(pickFirst(explicit.utm_term, providerTracking.utm_term, bodyObj.utm_term, fromUrl.utm_term, fromReferer.utm_term))
  };
}

function buildUtmifyPaidPayload(transactionId, data, context = {}) {
  const fallbackAmountRaw = Number(context.amountInCents || context.totalPriceInCents || 0);
  const fallbackAmountInCents = Number.isFinite(fallbackAmountRaw) && fallbackAmountRaw > 0
    ? Math.round(fallbackAmountRaw)
    : 0;

  const amountInCents = resolveAmountInCents(data) || fallbackAmountInCents;
  const customerData = data.customer && typeof data.customer === 'object' ? data.customer : {};
  const contextCustomer = context.customer && typeof context.customer === 'object' ? context.customer : {};

  const customer = {
    name: String(
      pickFirst(customerData.name, contextCustomer.name, data.customer_name, data.customerName, 'Cliente')
    ).trim(),
    email: String(
      pickFirst(customerData.email, contextCustomer.email, data.customer_email, data.customerEmail, 'cliente@email.com')
    ).trim(),
    phone: onlyDigits(pickFirst(customerData.phone, contextCustomer.phone, data.customer_phone, data.customerPhone)) || null,
    document: onlyDigits(
      pickFirst(customerData.document, customerData.cpf, contextCustomer.document, data.customer_document, data.document)
    ) || null,
    country: 'BR'
  };

  const productName = String(
    pickFirst(context.kitName, context.productName, data.product_name, data.productName, data.plan_name, data.planName, 'Kit AmazonBox')
  );

  return {
    orderId: String(transactionId),
    platform: String(process.env.UTMIFY_PLATFORM || 'QuizAmazon').trim() || 'QuizAmazon',
    paymentMethod: 'pix',
    status: 'paid',
    createdAt: toUtcDateTime(
      pickFirst(data.created_at, data.createdAt, data.date_created, data.dateCreated, null)
    ),
    approvedDate: toUtcDateTime(
      pickFirst(data.paid_at, data.paidAt, data.approved_at, data.approvedAt, null)
    ),
    refundedAt: null,
    customer,
    products: [
      {
        id: 'kit',
        name: productName,
        planId: 'kit',
        planName: productName,
        quantity: 1,
        priceInCents: amountInCents
      }
    ],
    trackingParameters: context.trackingParameters || {
      src: null,
      sck: null,
      utm_source: null,
      utm_campaign: null,
      utm_medium: null,
      utm_content: null,
      utm_term: null
    },
    commission: {
      totalPriceInCents: amountInCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: amountInCents
    }
  };
}

// UTMify integration removed

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

  const secretKey = String(process.env.GHOSTS_SECRET_KEY || '').trim();
  const companyId = String(process.env.GHOSTS_COMPANY_ID || '').trim();
  const upsellUrl = process.env.GHOSTS_UPSELL_URL || null;

  if (!secretKey || !companyId) {
    sendJson(res, 500, {
      error: 'GHOSTS_SECRET_KEY e GHOSTS_COMPANY_ID não configurados no ambiente.'
    });
    return;
  }

  const body = normalizeBody(req);
  let transactionId = body.transactionId || body.orderId || body.identifier;

  // If GET, allow transactionId in query string: /api/pix/check?transactionId=...
  if (req.method === 'GET' && !transactionId) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      transactionId = parsed.searchParams.get('transactionId') || parsed.searchParams.get('orderId') || parsed.searchParams.get('identifier') || transactionId;
    } catch (_) {
      // ignore
    }
  }

  if (!transactionId) {
    sendJson(res, 400, { error: 'transactionId/orderId é obrigatório.' });
    return;
  }

  try {
    const credentials = Buffer.from(`${secretKey}:${companyId}`).toString('base64');
    const idEncoded = encodeURIComponent(String(transactionId));
    const url = `${GHOSTS_BASE_URL}/${idEncoded}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });

    const text = await response.text().catch(() => '');
    let result = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = {};
    }

    if (!response.ok) {
      sendJson(res, 502, {
          status: 'error',
          source: 'ghostspays',
          checkerVersion: 'vercel-proxy-v1',
          checkedIds: [transactionId],
          providerStatus: response.status,
          error: result && (result.message || result.error) ? (result.message || result.error) : 'Falha ao consultar status no GhostsPay.',
          details: result,
          providerRaw: typeof text === 'string' ? text.slice(0, 2000) : null
        });
      return;
    }

    const data = result.data || result.transaction || result;
    const rawStatus = pickFirst(data.status, data.payment_status, data.paymentStatus, data.transaction_status);
    const mappedStatus = mapStatus(rawStatus);

    const transactionId = String(
      pickFirst(
        data.id,
        data.uuid,
        data.external_id,
        data.externalId,
        data.hash,
        data.transaction_id,
        data.transactionId
      ) || transactionId || ''
    );

    const qrCodeText = pickFirst(
      data.pix && data.pix.code,
      data.pix && data.pix.qrcode,
      data.pixCode,
      data.pix_code,
      data.qrCode,
      data.qr_code,
      data.copyPaste,
      data.copy_paste,
      data.emv
    );

    const qrCodeImageRaw = pickFirst(
      data.pix && (data.pix.qrImage || data.pix.image || data.pix.base64),
      data.qrCodeBase64,
      data.qr_code_base64,
      data.qrImage,
      data.qr_image,
      data.pixQrCodeBase64,
      data.pix_qr_code_base64
    );

    let qrCodeImage = null;
    if (typeof qrCodeImageRaw === 'string') {
      if (qrCodeImageRaw.startsWith('data:image')) {
        qrCodeImage = qrCodeImageRaw;
      } else if (qrCodeImageRaw.startsWith('http://') || qrCodeImageRaw.startsWith('https://')) {
        qrCodeImage = qrCodeImageRaw;
      } else if (isLikelyBase64(qrCodeImageRaw)) {
        qrCodeImage = `data:image/png;base64,${qrCodeImageRaw}`;
      } else {
        qrCodeImage = null;
      }
    }

    // fallback: if we only have the EMV/copy-paste code (qrCodeText), generate QR image URL
    if (!qrCodeImage && qrCodeText && typeof qrCodeText === 'string') {
      try {
        const emv = qrCodeText.trim();
        if (emv.length > 0) {
          qrCodeImage = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(emv)}`;
        }
      } catch (e) {
        // ignore
      }
    }
    const bodyAmountRaw = Number(body.totalPriceInCents || body.amountInCents || body.amount || 0);
    const bodyAmountInCents = Number.isFinite(bodyAmountRaw) && bodyAmountRaw > 0
      ? Math.round(bodyAmountRaw)
      : 0;
    const trackingParameters = resolveTrackingParameters(req, body, data);
    const context = {
      amountInCents: bodyAmountInCents,
      trackingParameters,
      kitName: body.kitName || body.productName || null,
      customer: body.customer && typeof body.customer === 'object' ? body.customer : null
    };

    const baseResponse = {
      status: mappedStatus,
      source: 'ghostspays',
      checkerVersion: 'vercel-proxy-v1',
      checkedIds: [transactionId],
      rawStatus: rawStatus || mappedStatus
    };

    if (qrCodeText) {
      baseResponse.pix = {
        code: qrCodeText,
        image: qrCodeImage,
        base64: qrCodeImageRaw || null,
        expiresAt: pickFirst(data.expiresAt, data.expires_at) || null
      };

      // convenience fields for legacy/minified frontend
      baseResponse.qrCode = qrCodeImage;
      baseResponse.pixCopyPaste = qrCodeText;
      baseResponse.qrCodeImageUrl = qrCodeImage;
      baseResponse._rawProviderResponseText = text ? String(text).slice(0, 2000) : null;
      baseResponse._providerResponse = result || null;
    }

    if (mappedStatus === 'paid') {
      baseResponse.redirect_url = upsellUrl || null;
      sendJson(res, 200, baseResponse);
      return;
    }

    sendJson(res, 200, baseResponse);
  } catch (error) {
    sendJson(res, 500, {
      status: 'error',
      source: 'ghostspays',
      checkerVersion: 'vercel-proxy-v1',
      checkedIds: [transactionId],
      error: 'Erro interno ao consultar status no GhostsPay.',
      details: error instanceof Error ? (error.message + " | " + (error.stack || '')) : String(error)
    });
  }
};
