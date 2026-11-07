const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ضع هنا مفتاح API الخاص بالمطور (Server API Key) من بوابة مطوري Pi
const PI_API_KEY = "62h5kkg1qwa4o7utg6qbbutpsaic3fhlvx3k2nqoxuopottl1tuztiire9wqbkht"; 

// 1. مسار الموافقة على الدفع (Server Approval)
app.post('/approve', async (req, pRes) => {
  const { paymentId } = req.body;
  console.log("جارٍ محاولة الموافقة على الدفع لـ Payment ID:", paymentId);

  try {
    const response = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (response.ok) {
      console.log("تمت الموافقة بنجاح:", data);
      pRes.json({ success: true, data });
    } else {
      console.error("فشل الموافقة:", data);
      pRes.status(400).json({ success: false, error: data });
    }
  } catch (err) {
    console.error("خطأ في الاتصال بسيرفر Pi:", err);
    pRes.status(500).json({ success: false, error: err.message });
  }
});

// 2. مسار إتمام الدفع نهائياً (Server Completion)
app.post('/complete', async (req, pRes) => {
  const { paymentId, txid } = req.body;
  console.log(`جارٍ إتمام الدفع لـ Payment ID: ${paymentId} مع المعاملة TXID: ${txid}`);

  try {
    const response = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ txid })
    });

    const data = await response.json();
    if (response.ok) {
      console.log("تم إتمام المعاملة بنجاح نهائياً:", data);
      pRes.json({ success: true, data });
    } else {
      console.error("فشل إتمام المعاملة:", data);
      pRes.status(400).json({ success: false, error: data });
    }
  } catch (err) {
    console.error("خطأ في الاتصال بسيرفر Pi:", err);
    pRes.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
