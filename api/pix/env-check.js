module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const secret = process.env.GHOSTS_SECRET_KEY || '';
  const company = process.env.GHOSTS_COMPANY_ID || '';

  // return only presence and masked length, never the value
  const mask = (v) => (v && String(v).length ? `${String(v).length} chars` : null);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    hasSecretKey: !!secret,
    hasCompanyId: !!company,
    secretMask: mask(secret),
    companyIdMask: mask(company)
  }));
};
