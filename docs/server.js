const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

const PI_API_KEY = "sdpztt1hw2jgpnyqkxp91kzyiqbldv5qz6sbgvqp6z4pq9rn7ozvnmlgmazcnodw";
const PI_API_BASE = 'https://api.minepi.com/v2';

// ⚠️ حط هنا مفتاح السر (Secret Key) الخاص بمحفظتك
const DEVELOPER_SECRET_KEY = "حط_مفتاح_السر_هنا"; 

// إعداد السيرفر والشبكة بالطريقة الصحيحة
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

    if (!result.ok) return res.status(result.status).json({ success: false, error: result.data });

    // جلب بيانات الدفع والتحويل التلقائي
    const paymentInfoRes = await fetch(`${PI_API_BASE}/payments/${paymentId}`, {
      headers: { Authorization: `Key ${PI_API_KEY}` }
    });
    const paymentData = await paymentInfoRes.json();
    const amount = paymentData.amount; 
    const targetWallet = paymentData.metadata?.receiver; 

    if (targetWallet && DEVELOPER_SECRET_KEY && !DEVELOPER_SECRET_KEY.includes("حط_مفتاح_السر_هنا")) {
      try {
        const sourceKeys = StellarSdk.Keypair.fromSecret(DEVELOPER_SECRET_KEY);
        const sourceAccount = await server.loadAccount(sourceKeys.public());

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: await server.fetchBaseFee(),
          networkPassphrase: StellarSdk.Networks.TESTNET
        })
          .addOperation(
            StellarSdk.Operation.payment({
              destination: targetWallet,
              asset: StellarSdk.Asset.native(),
              amount: amount.toString()
            })
          )
          .setTimeout(30)
          .build();

        transaction.sign(sourceKeys);
        const txResult = await server.submitTransaction(transaction);
        console.log("Stellar Transfer Success:", txResult.hash);
      } catch (stellarErr) {
        console.error("Stellar transfer error:", stellarErr);
      }
    }

    return res.json({ success: true, data: result.data });

  } catch (error) {
    console.error('Completion connection error:', error.message);
    return res.status(500).json({ success: false, error: 'تعذر إتمام الدفع' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'Wallet Monitor & Transfer' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
