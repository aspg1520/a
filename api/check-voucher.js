module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const inputCode = req.query.code ? String(req.query.code).trim() : '';
  const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '');

  if (!cleanInput) {
    return res.status(200).json({ found: false, error: "Voucher code is required" });
  }

  const OMADA_URL = (process.env.OMADA_URL || "https://aps1-omada-cloud.tplinkcloud.com").trim().replace(/\/+$/, '');
  const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
  const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
  const SITE_ID = (process.env.SITE_ID || "6a615c91e78f4e28047ab01e").trim(); // Corrected Site ID
  const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

  try {
    // 1. Get Access Token
    const authRes = await fetch(`${OMADA_URL}/openapi/authorize/token?grant_type=client_credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        omadaClientId: CLIENT_ID,
        omadaClientSecret: CLIENT_SECRET
      })
    });

    const tokenData = await authRes.json();
    const token = tokenData?.result?.accessToken;

    if (!token) {
      return res.status(200).json({ found: false, error: "Auth Token Failed", details: tokenData });
    }

    // 2. Fetch Vouchers
    const voucherRes = await fetch(`${OMADA_URL}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers?page=1&pageSize=1000`, {
      method: 'GET',
      headers: { 
        'AccessToken': token, 
        'Content-Type': 'application/json' 
      }
    });

    const voucherData = await voucherRes.json();

    if (voucherData.errorCode !== 0) {
      return res.status(200).json({ found: false, error: "Fetch Failed", omadaResponse: voucherData });
    }

    const vouchers = voucherData?.result?.data || [];

    // Match Voucher Code
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
    return res.status(200).json({
      found: false,
      error: "Runtime Server Error",
      message: err.message
    });
  }
};
