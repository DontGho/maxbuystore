const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const c = process.env.ROBLOX_COOKIE;
const ppEnv = new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);
const ppClient = new paypal.core.PayPalHttpClient(ppEnv);

async function getUid(u) {
  const r = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [u] });
  return r.data.data[0]?.id;
}

async function getItemInfo(url) {
  let id;
  let type;
  
  if (url.includes('game-pass') || url.includes('gamepass')) {
    const match = url.match(/game-pass\/(\d+)|gamepass\/(\d+)/);
    if (!match) return null;
    id = match[1] || match[2];
    type = 'Game Pass';
  } else if (url.includes('catalog')) {
    const match = url.match(/catalog\/(\d+)/);
    if (!match) return null;
    id = match[1];
    type = 'Catalog Item';
  } else if (url.includes('/library/')) {
    const match = url.match(/library\/(\d+)/);
    if (!match) return null;
    id = match[1];
    type = 'Asset';
  } else {
    return null;
  }
  
  try {
    const r = await axios.get(`https://economy.roblox.com/v2/assets/${id}/details`);
    const creator = r.data.Creator;
    
    return { 
      id, 
      price: r.data.PriceInRobux, 
      creator: creator,
      creatorId: creator.CreatorTargetId || creator.Id,
      itemType: type 
    };
  } catch (e) {
    return null;
  }
}

async function buyItem(itemId, price) {
  try {
    const r = await axios.post(
      `https://economy.roblox.com/v1/purchases/products/${itemId}`,
      { expectedCurrency: 1, expectedPrice: price, expectedSellerId: 0 },
      { headers: { 'Cookie': `.ROBLOSECURITY=${c}`, 'Content-Type': 'application/json', 'x-csrf-token': '' }}
    ).catch(async e => {
      if (e.response?.headers['x-csrf-token']) {
        const t = e.response.headers['x-csrf-token'];
        return axios.post(
          `https://economy.roblox.com/v1/purchases/products/${itemId}`,
          { expectedCurrency: 1, expectedPrice: price, expectedSellerId: 0 },
          { headers: { 'Cookie': `.ROBLOSECURITY=${c}`, 'Content-Type': 'application/json', 'x-csrf-token': t }}
        );
      }
      throw e;
    });
    return r.data;
  } catch (e) {
    throw new Error('Failed to buy item');
  }
}

function logPurchase(data) {
  const log = {
    timestamp: new Date().toISOString(),
    username: data.username,
    amount: data.amount,
    itemId: data.itemId,
    itemPrice: data.itemPrice,
    paymentMethod: data.method,
    totalPaid: data.totalPaid
  };
  
  const logFile = path.join(__dirname, 'purchases.json');
  let logs = [];
  
  if (fs.existsSync(logFile)) {
    logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }
  
  logs.push(log);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

app.post('/api/verify-item', async (req, res) => {
  try {
    const { username, itemUrl } = req.body;
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const item = await getItemInfo(itemUrl);
    if (!item) return res.json({ success: false, error: 'Invalid item link' });
    
    const creatorId = item.creatorId;
    
    if (creatorId != uid) {
      return res.json({ success: false, error: `Item not owned by this user. Creator ID: ${creatorId}, User ID: ${uid}` });
    }
    
    res.json({ success: true, price: item.price, itemType: item.itemType });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Error verifying item' });
  }
});

app.post('/api/create-payment', async (req, res) => {
  try {
    const { username, amount, itemUrl, method } = req.body;
    
    if (amount < 1000) {
      return res.json({ success: false, error: 'Minimum 1,000 Robux' });
    }
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const item = await getItemInfo(itemUrl);
    if (!item) return res.json({ success: false, error: 'Invalid item link' });
    
    const creatorId = item.creatorId;
    
    if (creatorId != uid) {
      return res.json({ success: false, error: 'Item not owned by you' });
    }
    
    const requiredPrice = Math.ceil(amount / 0.7);
    if (item.price < requiredPrice) {
      return res.json({ success: false, error: `Item price too low. Set to ${requiredPrice} Robux` });
    }
    
    const price = (amount / 1000) * 7.39;
    
    if (method === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${amount} Robux` }, unit_amount: Math.round(price * 100) }, quantity: 1 }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
        metadata: { username, amount, itemUrl, itemId: item.id, itemPrice: item.price }
      });
      res.json({ success: true, url: session.url });
    } else if (method === 'paypal') {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: price.toFixed(2) }, description: `${amount} Robux for ${username}` }],
        application_context: { 
          return_url: `${req.protocol}://${req.get('host')}/success`, 
          cancel_url: `${req.protocol}://${req.get('host')}/cancel` 
        }
      });
      const order = await ppClient.execute(request);
      res.json({ success: true, url: order.result.links.find(l => l.rel === 'approve').href });
    }
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Payment error' });
  }
});

app.post('/api/purchase-history', async (req, res) => {
  try {
    const { username } = req.body;
    const logFile = path.join(__dirname, 'purchases.json');
    
    if (!fs.existsSync(logFile)) {
      return res.json({ purchases: [] });
    }
    
    const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    const userPurchases = logs.filter(l => l.username.toLowerCase() === username.toLowerCase());
    
    res.json({ purchases: userPurchases });
  } catch (e) {
    res.json({ purchases: [] });
  }
});

app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const { username, amount, itemId, itemPrice } = event.data.object.metadata;
      
      await buyItem(itemId, itemPrice);
      
      logPurchase({
        username,
        amount,
        itemId,
        itemPrice,
        method: 'stripe',
        totalPaid: event.data.object.amount_total / 100
      });
      
      console.log(`Bought item ${itemId} for ${itemPrice} Robux`);
    }
    res.json({ received: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

app.post('/webhook/paypal', async (req, res) => {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const event = req.body;
    
    const verifyRequest = {
      auth_algo: req.headers['paypal-auth-algo'],
      cert_url: req.headers['paypal-cert-url'],
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event
    };
    
    const verifyResponse = await axios.post(
      'https://api.paypal.com/v1/notifications/verify-webhook-signature',
      verifyRequest,
      {
        auth: {
          username: process.env.PAYPAL_CLIENT_ID,
          password: process.env.PAYPAL_SECRET
        }
      }
    );
    
    if (verifyResponse.data.verification_status !== 'SUCCESS') {
      return res.status(400).json({ error: 'Invalid webhook' });
    }
    
    console.log('PayPal payment verified - manually buy the item');
    res.json({ received: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(process.env.PORT || 3000);