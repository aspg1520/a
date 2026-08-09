module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const inputCode = req.query.code ? String(req.query.code).trim() : '';
  const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '');

  if (!cleanInput) {
    return res.status(400).json({ found: false, error: "Voucher code is required" });
  }

  // Tiyaking walang trailing slash
  const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
  const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
  const SITE_ID = (process.env.SITE_ID || "6a615c91e78f4e28047ab01e").trim();
  const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

  // Subukan ang APS1 at Global URLs
  const hostsToTry = [
    "https://aps1-omada-cloud.tplinkcloud.com",
    "https://omada-cloud.tplinkcloud.com"
  ];

  let token = null;
  let activeHost = "";
  let lastError = null;

  for (const host of hostsToTry) {
    try {
      const authEndpoint = `${host}/openapi/authorize/token?grant_type=client_credentials`;
      const authRes = await fetch(authEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          omadaClientId: CLIENT_ID,
          omadaClientSecret: CLIENT_SECRET
        })
      });

      const rawText = await authRes.text();
      
      if (rawText.startsWith('{')) {
        const data = JSON.parse(rawText);
        if (data?.result?.accessToken) {
          token = data.result.accessToken;
          activeHost = host;
          break;
        } else {
          lastError = { host, httpStatus: authRes.status, omadaError: data };
        }
      } else {
        lastError = { host, httpStatus: authRes.status, message: "Returned HTML/Non-JSON Response" };
      }
    } catch (err) {
      lastError = { host, error: err.message };
    }
  }

  if (!token) {
    return res.status(200).json({
      found: false,
      error: "Could not authenticate with Omada OpenAPI",
      details: lastError
    });
  }

  // Fetch Vouchers using active authenticated host
  try {
    const voucherEndpoint = `${activeHost}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers?page=1&pageSize=1000`;
    const voucherRes = await fetch(voucherEndpoint, {
      method: 'GET',
      headers: { 'AccessToken': token, 'Content-Type': 'application/json' }
    });

    const voucherData = await voucherRes.json();

    if (voucherData.errorCode !== 0) {
      return res.status(200).json({
        found: false,
        error: "Voucher list fetch failed",
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
    return res.status(200).json({ found: false, error: err.message });
  }
};
