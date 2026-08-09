module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const inputCode = req.query.code ? String(req.query.code).trim() : '';
  const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '');

  if (!cleanInput) {
    return res.status(400).json({ error: "Voucher code is required" });
  }

  // Tiyaking malinis ang values
  const OMADA_URL = (process.env.OMADA_URL || "https://aps1-omada-cloud.tplinkcloud.com").trim().replace(/\/+$/, '');
  const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
  const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
  const SITE_ID = (process.env.SITE_ID || "6a615c91e78f4e28047ab01e").trim();
  const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

  try {
    // 1. Get Access Token gamit ang Modern WHATWG URL API
    const authUrl = new URL('/openapi/authorize/token', OMADA_URL);
    authUrl.searchParams.append('grant_type', 'client_credentials');

    const authRes = await fetch(authUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        omadaClientId: CLIENT_ID,
        omadaClientSecret: CLIENT_SECRET
      })
    });

    const tokenData = await authRes.json();

    if (!tokenData?.result?.accessToken) {
      console.error("Omada Auth Error:", JSON.stringify(tokenData));
      return res.status(200).json({
        found: false,
        step: "Auth Failed",
        omadaResponse: tokenData
      });
    }

    const token = tokenData.result.accessToken;

    // 2. Fetch Vouchers
    const voucherUrl = new URL(`/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers`, OMADA_URL);
    voucherUrl.searchParams.append('page', '1');
    voucherUrl.searchParams.append('pageSize', '1000');

    const voucherRes = await fetch(voucherUrl.toString(), {
      method: 'GET',
      headers: { 
        'AccessToken': token, 
        'Content-Type': 'application/json' 
      }
    });

    const voucherData = await voucherRes.json();

    if (voucherData.errorCode !== 0) {
      console.error("Omada Voucher Fetch Error:", JSON.stringify(voucherData));
      return res.status(200).json({
        found: false,
        step: "Fetch Failed",
        omadaResponse: voucherData
      });
    }

    const vouchers = voucherData?.result?.data || [];

    const match = vouchers.find(v => {
      const vCode = String(v.code || '').trim().replace(/[^a-zA-Z0-9]/g, '');
      return vCode === cleanInput;
    });

    if (match) {
      return res.status(200).json({
        found: true,
        code: match.code,
        status: match.status === 1 ? 'ACTIVE' : (match.status === 2 ? 'EXPIRED' : 'UNUSED'),
        timeRemaining: match.duration ? `${match.duration} Mins` : 'N/A',
        dataLimit: match.trafficLimit ? `${match.trafficLimit} MB` : 'Unlimited'
      });
    }

    return res.status(200).json({ found: false, totalScanned: vouchers.length });

  } catch (err) {
    console.error("Runtime Catch Error:", err.message);
    return res.status(200).json({
      found: false,
      error: "Runtime Catch Error",
      message: err.message
    });
  }
};
