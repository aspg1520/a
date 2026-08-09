module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = req.query.code ? String(req.query.code).trim().replace(/[^a-zA-Z0-9]/g, '') : '';
  if (!code) return res.status(400).json({ error: "Voucher code is required" });

  const OMADA_URL = "https://aps1-omada-cloud.tplinkcloud.com";
  const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
  const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
  const SITE_ID = (process.env.SITE_ID || "6a615c90e78f4e28047ab010").trim();
  const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

  try {
    // 1. Get Token
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
      return res.status(200).json({
        success: false,
        step: "1. Token Request Failed",
        omadaResponse: tokenData
      });
    }

    const token = tokenData.result.accessToken;

    // 2. Fetch Vouchers
    const voucherUrl = `${OMADA_URL}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers?page=1&pageSize=1000`;
    const voucherRes = await fetch(voucherUrl, {
      method: 'GET',
      headers: { 
        'AccessToken': token,
        'Content-Type': 'application/json'
      }
    });

    const voucherData = await voucherRes.json();

    if (voucherData.errorCode !== 0) {
      return res.status(200).json({
        success: false,
        step: "2. Fetch Vouchers Failed",
        omadaResponse: voucherData
      });
    }

    const vouchers = voucherData.result?.data || [];
    const match = vouchers.find(v => String(v.code).replace(/[^a-zA-Z0-9]/g, '') === code);

    if (!match) return res.json({ found: false, totalChecked: vouchers.length });

    return res.json({
      found: true,
      code: match.code,
      status: match.status === 1 ? 'ACTIVE' : (match.status === 2 ? 'EXPIRED' : 'UNUSED'),
      timeRemaining: match.duration ? `${match.duration} Mins` : 'N/A',
      dataLimit: match.trafficLimit ? `${match.trafficLimit} MB` : 'Unlimited'
    });

  } catch (err) {
    return res.status(200).json({
      success: false,
      step: "Runtime Catch Error",
      errorMessage: err.message
    });
  }
};
