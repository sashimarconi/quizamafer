const PARADISE_CREATE_URL = 'https://multi.paradisepags.com/api/v1/transaction';

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

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function parseProductsMap(rawValue) {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function normalizeProductConfig(value) {
  if (!value || typeof value !== 'object') return null;

  const hash = pickFirst(value.hash, value.productHash, value.product_hash);
  const amountRaw = pickFirst(value.amountCents, value.amount_cents, value.amount);
  const amount = Number(amountRaw || 0);

  if (!hash || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    productHash: String(hash).trim(),
    amountCents: Math.round(amount)
  };
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
  const productsMap = parseProductsMap(process.env.PARADISE_PRODUCTS_JSON);

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
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const requestedKey = String(
    pickFirst(body.productKey, metadata.productKey, metadata.type, body.type, 'default')
  ).trim();

  const selectedMapConfig = normalizeProductConfig(productsMap[requestedKey]);
  const defaultMapConfig = normalizeProductConfig(productsMap.default);

  const envSingleProductHash = pickFirst(
    process.env.PARADISE_PRODUCT_HASH,
    process.env.PARADISE_DEFAULT_PRODUCT_HASH
  );
  const envSingleAmount = Number(
    pickFirst(process.env.PARADISE_AMOUNT_CENTS, process.env.PARADISE_DEFAULT_AMOUNT_CENTS) || 0
  );

  const fallbackSingleConfig =
    envSingleProductHash && Number.isFinite(envSingleAmount) && envSingleAmount > 0
      ? {
          productHash: String(envSingleProductHash).trim(),
          amountCents: Math.round(envSingleAmount)
        }
      : null;

  const effectiveConfig = selectedMapConfig || defaultMapConfig || fallbackSingleConfig;

  if (!effectiveConfig) {
    sendJson(res, 500, {
      error:
        'Configure PARADISE_PRODUCTS_JSON (recomendado) ou PARADISE_PRODUCT_HASH + PARADISE_AMOUNT_CENTS.'
    });
    return;
  }

  const amountInCents = effectiveConfig.amountCents;
  const productHash = effectiveConfig.productHash;

  if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
    sendJson(res, 400, { error: 'Valor inválido para criação do PIX.' });
    return;
  }

  const randomCustomer = generateRandomCustomer();

  const payload = {
    amount: amountInCents,
    productHash,
    customer: {
      name: randomCustomer.name,
      email: randomCustomer.email,
      document: randomCustomer.document,
      phone: randomCustomer.phone
    }
  };

  try {
    const response = await fetch(PARADISE_CREATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      sendJson(res, 502, {
        error: result.message || result.error || 'Falha ao criar transação no Paradise.',
        details: result
      });
      return;
    }

    const tx = result.data || result.transaction || result;

    const transactionId = String(
      pickFirst(
        tx.external_id,
        tx.externalId,
        tx.hash,
        tx.id,
        tx.transaction_id,
        tx.transactionId
      ) || ''
    );

    const qrCodeText = pickFirst(
      tx.pixCode,
      tx.pix_code,
      tx.qrCode,
      tx.qr_code,
      tx.copyPaste,
      tx.copy_paste,
      tx.emv
    );

    const qrCodeImageRaw = pickFirst(
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

    if (!transactionId || !qrCodeText) {
      sendJson(res, 502, {
        error: 'Resposta da Paradise não trouxe dados mínimos do PIX.',
        details: result
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
        name: 'paradisepags',
        redirectConfigured: Boolean(upsellUrl),
        productKey: requestedKey
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Erro interno ao criar PIX no Paradise.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
