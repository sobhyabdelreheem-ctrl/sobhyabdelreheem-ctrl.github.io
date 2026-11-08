const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

const PI_API_KEY = "sdpztt1hw2jgpnyqkxp91kzyiqbldv5qz6sbgvqp6z4pq9rn7ozvnmlgmazcnodw";
const PI_API_BASE = 'https://api.minepi.com/v2';

// ⚠️ مفتاح السر (Secret Key) الخاص بمحفظة المطور
const DEVELOPER_SECRET_KEY = "SBRNCDX5VTIOY7WME2WVFOBIKKETPOHE2UQFGXAO7FDV3AWLVSTH6OGD";
  
// ⚠️ عنوان المحفظة المستهدفة الثابتة (التي ستصلها الأرباح تلقائياً)
const FIXED_TARGET_WALLET = "GB3RAZ7A7W7VDTWKOKGDKQGNHTUQF6TULH44NM7M57WIL7VTRN2X6637";

// إعداد السيرفر والشبكة
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
  console.log("1. تم استلام طلب الـ complete للـ paymentId:", paymentId);

  if (!validPaymentId(paymentId) || typeof txid !== 'string') {
    console.log("2. خطأ في البيانات المرسلة");
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  try {
    const result = await piRequest(`${PI_API_BASE}/payments/${encodeURIComponent(paymentId)}/complete`, {
      method: 'POST',
      headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ txid })
    });

    if (!result.ok) {
      console.log("3. فشل تأكيد الدفع مع سيرفر Pi:", result.data);
      return res.status(result.status).json({ success: false, error: result.data });
    }

    console.log("4. تم تأكيد الدفع مع Pi بنجاح، جاري جلب بيانات المبلغ...");

    const paymentInfoRes = await fetch(`${PI_API_BASE}/payments/${paymentId}`, {
      headers: { Authorization: `Key ${PI_API_KEY}` }
    });
    const paymentData = await paymentInfoRes.json();
    const amount = paymentData.amount; 

    const targetWallet = FIXED_TARGET_WALLET;
    console.log("5. المبلغ المدفوع:", amount, "-> سيتم تحويله إلى المحفظة المستهدفة:", targetWallet);

    if (targetWallet && DEVELOPER_SECRET_KEY) {
      try {
        console.log("6. جاري تنفيذ التحويل عبر Stellar...");
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
        console.log("7. نجح تحويل Stellar برقم العملية:", txResult.hash);
      } catch (stellarErr) {
        console.error("خطأ في عملية تحويل Stellar بالتفصيل:", stellarErr);
      }
    } else {
      console.log("تحذير: مفتاح السر أو المحفظة المستهدفة غير مضبوطة بشكل صحيح.");
    }

    return res.json({ success: true, data: result.data });

  } catch (error) {
    console.error('خطأ عام في مسار complete:', error.message);
    return res.status(500).json({ success: false, error: 'تعذر إتمام الدفع' });
  }
});

// مسار لتنظيف وإلغاء جميع المعاملات المعلقة (Pending) دفعة واحدة
app.post('/cancel-all-pending', async (req, res) => {
  try {
    console.log("جاري البحث عن المعاملات المعلقة...");
    
    const response = await fetch(`${PI_API_BASE}/payments`, {
      headers: { Authorization: `Key ${PI_API_KEY}` }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: 'تعذر جلب قائمة المدفوعات من سيرفر Pi' });
    }

    const data = await response.json();
    const payments = data.payments || data.rows || data || [];
    
    let cancelledCount = 0;
    
    for (const payment of payments) {
      if (payment && payment.identifier && !payment.complete && !payment.cancelled) {
        console.log(`إلغاء المعاملة المعلقة: ${payment.identifier}`);
        await fetch(`${PI_API_BASE}/payments/${encodeURIComponent(payment.identifier)}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' }
        });
        cancelledCount++;
      }
    }

    console.log(`✅ تم تنظيف وإلغاء عدد (${cancelledCount}) من المعاملات المعلقة بنجاح.`);
    return res.json({ success: true, message: `تم إلغاء ${cancelledCount} معاملة معلقة بنجاح` });

  } catch (error) {
    console.error('خطأ أثناء فحص المعاملات المعلقة:', error.message);
    return res.status(500).json({ success: false, error: 'تعذر معالجة الطلب' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'Wallet Monitor & Transfer' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
