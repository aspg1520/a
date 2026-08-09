const axios = require('axios');

// Automatic URL cleaner para makaiwas sa Invalid URL error
function sanitizeUrl(rawUrl) {
  if (!rawUrl) return "https://aps1-omada-cloud.tplinkcloud.com";
  const match = rawUrl.match(/https?:\/\/[^\s\]\)]+/);
  return match ? match[0] : "https://aps1-omada-cloud.tplinkcloud.com";
}

const OMADA_URL = sanitizeUrl(process.env.OMADA_URL);
const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
const SITE_ID = (process.env.SITE_ID || "6a615c90e78f4e28047ab010").trim();
const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (accessToken && now < tokenExpiresAt) {
    return accessToken;
  }

  const response = await axios.post(`${OMADA_URL}/openapi/authorize/token?grant_type=client_credentials`, {
    omadaClientId: CLIENT_ID,
    omadaClientSecret: CLIENT_SECRET
  });

  if (response.data && response.data.result) {
    accessToken = response.data.result.accessToken;
    tokenExpiresAt = now + (response.data.result.expiresIn - 300) * 1000;
    return accessToken;
  }
  throw new Error("Authentication failed");
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const cleanInput = req.query.code ? req.query.code.trim().replace(/[^a-zA-Z0-9]/g, '') : '';

  if (!cleanInput) {
    return res.status(400).json({ error: "Voucher code is required" });
  }

  try {
    const token = await getAccessToken();

    // Direct search by code
    const omadaRes = await axios.get(
      `${OMADA_URL}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers`,
      {
        headers: { 'AccessToken': token },
        params: { page: 1, pageSize: 1000 }
      }
    );

    const result = omadaRes.data;

    if (result.errorCode === 0 && result.result?.data?.length > 0) {
      const voucher = result.result.data.find(v => {
        const cleanVoucherCode = String(v.code).trim().replace(/[^a-zA-Z0-9]/g, '');
        return cleanVoucherCode === cleanInput;
      });

      if (!voucher) return res.json({ found: false });

      return res.json({
        found: true,
        code: voucher.code,
        status: voucher.status === 1 ? 'ACTIVE' : (voucher.status === 2 ? 'EXPIRED' : 'UNUSED'),
        timeRemaining: voucher.duration ? `${voucher.duration} Mins` : 'N/A',
        dataLimit: voucher.trafficLimit ? `${voucher.trafficLimit} MB` : 'Unlimited',
        firstUsed: voucher.startTime ? new Date(voucher.startTime).toLocaleString() : 'Not Yet Used'
      });
    } else {
      return res.json({ found: false });
    }
  } catch (error) {
    console.error("=== ERROR DETAILED ===");
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Server error checking voucher" });
  }
};
