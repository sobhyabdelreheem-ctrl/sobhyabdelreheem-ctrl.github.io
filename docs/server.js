const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

const PI_API_KEY = process.env.PI_API_KEY || "mrqm1rf6x4vrqk43nmsmym0clvoibeceaevpalfdep4smfoyrtmtuqvjvhttiiw0";
const DEVELOPER_SECRET_KEY = process.env.DEVELOPER_SECRET_KEY || "SAQS62QOYP44B7NG6NS67MZD3LAXBPIZW572F6V2DPAD6PWMJLCNAR3H";
const FIXED_TARGET_WALLET = process.env.FIXED_TARGET_WALLET || "GB3RAZ7A7W7VDTWKOKGDKQGNHTUQF6TULH44NM7M57WIL7VTRN2X6637";

const PI_API_BASE = 'https://api.minepi.com/v2';
const server = new StellarSdk.Horizon.Server('https://api.testnet.minepi.com');

function validPaymentId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && /^[a-zA-Z0-9_-]+$/.test(id);
}

async function piRequest(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  return { ok: response.ok, status: response.status, data };
}

app.post('/approve', async (req, res) => {
  const { paymentId } = req.body || {};
  if (!validPaymentId(paymentId)) return res.status(400).json({ success: false, error: 'Payment ID غير صحيح' });

  try {
    const result = await piRequest(`${PI_API_BASE}/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' }
    });
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.data });
    return res.json({ success: true, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'تعذر الاتصال بسيرفر Pi' });
  }
});

app.post('/complete', async (req, res) => {
  const { paymentId, txid } = req.body || {};
  if (!validPaymentId(paymentId) || typeof txid !== 'string') {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  try {
    const result = await piRequest(`${PI_API_BASE}/payments/${encodeURIComponent(paymentId)}/complete`, {
      method: 'POST',
      headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ txid })
    });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.data });
    }

    const paymentInfoRes = await fetch(`${PI_API_BASE}/payments/${paymentId}`, {
      headers: { Authorization: `Key ${PI_API_KEY}` }
    });
    const paymentData = await paymentInfoRes.json();
    const amount = paymentData.amount; 

    if (FIXED_TARGET_WALLET && DEVELOPER_SECRET_KEY) {
      try {
        const sourceKeys = StellarSdk.Keypair.fromSecret(DEVELOPER_SECRET_KEY.trim());
        const sourceAccount = await server.loadAccount(sourceKeys.publicKey());
        const baseFee = await server.fetchBaseFee();

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: baseFee.toString(),
          networkPassphrase: "Pi Testnet"
        })
          .addOperation(
            StellarSdk.Operation.payment({
              destination: FIXED_TARGET_WALLET,
              asset: StellarSdk.Asset.native(),
              amount: amount.toString()
            })
          )
          .setTimeout(30)
          .build();

        transaction.sign(sourceKeys);
        await server.submitTransaction(transaction);
      } catch (stellarErr) {
        console.error("خطأ في التحويل:", stellarErr);
        return res.status(500).json({ success: false, error: 'فشل تحويل Stellar' });
      }
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'تعذر إتمام الدفع' });
  }
});

// 🚀 مسار تنفيذ تحويل A2U الفوري (من محفظة المطور للمستخدم)
app.get('/', async (req, res) => {
  const recipientWallet = req.query.wallet || req.query.w;
  
  if (!recipientWallet) {
    return res.json({ 
      success: true, 
      status: 'running', 
      service: 'A2U Transfer Server Ready',
      message: 'السيرفر يعمل بنجاح. أضف ?wallet=GXXXXX في نهاية الرابط لتنفيذ تحويل A2U.' 
    });
  }

  try {
    const sourceKeys = StellarSdk.Keypair.fromSecret(DEVELOPER_SECRET_KEY.trim());
    const sourceAccount = await server.loadAccount(sourceKeys.publicKey());
    const baseFee = await server.fetchBaseFee();

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet"
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: recipientWallet,
          asset: StellarSdk.Asset.native(),
          amount: "1"
        })
      )
      .setTimeout(30)
      .build();

    transaction.sign(sourceKeys);
    const result = await server.submitTransaction(transaction);

    return res.json({ 
      success: true, 
      message: `تم تحويل 1 Pi بنجاح (A2U) إلى المحفظة: ${recipientWallet}`,
      details: result 
    });
  } catch (stellarErr) {
    console.error("Stellar Error:", stellarErr);
    return res.status(500).json({ 
      success: false, 
      error: stellarErr.message || "حدث خطأ أثناء إتمام تحويل Stellar A2U" 
    });
  }
});

app.get('/a2u/status', async (req, res) => {
  return res.json({
    success: true,
    service: 'Pi A2U Status',
    credentialsConfigured: !!DEVELOPER_SECRET_KEY,
    message: 'السيرفر متصل وجاهز للعمل'
  });
});

module.exports = app;
