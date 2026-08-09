module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const inputCode = req.query.code ? String(req.query.code).trim() : '';
  const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '');

  if (!cleanInput) {
    return res.status(400).json({ error: "Voucher code is required" });
  }

  const OMADA_URL = (process.env.OMADA_URL || "https://aps1-omada-cloud.tplinkcloud.com").trim().replace(/\/+$/, '');
  const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
  const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
  const SITE_ID = (process.env.SITE_ID || "6a615c90e78f4e28047ab010").trim();
  const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

  try {
    // 1. Get Access Token
    const authUrl = `${OMADA_URL}/openapi/authorize/token?grant_type=client_credentials`;
    const tokenRes = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        omadaClientId: CLIENT_ID,
        omadaClientSecret: CLIENT_SECRET
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData?.result?.accessToken) {
      return res.status(200).json({ found: false, error: "Auth failed", details: tokenData });
    }

    const token = tokenData.result.accessToken;

    // 2. Fetch Vouchers Across Multiple Pages
    let allVouchers = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const voucherUrl = `${OMADA_URL}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers?page=${currentPage}&pageSize=100`;
      const voucherRes = await fetch(voucherUrl, {
        method: 'GET',
        headers: { 'AccessToken': token, 'Content-Type': 'application/json' }
      });

      const voucherData = await voucherRes.json();

      if (voucherData.errorCode === 0 && voucherData.result?.data) {
        allVouchers = allVouchers.concat(voucherData.result.data);
        totalPages = voucherData.result.totalRows ? Math.ceil(voucherData.result.totalRows / 100) : 1;
      } else {
        break;
      }
      currentPage++;
    } while (currentPage <= totalPages && currentPage <= 10);

    // Find Voucher
    const match = allVouchers.find(v => {
      const vCodeClean = String(v.code || '').trim().replace(/[^a-zA-Z0-9]/g, '');
      return vCodeClean === cleanInput;
    });

    if (match) {
      return res.json({
        found: true,
        code: match.code,
        status: match.status === 1 ? 'ACTIVE' : (match.status === 2 ? 'EXPIRED' : 'UNUSED'),
        timeRemaining: match.duration ? `${match.duration} Mins` : 'N/A',
        dataLimit: match.trafficLimit ? `${match.trafficLimit} MB` : 'Unlimited',
        firstUsed: match.startTime ? new Date(match.startTime).toLocaleString() : 'Not Yet Used'
      });
    }

    // 3. Fallback: Search Active Connected Clients (for currently authorized devices)
    const clientsUrl = `${OMADA_URL}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/clients?page=1&pageSize=100`;
    const clientsRes = await fetch(clientsUrl, {
      method: 'GET',
      headers: { 'AccessToken': token, 'Content-Type': 'application/json' }
    });

    const clientsData = await clientsRes.json();
    if (clientsData.errorCode === 0 && clientsData.result?.data) {
      const clientMatch = clientsData.result.data.find(c => {
        const authType = String(c.authType || c.authMethod || '');
        return authType.includes(cleanInput) || String(c.voucherCode || '').includes(cleanInput);
      });

      if (clientMatch) {
        return res.json({
          found: true,
          code: cleanInput,
          status: 'ACTIVE',
          timeRemaining: 'Connected Client',
          dataLimit: 'Unlimited',
          firstUsed: 'Currently Active'
        });
      }
    }

    return res.json({ found: false, totalScanned: allVouchers.length });

  } catch (err) {
    return res.status(500).json({ found: false, error: err.message });
  }
};
