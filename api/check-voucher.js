module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const inputCode = req.query.code ? String(req.query.code).trim() : '';
  const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '');

  if (!cleanInput) {
    return res.status(400).json({ found: false, error: "Voucher code is required" });
  }

  const CLIENT_ID = (process.env.CLIENT_ID || "2d97f4d977fd41cf9c14412269036368").trim();
  const CLIENT_SECRET = (process.env.CLIENT_SECRET || "25b6e7c890ea48228f5ef0a52156d9f8").trim();
  const SITE_ID = (process.env.SITE_ID || "6a615c91e78f4e28047ab01e").trim();
  const OMADA_CID = (process.env.OMADA_CID || "dd4b631441b02b1d9787466c7bf876f7").trim();

  const hosts = [
    "https://aps1-omada-cloud.tplinkcloud.com",
    "https://omada-cloud.tplinkcloud.com",
    "https://use1-omada-cloud.tplinkcloud.com"
  ];

  let token = null;
  let activeHost = "";
  let debugLog = [];

  for (const host of hosts) {
    try {
      const authUrl = `${host}/openapi/authorize/token?grant_type=client_credentials`;
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          omadaClientId: CLIENT_ID,
          omadaClientSecret: CLIENT_SECRET
        })
      });

      const responseText = await response.text();
      
      if (responseText.trim().startsWith('{')) {
        const data = JSON.parse(responseText);
        if (data.errorCode === 0 && data.result?.accessToken) {
          token = data.result.accessToken;
          activeHost = host;
          break;
        } else {
          debugLog.push({ host, status: response.status, error: data });
        }
      } else {
        debugLog.push({ host, status: response.status, note: "Non-JSON response (HTML page)" });
      }
    } catch (err) {
      debugLog.push({ host, error: err.message });
    }
  }

  if (!token) {
    return res.status(200).json({
      found: false,
      error: "Authentication failed. Verify OpenAPI settings in Omada Cloud Portal.",
      debug: debugLog
    });
  }

  try {
    const voucherUrl = `${activeHost}/openapi/v1/${OMADA_CID}/sites/${SITE_ID}/vouchers?page=1&pageSize=1000`;
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
        found: false,
        error: "Failed to fetch vouchers from Omada Site",
        omadaResponse: voucherData
      });
    }

    const vouchers = voucherData?.result?.data || [];
    const match = vouchers.find(v => {
      const vCode = String(v.code || '').trim().replace(/[^a-zA-Z0-9]/g, '');
      return vCode === cleanInput;
    });

    if (match) {
      let statusText = 'UNUSED';
      if (match.status === 1) statusText = 'ACTIVE';
      if (match.status === 2) statusText = 'EXPIRED';

      let durationStr = 'N/A';
      if (match.duration) {
        durationStr = match.duration >= 60 
          ? `${Math.floor(match.duration / 60)} Hrs ${match.duration % 60} Mins` 
          : `${match.duration} Mins`;
      }

      let trafficStr = 'Unlimited';
      if (match.trafficLimit && match.trafficLimit > 0) {
        trafficStr = `${match.trafficLimit} MB`;
      }

      let firstUsedStr = 'Not Yet Activated';
      if (match.startTime && match.startTime > 0) {
        const d = new Date(match.startTime);
        firstUsedStr = d.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
      }

      return res.status(200).json({
        found: true,
        code: match.code,
        status: statusText,
        timeRemaining: durationStr,
        dataLimit: trafficStr,
        firstUsed: firstUsedStr
      });
    }

    return res.status(200).json({
      found: false,
      totalScanned: vouchers.length
    });

  } catch (err) {
    return res.status(200).json({
      found: false,
      error: "Runtime Exception",
      message: err.message
    });
  }
};