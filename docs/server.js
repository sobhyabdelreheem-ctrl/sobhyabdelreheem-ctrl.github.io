const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

// السماح بقراءة الملفات الثابتة (مثل index.html)
app.use(express.static(path.join(__dirname)));

const DEVELOPER_SECRET_KEY = process.env.DEVELOPER_SECRET_KEY || "SAQS62QOYP44B7NG6NS67MZD3LAXBPIZW572F6V2DPAD6PWMJLCNAR3H";
const server = new StellarSdk.Horizon.Server('https://api.testnet.minepi.com');

// 1. مسار الصفحة الرئيسية لعرض index.html تلقائياً وتجنب Cannot GET /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. مسار الفحص
app.get('/check', (req, res) => {
  return res.json({
    success: true,
    serverFile: "server.js",
    status: "متصل ويعمل بنجاح على Vercel"
  });
});

// 3. مسار التحويل المباشر
app.get('/transfer', async (req, res) => {
  const wallet = req.query.wallet;
  
  if (!wallet || wallet.length < 56) {
    return res.status(400).json({ success: false, error: 'الرجاء إدخال عنوان محفظة صحيح' });
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
          destination: wallet,
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
      message: `تم تحويل 1 Pi بنجاح (A2U) إلى المحفظة: ${wallet}`,
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

module.exports = app;
