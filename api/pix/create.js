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

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
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
  const amount = Number(body.amount || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    sendJson(res, 400, { error: 'Valor inválido para criação do PIX.' });
    return;
  }

  const customer = body.customer || {};
  const metadata = body.metadata || {};
  const documentNumber = onlyDigits(customer.document);
  const documentType = documentNumber.length > 11 ? 'cnpj' : 'cpf';

  const amountInCents = Math.round(amount * 100);

  const itemTitle = metadata.shippingName
    ? `Frete ${metadata.shippingName}`
    : metadata.type === 'freight'
      ? 'Pagamento de Frete'
      : 'Pedido Amazon Open Now';

  const payload = {
    amount: amountInCents,
    currency: 'BRL',
    paymentMethod: 'pix',
    items: [
      {
        title: itemTitle,
        unitPrice: amountInCents,
        quantity: 1,
        tangible: false
      }
    ],
    customer: {
      name: String(customer.name || '').trim(),
      email: String(customer.email || '').trim(),
      phone: onlyDigits(customer.phone),
      document: {
        number: documentNumber,
        type: documentType
      }
    },
    pix: {
      expiresInDays: 1
    },
    metadata: JSON.stringify({
      source: 'amazon-open-now',
      originalMetadata: metadata
    }),
    externalRef: `${metadata.type || 'order'}-${Date.now()}`
  };

  try {
    const response = await fetch(`${BLACKCAT_BASE_URL}/sales/create-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.data) {
      sendJson(res, 502, {
        error: result.message || result.error || 'Falha ao criar venda no BlackCatPay.',
        details: result
      });
      return;
    }

    const data = result.data;
    const paymentData = data.paymentData || {};

    const qrCode =
      typeof paymentData.qrCodeBase64 === 'string' && paymentData.qrCodeBase64.startsWith('data:image')
        ? paymentData.qrCodeBase64
        : typeof paymentData.qrCodeBase64 === 'string' && paymentData.qrCodeBase64.length > 0
          ? `data:image/png;base64,${paymentData.qrCodeBase64}`
          : null;

    const copyPaste = paymentData.copyPaste || paymentData.qrCode || null;
    const transactionId = data.transactionId;

    sendJson(res, 200, {
      transactionId,
      status: data.status,
      order: {
        id: transactionId
      },
      pix: {
        code: copyPaste,
        image: qrCode,
        base64: paymentData.qrCodeBase64 || null,
        expiresAt: paymentData.expiresAt || null
      },
      _identifiers: {
        identifier: transactionId
      },
      _provider: {
        name: 'blackcatpay',
        invoiceUrl: data.invoiceUrl || null
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Erro interno ao criar PIX no BlackCatPay.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
