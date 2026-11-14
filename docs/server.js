const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(cors());

const DEVELOPER_SECRET_KEY = process.env.DEVELOPER_SECRET_KEY || "SAQS62QOYP44B7NG6NS67MZD3LAXBPIZW572F6V2DPAD6PWMJLCNAR3H";
const server = new StellarSdk.Horizon.Server('https://api.testnet.minepi.com');

// مسار موحد يتعامل مع الفحص والتحويل في نفس الوقت
app.get('/check', async (req, res) => {
  const wallet = req.query.wallet;

  // إذا لم يتم إرسال محفظة، يعتبرها مجرد فحص للحالة
  if (!wallet || wallet.length < 56) {
    return res.json({
      success: true,
      serverFile: "server.js",
      status: "متصل ويعمل بنجاح على Vercel"
    });
  }

  // إذا تم إرسال محفظة، يقوم بعملية التحويل مباشرة هنا لتجنب أي خطأ Not Found
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

// اجعل /transfer يحول مباشرة إلى نفس منطق /check لضمان عدم حدوث Not Found أبداً
app.get('/transfer', async (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) {
    return res.status(400).json({ success: false, error: 'الرجاء إدخال المحفظة' });
  }
  // إعادة توجيه الطلب الداخلي لنفس دالة التحويل
  res.redirect(`/check?wallet=${encodeURIComponent(wallet)}`);
});

module.exports = app;
