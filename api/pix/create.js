const GHOSTS_CREATE_URL = 'https://api.ghostspaysv2.com/functions/v1/transactions';
const DEFAULT_PRODUCT_HASH = 'prod_bc6860b7c055edfe';

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function generateValidCpf() {
  const digits = [];

  for (let index = 0; index < 9; index += 1) {
    digits.push(randomInt(0, 9));
  }

  const firstVerifierSum = digits.reduce((total, digit, index) => total + digit * (10 - index), 0);
  const firstVerifierRemainder = firstVerifierSum % 11;
  const firstVerifier = firstVerifierRemainder < 2 ? 0 : 11 - firstVerifierRemainder;
  digits.push(firstVerifier);

  const secondVerifierSum = digits.reduce((total, digit, index) => total + digit * (11 - index), 0);
  const secondVerifierRemainder = secondVerifierSum % 11;
  const secondVerifier = secondVerifierRemainder < 2 ? 0 : 11 - secondVerifierRemainder;
  digits.push(secondVerifier);

  return digits.join('');
}

function generateRandomCustomer() {
  const now = Date.now();
  const customerNumber = randomInt(1000, 9999);
  const phone = `11${randomInt(900000000, 999999999)}`;

  return {
    name: `Cliente ${customerNumber}`,
    email: `cliente_${now}_${customerNumber}@email.com`,
    document: generateValidCpf(),
    phone
  };
}

function resolveCustomer(inputCustomer) {
  const fallback = generateRandomCustomer();
  const customer = inputCustomer && typeof inputCustomer === 'object' ? inputCustomer : {};

  const name = String(customer.name || '').trim();
  const email = String(customer.email || '').trim();
  const document = onlyDigits(customer.document);
  const phone = onlyDigits(customer.phone);

  return {
    name: name || fallback.name,
    email: email || fallback.email,
    document: document.length === 11 ? document : fallback.document,
    phone: phone.length >= 10 ? phone : fallback.phone
  };
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
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

function toNullOrTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  return raw ? raw : null;
}

function resolveTrackingParameters(req, body) {
  const fromBody = body && typeof body === 'object' ? body : {};
  const explicit = fromBody.trackingParameters && typeof fromBody.trackingParameters === 'object'
    ? fromBody.trackingParameters
    : {};

  const fromReferer = parseQueryFromUrl(req && req.headers ? req.headers.referer : null);
  const fromUrl = parseQueryFromUrl(req && req.url ? req.url : null);

  const resolved = {
    src: toNullOrTrimmedString(pickFirst(explicit.src, fromBody.src, fromUrl.src, fromReferer.src)),
    sck: toNullOrTrimmedString(pickFirst(explicit.sck, fromBody.sck, fromUrl.sck, fromReferer.sck)),
    utm_source: toNullOrTrimmedString(pickFirst(explicit.utm_source, fromBody.utm_source, fromUrl.utm_source, fromReferer.utm_source)),
    utm_campaign: toNullOrTrimmedString(pickFirst(explicit.utm_campaign, fromBody.utm_campaign, fromUrl.utm_campaign, fromReferer.utm_campaign)),
    utm_medium: toNullOrTrimmedString(pickFirst(explicit.utm_medium, fromBody.utm_medium, fromUrl.utm_medium, fromReferer.utm_medium)),
    utm_content: toNullOrTrimmedString(pickFirst(explicit.utm_content, fromBody.utm_content, fromUrl.utm_content, fromReferer.utm_content)),
    utm_term: toNullOrTrimmedString(pickFirst(explicit.utm_term, fromBody.utm_term, fromUrl.utm_term, fromReferer.utm_term))
  };

  return resolved;
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

function buildUtmifyWaitingPayload(transactionId, body, amountInCents, trackingParameters) {
  const customerInput = body && body.customer && typeof body.customer === 'object' ? body.customer : {};
  const customer = {
    name: String(pickFirst(customerInput.name, body.customer_name, 'Cliente')).trim(),
    email: String(pickFirst(customerInput.email, body.customer_email, 'cliente@email.com')).trim(),
    phone: onlyDigits(pickFirst(customerInput.phone, body.customer_phone)) || null,
    document: onlyDigits(pickFirst(customerInput.document, customerInput.cpf, body.customer_document)) || null,
    country: 'BR'
  };

  const productName = String(
    pickFirst(
      body.kitName,
      body.productName,
      body.product_name,
      body.metadata && body.metadata.kitName,
      'Kit AmazonBox'
    )
  );

  return {
    orderId: String(transactionId),
    platform: String(process.env.UTMIFY_PLATFORM || 'QuizAmazon').trim() || 'QuizAmazon',
    paymentMethod: 'pix',
    status: 'waiting_payment',
    createdAt: toUtcDateTime(null),
    approvedDate: null,
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
    trackingParameters,
    commission: {
      totalPriceInCents: amountInCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: amountInCents
    }
  };
}

// UTMify integration removed

function parseProductsMap(rawValue) {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const normalized = {};
    Object.entries(parsed).forEach(([key, value]) => {
      normalized[String(key).toLowerCase()] = value;
    });
    return normalized;
  } catch {
    return {};
  }
}

function normalizeProductConfig(value) {
  if (!value || typeof value !== 'object') return null;

  const hash = pickFirst(value.hash, value.productHash, value.product_hash);
  const amountRaw = pickFirst(value.amountCents, value.amount_cents, value.amount);
  const amount = Number(amountRaw || 0);

  if (!hash) {
    return null;
  }

  const amountCents = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;

  return {
    productHash: String(hash).trim(),
    amountCents
  };
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parsePriceTable(rawValue) {
  const defaults = {
    kits: {
      bronze: 2000,
      prata: 4000,
      ouro: 6000
    },
    bumps: {
      premium: 990,
      dobro: 1990,
      apple: 2990
    },
    freight: {
      pac: 1390,
      sedex: 1590,
      express: 2590
    }
  };

  if (!rawValue) return defaults;

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const merged = {
      kits: { ...defaults.kits },
      bumps: { ...defaults.bumps },
      freight: { ...defaults.freight }
    };

    ['kits', 'bumps', 'freight'].forEach((group) => {
      const source = parsed[group];
      if (!source || typeof source !== 'object' || Array.isArray(source)) return;

      Object.entries(source).forEach(([key, value]) => {
        const normalizedGroupKey = normalizeKey(key);
        const cents = Number(value);
        if (!normalizedGroupKey || !Number.isFinite(cents) || cents <= 0) return;
        merged[group][normalizedGroupKey] = Math.round(cents);
      });
    });

    return merged;
  } catch {
    return defaults;
  }
}

function resolveAmountFromMetadata(metadata, priceTable) {
  const paymentType = normalizeKey(metadata.type || '');

  if (paymentType === 'kit') {
    const kitId = normalizeKey(metadata.kitId || '');
    const base = priceTable.kits[kitId];
    if (!Number.isFinite(base) || base <= 0) return null;

    const selectedBumps = Array.isArray(metadata.selectedBumps) ? metadata.selectedBumps : [];
    const bumpSum = selectedBumps
      .map((item) => priceTable.bumps[normalizeKey(item)])
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((total, value) => total + value, 0);

    return base + bumpSum;
  }

  if (paymentType === 'freight') {
    const shippingId = normalizeKey(metadata.shippingId || '');
    const shippingName = normalizeKey(metadata.shippingName || '');
    const freight =
      priceTable.freight[shippingId] ||
      priceTable.freight[shippingName] ||
      null;

    return Number.isFinite(freight) && freight > 0 ? freight : null;
  }

  return null;
}

function buildProductKeys(metadata, body) {
  const keys = [];
  const paymentType = normalizeKey(metadata.type || body.type || body.productKey || 'default');
  const productKey = normalizeKey(body.productKey || metadata.productKey || '');
  const kitId = normalizeKey(metadata.kitId || body.kitId || '');
  const shippingId = normalizeKey(metadata.shippingId || '');
  const shippingName = normalizeKey(metadata.shippingName || '');
  const selectedBumps = Array.isArray(metadata.selectedBumps)
    ? metadata.selectedBumps.map((item) => normalizeKey(item)).filter(Boolean).sort()
    : [];

  if (productKey) keys.push(productKey);

  if (paymentType === 'kit') {
    if (kitId && selectedBumps.length) {
      keys.push(`kit:${kitId}:bumps:${selectedBumps.join('+')}`);
    }
    if (kitId) keys.push(`kit:${kitId}`);
    keys.push('kit');
  }

  if (paymentType === 'freight') {
    if (shippingId) keys.push(`freight:${shippingId}`);
    if (shippingName) keys.push(`freight:${shippingName}`);
    keys.push('freight');
  }

  if (paymentType) keys.push(paymentType);
  keys.push('default');

  return Array.from(new Set(keys.map((item) => item.toLowerCase()).filter(Boolean)));
}

function resolveProductConfig(productsMap, keyCandidates) {
  for (const key of keyCandidates) {
    const config = normalizeProductConfig(productsMap[key]);
    if (config) {
      return {
        key,
        config
      };
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

  const secretKey = String(process.env.GHOSTS_SECRET_KEY || '').trim();
  const companyId = String(process.env.GHOSTS_COMPANY_ID || '').trim();
  const upsellUrl = process.env.GHOSTS_UPSELL_URL || null;
  const productsMap = parseProductsMap(process.env.GHOSTS_PRODUCTS_JSON);
  const priceTable = parsePriceTable(process.env.GHOSTS_PRICE_TABLE_JSON);

  if (!secretKey || !companyId) {
    sendJson(res, 500, {
      error: 'GHOSTS_SECRET_KEY e GHOSTS_COMPANY_ID não configurados no ambiente.'
    });
    return;
  }

  const body = normalizeBody(req);
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const productKeyCandidates = buildProductKeys(metadata, body);
  const matchedProduct = resolveProductConfig(productsMap, productKeyCandidates);
  const explicitProductHash = pickFirst(body.productHash, metadata.productHash);

  const envSingleProductHash = pickFirst(
    process.env.GHOSTS_PRODUCT_HASH,
    process.env.GHOSTS_DEFAULT_PRODUCT_HASH
  );
  const envSingleAmount = Number(
    pickFirst(process.env.GHOSTS_AMOUNT_CENTS, process.env.GHOSTS_DEFAULT_AMOUNT_CENTS) || 0
  );

  const fallbackSingleConfig =
    Number.isFinite(envSingleAmount) && envSingleAmount > 0
      ? {
          productHash: envSingleProductHash ? String(envSingleProductHash).trim() : null,
          amountCents: Math.round(envSingleAmount)
        }
      : null;

  const resolvedAmountFromMetadata = resolveAmountFromMetadata(metadata, priceTable);
  const amountFromFrontend = Number(body.amount || 0);

  const amountInCents =
    Number.isFinite(resolvedAmountFromMetadata) && resolvedAmountFromMetadata > 0
      ? Math.round(resolvedAmountFromMetadata)
      : matchedProduct && Number.isFinite(matchedProduct.config.amountCents)
        ? Math.round(matchedProduct.config.amountCents)
        : fallbackSingleConfig && Number.isFinite(fallbackSingleConfig.amountCents)
          ? Math.round(fallbackSingleConfig.amountCents)
          : Number.isFinite(amountFromFrontend) && amountFromFrontend > 0
            ? Math.round(amountFromFrontend * 100)
            : 0;

  const productHash =
    explicitProductHash ||
    matchedProduct?.config.productHash ||
    (envSingleProductHash
      ? String(envSingleProductHash).trim()
      : DEFAULT_PRODUCT_HASH);

  if (!amountInCents || amountInCents <= 0) {
    sendJson(res, 500, {
      error:
        'Configure GHOSTS_PRICE_TABLE_JSON (recomendado) ou defina amountCents no GHOSTS_PRODUCTS_JSON / GHOSTS_AMOUNT_CENTS.'
    });
    return;
  }

  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    sendJson(res, 400, { error: 'Valor inválido para criação do PIX.' });
    return;
  }

  const resolvedCustomer = resolveCustomer(body.customer);
  const trackingParameters = resolveTrackingParameters(req, body);

  const payload = {
    amount: amountInCents,
    customer: {
      name: resolvedCustomer.name,
      email: resolvedCustomer.email,
      document: resolvedCustomer.document,
      phone: resolvedCustomer.phone
    }
  };

  if (productHash) {
    payload.productHash = String(productHash).trim();
  }

  try {
    const credentials = Buffer.from(`${secretKey}:${companyId}`).toString('base64');
    const usedUrl = GHOSTS_CREATE_URL;

    const response = await fetch(usedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify({
        amount: amountInCents,
        items: [
          {
            title: String(pickFirst(body.kitName, body.productName, body.product_name, 'Kit AmazonBox')),
            unitPrice: amountInCents,
            quantity: 1,
            externalRef: String(productHash || 'kit')
          }
        ],
        paymentMethod: 'PIX',
        customer: payload.customer,
        metadata: {
          ...(body.metadata || {}),
          trackingParameters
        },
        postbackUrl: body.postbackUrl || null,
        description: body.description || null
      })
    });

    let result = {};
    const rawText = await response.text().catch(() => '');
    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch {
      result = {};
    }

    if (!response.ok) {
      sendJson(res, 502, {
        error: result.message || result.error || 'Falha ao criar transação no GhostsPay.',
        providerStatus: response.status,
        providerUrl: usedUrl,
        details: result,
        providerRaw: rawText ? String(rawText).slice(0, 800) : null
      });
      return;
    }

    const tx = result.data || result.transaction || result;

    const transactionId = String(
      pickFirst(
        tx.id,
        tx.uuid,
        tx.external_id,
        tx.externalId,
        tx.hash,
        tx.transaction_id,
        tx.transactionId
      ) || ''
    );

    const qrCodeText = pickFirst(
      tx.pix && tx.pix.code,
      tx.pixCode,
      tx.pix_code,
      tx.qrCode,
      tx.qr_code,
      tx.copyPaste,
      tx.copy_paste,
      tx.emv
    );

    const qrCodeImageRaw = pickFirst(
      tx.pix && (tx.pix.qrImage || tx.pix.image || tx.pix.base64),
      tx.qrCodeBase64,
      tx.qr_code_base64,
      tx.qrImage,
      tx.qr_image,
      tx.pixQrCodeBase64,
      tx.pix_qr_code_base64
    );

    const qrCodeImage =
      typeof qrCodeImageRaw === 'string' && qrCodeImageRaw.startsWith('data:image')
        ? qrCodeImageRaw
        : typeof qrCodeImageRaw === 'string' && qrCodeImageRaw.length > 0
          ? `data:image/png;base64,${qrCodeImageRaw}`
          : null;

    const rawStatus = String(pickFirst(tx.status, tx.payment_status, tx.paymentStatus) || 'pending').toLowerCase();

    if (!transactionId) {
      sendJson(res, 502, {
        error: 'Resposta do GhostsPay não trouxe transactionId.',
        details: result
      });
      return;
    }

    // GhostsPay may create the transaction first and generate PIX/QR later.
    // If no QR/code is present, return the minimal info so frontend can poll `/api/pix/check`.
    if (!qrCodeText) {
      sendJson(res, 200, {
        transactionId,
        status: rawStatus,
        order: { id: transactionId },
        pix: null,
        _provider: {
          name: 'ghostspays',
          providerUrl: usedUrl,
          productKey: matchedProduct?.key || 'fallback'
        },
        _rawProviderResponse: result
      });
      return;
    }

    sendJson(res, 200, {
      transactionId,
      status: rawStatus,
      order: {
        id: transactionId
      },
      pix: {
        code: qrCodeText,
        image: qrCodeImage,
        base64: qrCodeImageRaw || null,
        expiresAt: pickFirst(tx.expiresAt, tx.expires_at) || null
      },
      _identifiers: {
        identifier: transactionId
      },
      _provider: {
        name: 'ghostspays',
        redirectConfigured: Boolean(upsellUrl),
        productKey: matchedProduct?.key || 'fallback',
        hashMode: productHash ? 'provided' : 'not_provided',
        providerUrl: usedUrl
      },
      // utmify removed
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Erro interno ao criar PIX no GhostsPay.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
