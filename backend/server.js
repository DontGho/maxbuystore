const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');
const fs = require('fs');
const app = express();

// IMPORTANT: Stripe webhook MUST come BEFORE express.json()
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(
      req.body, 
      req.headers['stripe-signature'], 
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    if (event.type === 'checkout.session.completed') {
      const { username, amount, itemId, itemPrice } = event.data.object.metadata;
      
      console.log(`Processing purchase for ${username}: ${amount} Robux (Item: ${itemId})`);
      
      try {
        await buyItem(itemId, itemPrice);
        
        logPurchase({
          username,
          amount,
          itemId,
          itemPrice,
          method: 'stripe',
          totalPaid: event.data.object.amount_total / 100
        });
        
        console.log(`✓ Successfully bought item ${itemId} for ${itemPrice} Robux`);
      } catch (buyError) {
        console.error(`✗ Failed to buy item:`, buyError.message);
        // Log the failed purchase attempt
        logPurchase({
          username,
          amount,
          itemId,
          itemPrice,
          method: 'stripe',
          totalPaid: event.data.object.amount_total / 100,
          status: 'failed',
          error: buyError.message
        });
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// NOW apply JSON parser for other routes
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const c = process.env.ROBLOX_COOKIE;
const ppEnv = new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);
const ppClient = new paypal.core.PayPalHttpClient(ppEnv);

async function getUid(u) {
  const r = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [u] });
  return r.data.data[0]?.id;
}

async function getUserAvatar(uid) {
  try {
    const r = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=150x150&format=Png&isCircular=false`);
    return r.data.data[0]?.imageUrl;
  } catch (e) {
    return null;
  }
}

async function getItemInfo(url) {
  let id;
  let type;
  
  if (url.includes('game-pass') || url.includes('gamepass')) {
    const match = url.match(/game-pass\/(\d+)|gamepass\/(\d+)/);
    if (!match) return null;
    id = match[1] || match[2];
    type = 'Game Pass';
    
    try {
      const r = await axios.get(`https://apis.roblox.com/game-passes/v1/game-passes/${id}/product-info`);
      return { 
        id, 
        price: r.data.PriceInRobux, 
        creator: { Name: r.data.Creator.Name },
        creatorId: r.data.Creator.Id,
        itemType: type 
      };
    } catch (e) {
      console.error('Game pass fetch error:', e.message);
      return null;
    }
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
    console.error('Asset fetch error:', e.message);
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
    throw new Error('Failed to buy item: ' + e.message);
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
    totalPaid: data.totalPaid,
    status: data.status || 'success',
    error: data.error || null
  };
  
  const logFile = path.join(__dirname, 'purchases.json');
  let logs = [];
  
  if (fs.existsSync(logFile)) {
    logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }
  
  logs.push(log);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

app.post('/api/verify-user', async (req, res) => {
  try {
    const { username } = req.body;
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const avatar = await getUserAvatar(uid);
    
    res.json({ success: true, userId: uid, avatar });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Error verifying user' });
  }
});

app.post('/api/verify-item', async (req, res) => {
  try {
    const { username, itemUrl, amount } = req.body;
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const item = await getItemInfo(itemUrl);
    if (!item) return res.json({ success: false, error: 'Invalid item link' });
    
    const creatorId = item.creatorId;
    
    if (creatorId != uid) {
      return res.json({ success: false, error: `Item not owned by this user. Creator ID: ${creatorId}, User ID: ${uid}` });
    }
    
    // Check price if amount is provided
    if (amount) {
      const requiredPrice = Math.ceil(amount / 0.7);
      console.log(`Item price: ${item.price}, Required price: ${requiredPrice}`);
      
      if (item.price !== requiredPrice) {
        return res.json({ 
          success: false, 
          error: `Item price must be exactly ${requiredPrice} R$ (currently ${item.price} R$)`,
          currentPrice: item.price,
          requiredPrice: requiredPrice
        });
      }
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
    
    console.log(`Payment attempt - Amount: ${amount} R$, Item price: ${item.price} R$, Required: ${requiredPrice} R$`);
    
    if (item.price !== requiredPrice) {
      return res.json({ 
        success: false, 
        error: `Item price must be exactly ${requiredPrice} R$ but is currently ${item.price} R$. Please update the item price on Roblox.` 
      });
    }
    
    const price = (amount / 1000) * 7.39;
    
    if (method === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${amount} Robux` }, unit_amount: Math.round(price * 100) }, quantity: 1 }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
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

app.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;
  
  try {
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const { username, amount } = session.metadata;
      
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Success - MaxBuy</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 min-h-screen flex items-center justify-center p-6">
          <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
            <p class="text-zinc-400 mb-6">Your Robux purchase is being processed</p>
            <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-6">
              <p class="text-sm text-zinc-500 mb-1">Username</p>
              <p class="text-white font-semibold mb-3">${username}</p>
              <p class="text-sm text-zinc-500 mb-1">Robux Amount</p>
              <p class="text-white font-semibold">${amount} R$</p>
            </div>
            <p class="text-sm text-zinc-500 mb-6">
              Your Robux will appear in your account within 5-10 minutes.<br>
              Check your Roblox transactions for confirmation.
            </p>
            <a href="/" class="inline-block bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-lg transition">
              Back to Home
            </a>
          </div>
        </body>
        </html>
      `);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Success - MaxBuy</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 min-h-screen flex items-center justify-center p-6">
          <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
            <p class="text-zinc-400 mb-6">Your Robux purchase is being processed</p>
            <p class="text-sm text-zinc-500 mb-6">
              Your Robux will appear in your account within 5-10 minutes.
            </p>
            <a href="/" class="inline-block bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-lg transition">
              Back to Home
            </a>
          </div>
        </body>
        </html>
      `);
    }
  } catch (e) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Success - MaxBuy</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 min-h-screen flex items-center justify-center p-6">
        <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
          <p class="text-zinc-400 mb-6">Your Robux purchase is being processed</p>
          <a href="/" class="inline-block bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-lg transition">
            Back to Home
          </a>
        </div>
      </body>
      </html>
    `);
  }
});

app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Cancelled - MaxBuy</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 min-h-screen flex items-center justify-center p-6">
      <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white mb-2">Payment Cancelled</h1>
        <p class="text-zinc-400 mb-6">Your payment was cancelled. No charges were made.</p>
        <a href="/" class="inline-block bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-lg transition">
          Try Again
        </a>
      </div>
    </body>
    </html>
  `);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});