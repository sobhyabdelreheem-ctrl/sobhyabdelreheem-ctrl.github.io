
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

// احتفظ بمفتاح API الحالي في نسختك مؤقتاضع قيمة مفتاحك الحالي هنا
const PI_API_KEY = "sdpztt1hw2jgpnyqkxp91kzyiqbldv5qz6sbgvqp6z4pq9rn7ozvnmlgmazcnodw";

const PI_API_BASE = 'https://api.minepi.com/v2';

// فحص صحة بيانات الطلب
function validPaymentId(id) {
  return typeof id === 'string' &&
         id.length > 0 &&
         id.length <= 200 &&
         /^[a-zA-Z0-9_-]+$/.test(id);
}

// الاتصال بسيرفر Pi ومعالجة الاستجابة
async function piRequest(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

// 1- الموافقة على الدفع
app.post('/approve', async (req, res) => {
  const { paymentId } = req.body || {};

  if (!validPaymentId(paymentId)) {
    return res.status(400).json({
      success: false,
      error: 'Payment ID غير صحيح'
    });
  }

  try {
    console.log('Approval request:', paymentId);

    const result = await piRequest(
      `${PI_API_BASE}/payments/${encodeURIComponent(paymentId)}/approve`,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!result.ok) {
      console.error('Approval failed:', result.data);

      return res.status(result.status).json({
        success: false,
        error: result.data
      });
    }

    console.log('Payment approved:', paymentId);

    return res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Approval connection error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'تعذر الاتصال بسيرفر Pi'
    });
  }
});

// 2- إتمام الدفع
app.post('/complete', async (req, res) => {
  const { paymentId, txid } = req.body || {};

  if (!validPaymentId(paymentId)) {
    return res.status(400).json({
      success: false,
      error: 'Payment ID غير صحيح'
    });
  }

  if (
    typeof txid !== 'string' ||
    txid.length === 0 ||
    txid.length > 200
  ) {
    return res.status(400).json({
      success: false,
      error: 'TXID غير صحيح'
    });
  }

  try {
    console.log('Completion request:', paymentId, txid);

    const result = await piRequest(
      `${PI_API_BASE}/payments/${encodeURIComponent(paymentId)}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txid })
      }
    );

    if (!result.ok) {
      console.error('Completion failed:', result.data);

      return res.status(result.status).json({
        success: false,
        error: result.data
      });
    }

    console.log('Payment completed:', paymentId);

    return res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Completion connection error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'تعذر الاتصال بسيرفر Pi'
    });
  }
});

// فحص السيرفر
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'Wallet Monitor'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
