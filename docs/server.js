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

// 🚀 مسار لفحص حالة السيرفر والملفات وتأكيد العمل
app.get('/check', (req, res) => {
  return res.json({
    success: true,
    serverFile: "server.js",
    status: "متصل ويعمل بنجاح على Vercel",
    envConfigured: !!DEVELOPER_SECRET_KEY
  });
});

app.post('/transfer', async (req, res) => {
  const { wallet } = req.body || {};
  
  if (!wallet) {
    return res.status(400).json({ success: false, error: 'الرجاء إدخال عنوان المحفظة' });
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
