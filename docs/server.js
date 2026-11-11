const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

const PI_API_KEY = "qh6zjkqlugtwv37hyjiyfe8usjhg4szbsihkq0azboydp1t9bfmjheutuc0hcghg";
const PI_API_BASE = 'https://api.minepi.com/v2';

// ⚠️ مفتاح السر (Secret Key) المحدث من محفظة المطور
const DEVELOPER_SECRET_KEY = "SBOL3LB3COD6MUAYYRR4Y5TKYBCXYRHORCJUKBDA6GJRU2MAJ7QBJZR5";
  
// ⚠️ عنوان المحفظة المستهدفة الثابتة (التي ستصلها الأرباح تلقائياً)
const FIXED_TARGET_WALLET = "GBPZFCN5QDG5AM3M526DROXRKGT7SMXZP3BMRVMXYV42MGA5VGWIBMGC";

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
        // تنظيف المفتاح السري لضمان خلوه من أي مسافات مخفية
        const sourceKeys = StellarSdk.Keypair.fromSecret(DEVELOPER_SECRET_KEY.trim());
        
        // جلب تفاصيل الحساب بالطريقة المتوافقة تماماً مع أحدث إصدارات الـ SDK
        const sourceAccount = await server.loadAccount(sourceKeys.publicKey());
        const baseFee = await server.fetchBaseFee();

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: baseFee.toString(),
          //networkPassphrase: StellarSdk.Networks.TESTNET
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
        
        let stellarErrorDetails = stellarErr.message;
        if (stellarErr.response && stellarErr.response.data && stellarErr.response.data.extras) {
          stellarErrorDetails += " - Details: " + JSON.stringify(stellarErr.response.data.extras.result_codes);
        }

        return res.status(500).json({ 
          success: false, 
          error: 'فشل تحويل Stellar: ' + stellarErrorDetails 
        });
      }
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'تعذر إتمام الدفع' });
  }
});

// مسار لإلغاء المعاملة المعلقة مباشرة
app.all('/cancel-all-pending', async (req, res) => {
  const targetId = "FLevYZO2TXmL2YUhSG4sVxfHj5Ez";
  try {
    console.log(`جاري إلغاء المعاملة المحددة: ${targetId}`);
    
    const cancelRes = await fetch(`${PI_API_BASE}/payments/${encodeURIComponent(targetId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    const responseText = await cancelRes.text();
    
    console.log(`نتيجة الإلغاء: ${cancelRes.status}`, responseText);
    return res.send(`تم محاولة إلغاء المعاملة ${targetId}. الحالة: ${cancelRes.status} - الرد: ${responseText}`);
  } catch (error) {
    console.error('خطأ في الإلغاء:', error.message);
    return res.status(500).send(`خطأ: ${error.message}`);
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'Wallet Monitor & Transfer' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
