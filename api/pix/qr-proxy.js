const QR_SERVER = 'https://api.qrserver.com/v1/create-qr-code/';

function sendImage(res, status, buffer, contentType) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(buffer);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  const url = req.url || '';
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const emv = parsed.searchParams.get('emv');
    const src = parsed.searchParams.get('src');

    if (emv) {
      const qrUrl = `${QR_SERVER}?size=400x400&data=${encodeURIComponent(emv)}`;
      const resp = await fetch(qrUrl);
      if (!resp.ok) {
        res.statusCode = 502;
        res.end('Failed to fetch QR image');
        return;
      }
      const buffer = await resp.arrayBuffer();
      const contentType = resp.headers.get('content-type') || 'image/png';
      sendImage(res, 200, Buffer.from(buffer), contentType);
      return;
    }

    if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
      // proxy arbitrary image URL (basic safety: only http(s))
      const resp = await fetch(src, { redirect: 'follow' });
      if (!resp.ok) {
        res.statusCode = 502;
        res.end('Failed to fetch image');
        return;
      }
      const buffer = await resp.arrayBuffer();
      const contentType = resp.headers.get('content-type') || 'image/png';
      sendImage(res, 200, Buffer.from(buffer), contentType);
      return;
    }

    res.statusCode = 400;
    res.end('Missing emv or src parameter');
  } catch (err) {
    res.statusCode = 500;
    res.end('Internal error');
  }
};
