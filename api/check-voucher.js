const axios = require('axios');

const OMADA_URL = (process.env.OMADA_URL || "https://aps1-omada-cloud.tplinkcloud.com").trim().replace(/\/+$/, '');
const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
const SITE_ID = (process.env.SITE_ID || "6a615c90e78f4e28047ab010").trim();
const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = req.query.code ? req.query.code.trim().replace(/[^a-zA-Z0-9]/g, '') : '';
  if (!code) return res.status(400).json({ error: "Voucher code is required" });

  try {
    // 1. Get Access Token
    const authUrl = `${OMADA_URL}/openapi/authorize/token?grant_type=client_credentials`;
    const tokenRes = await axios.post(authUrl, {
      omadaClientId: CLIENT_ID,
      omadaClientSecret: CLIENT_SECRET
    }, { headers: { 'Content-Type': 'application/json' } });

    if (!tokenRes.data?.result?.accessToken) {
      return res.status(400).json({
        stage: "Authentication Failed",
        omadaResponse: tokenRes.data
      });
    }

    const token = tokenRes.data.result.accessToken;

    // 2. Fetch Vouchers
    const voucherUrl = `${OMADA_URL}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers`;
    const voucherRes = await axios.get(voucherUrl, {
      headers: { 'AccessToken': token },
      params: { page: 1, pageSize: 1000 }
    });

    if (voucherRes.data.errorCode !== 0) {
      return res.status(400).json({
        stage: "Voucher Fetch Failed",
        omadaResponse: voucherRes.data
      });
    }

    const vouchers = voucherRes.data.result?.data || [];
    const match = vouchers.find(v => String(v.code).replace(/[^a-zA-Z0-9]/g, '') === code);

    if (!match) return res.json({ found: false, totalVouchersChecked: vouchers.length });

    return res.json({
      found: true,
      code: match.code,
      status: match.status === 1 ? 'ACTIVE' : (match.status === 2 ? 'EXPIRED' : 'UNUSED'),
      timeRemaining: match.duration ? `${match.duration} Mins` : 'N/A',
      dataLimit: match.trafficLimit ? `${match.trafficLimit} MB` : 'Unlimited'
    });

  } catch (err) {
    // Ipapakita rito ang eksaktong dahilan sa browser
    return res.status(500).json({
      error: "API Request Error",
      message: err.message,
      omadaErrorDetails: err.response?.data || "No response body from Omada"
    });
  }
};
