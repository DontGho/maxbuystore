const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');
const fs = require('fs');
const app = express();

// Stripe webhook MUST come BEFORE express.json()
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(
      req.body, 
      req.headers['stripe-signature'], 
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    if (event.type === 'checkout.session.completed') {
      const { username, amount, itemId, itemPrice, itemUrl } = event.data.object.metadata;
      
      console.log(`\n💰 Payment received from ${username}`);
      console.log(`Amount: ${amount} R$ | Paid: $${event.data.object.amount_total / 100}`);
      
      let itemType = 'Unknown';
      if (itemUrl.includes('game-pass') || itemUrl.includes('gamepass')) {
        itemType = 'Game Pass';
      } else if (itemUrl.includes('catalog')) {
        itemType = 'Catalog Item';
      } else if (itemUrl.includes('library')) {
        itemType = 'Asset';
      }
      
      try {
        await buyItem(itemId, itemPrice, itemType);
        
        logPurchase({
          username,
          amount,
          itemId,
          itemPrice,
          method: 'stripe',
          totalPaid: event.data.object.amount_total / 100,
          status: 'success'
        });
        
        console.log(`✓ Order complete for ${username}\n`);
      } catch (buyError) {
        console.error(`✗ Failed to complete order:`, buyError.message);
        
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
        
        console.error('⚠️ MANUAL INTERVENTION NEEDED - Check logs');
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const c = process.env.ROBLOX_COOKIE;

// PayPal setup
const paypalMode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
const ppEnv = paypalMode === 'live' 
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);
const ppClient = new paypal.core.PayPalHttpClient(ppEnv);

// Verify Roblox auth
async function verifyRobloxAuth() {
  try {
    console.log('\n=== Verifying Roblox Cookie ===');
    
    const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
      headers: { 
        'Cookie': `.ROBLOSECURITY=${c}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log('✓ Logged in as:', response.data.name, `(ID: ${response.data.id})`);
    
    try {
      const balanceRes = await axios.get(`https://economy.roblox.com/v1/users/${response.data.id}/currency`, {
        headers: { 
          'Cookie': `.ROBLOSECURITY=${c}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log('✓ Current Robux:', balanceRes.data.robux);
    } catch (e) {
      console.warn('Could not fetch balance');
    }
    
    console.log('=== Cookie Valid ===\n');
    return response.data;
  } catch (e) {
    console.error('✗ Cookie verification failed!');
    console.error('Update ROBLOX_COOKIE in environment variables\n');
    return null;
  }
}

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

async function buyItem(itemId, price, itemType) {
  console.log(`\n=== Attempting Purchase ===`);
  console.log(`Item ID: ${itemId}`);
  console.log(`Price: ${price} R$`);
  console.log(`Type: ${itemType}`);
  
  if (!c || c.length < 100) {
    throw new Error('ROBLOX_COOKIE not set');
  }
  
  try {
    const headers = {
      'Cookie': `.ROBLOSECURITY=${c}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://www.roblox.com',
      'Referer': 'https://www.roblox.com/'
    };
    
    // Get CSRF token
    let csrfToken;
    try {
      await axios.post(
        `https://economy.roblox.com/v1/purchases/products/${itemId}`,
        { expectedCurrency: 1, expectedPrice: price, expectedSellerId: 0 },
        { headers }
      );
    } catch (e) {
      csrfToken = e.response?.headers['x-csrf-token'];
      if (!csrfToken) {
        throw new Error('Failed to get CSRF token');
      }
    }
    
    console.log('✓ Got CSRF token');
    headers['x-csrf-token'] = csrfToken;
    
    // Get balance
    let oldBalance = 0;
    let userId = 0;
    try {
      const userRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers });
      userId = userRes.data.id;
      
      const balanceRes = await axios.get(`https://economy.roblox.com/v1/users/${userId}/currency`, { headers });
      oldBalance = balanceRes.data.robux;
      console.log(`Current balance: ${oldBalance} R$`);
      
      if (oldBalance < price) {
        throw new Error(`Insufficient Robux! Have ${oldBalance} R$, need ${price} R$`);
      }
    } catch (e) {
      console.warn('Could not check balance');
    }
    
    // Check if item is for sale
    try {
      const itemRes = await axios.get(`https://economy.roblox.com/v2/assets/${itemId}/details`);
      console.log(`Item: ${itemRes.data.Name}`);
      console.log(`For sale: ${itemRes.data.IsForSale}`);
      
      if (!itemRes.data.IsForSale) {
        throw new Error('Item is NOT for sale! User must list it on Roblox.');
      }
    } catch (e) {
      console.warn('Could not verify item:', e.message);
    }
    
    // Make purchase
    console.log('Making purchase...');
    const response = await axios.post(
      `https://economy.roblox.com/v1/purchases/products/${itemId}`,
      { expectedCurrency: 1, expectedPrice: price, expectedSellerId: 0 },
      { 
        headers,
        validateStatus: (status) => status >= 200 && status < 500
      }
    );
    
    console.log('Response status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify balance changed
      if (userId && oldBalance > 0) {
        try {
          const newBalanceRes = await axios.get(`https://economy.roblox.com/v1/users/${userId}/currency`, { headers });
          const newBalance = newBalanceRes.data.robux;
          const spent = oldBalance - newBalance;
          
          console.log(`New balance: ${newBalance} R$ (spent ${spent} R$)`);
          
          if (spent === 0) {
            throw new Error('Balance unchanged - item may not be for sale or already owned');
          }
        } catch (e) {
          console.warn('Could not verify balance change');
        }
      }
      
      console.log('✓ Purchase completed');
      console.log('=== Purchase Complete ===\n');
      return response.data;
    } else if (response.status === 400) {
      throw new Error('Purchase failed: ' + (response.data?.errors?.[0]?.message || 'Bad request'));
    } else {
      throw new Error('Purchase failed with status ' + response.status);
    }
  } catch (e) {
    console.error('✗ Purchase failed:', e.message);
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
    
    if (item.creatorId != uid) {
      return res.json({ success: false, error: 'Item not owned by this user' });
    }
    
    if (amount) {
      const requiredPrice = Math.ceil(amount / 0.7);
      console.log(`Item price: ${item.price}, Required: ${requiredPrice}`);
      
      if (item.price !== requiredPrice) {
        return res.json({ 
          success: false, 
          error: `Price must be exactly ${requiredPrice} R$ (currently ${item.price} R$)`,
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
    
    if (item.creatorId != uid) {
      return res.json({ success: false, error: 'Item not owned by you' });
    }
    
    const requiredPrice = Math.ceil(amount / 0.7);
    
    if (item.price !== requiredPrice) {
      return res.json({ 
        success: false, 
        error: `Price must be exactly ${requiredPrice} R$ but is ${item.price} R$` 
      });
    }
    
    const price = (amount / 1000) * 7.39;
    
    if (method === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ 
          price_data: { 
            currency: 'usd', 
            product_data: { name: `${amount} Robux for ${username}` }, 
            unit_amount: Math.round(price * 100) 
          }, 
          quantity: 1 
        }],
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
        purchase_units: [{ 
          amount: { currency_code: 'USD', value: price.toFixed(2) }, 
          description: `${amount} Robux for ${username}` 
        }],
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
    let username = '';
    let amount = '';
    
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      username = session.metadata.username;
      amount = session.metadata.amount;
    }
    
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
          ${username ? `
          <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-6">
            <p class="text-sm text-zinc-500 mb-1">Username</p>
            <p class="text-white font-semibold mb-3">${username}</p>
            <p class="text-sm text-zinc-500 mb-1">Robux Amount</p>
            <p class="text-white font-semibold">${amount} R$</p>
          </div>
          ` : ''}
          <p class="text-sm text-zinc-500 mb-6">
            Your Robux will appear within 5-10 minutes.
          </p>
          <a href="/" class="inline-block bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-lg transition">
            Back to Home
          </a>
        </div>
      </body>
      </html>
    `);
  } catch (e) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Success</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 min-h-screen flex items-center justify-center p-6">
        <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <h1 class="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
          <a href="/" class="inline-block bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-lg transition mt-6">
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
      <title>Payment Cancelled</title>
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
        <p class="text-zinc-400 mb-6">No charges were made.</p>
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
    console.log('PayPal webhook received');
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
app.listen(PORT, async () => {
  console.log(`\nServer running on port ${PORT}`);
  console.log(`PayPal mode: ${paypalMode}\n`);
  
  // Test PayPal
  console.log('=== Testing PayPal ===');
  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: '1.00' },
        description: 'Test'
      }]
    });
    const testOrder = await ppClient.execute(request);
    console.log('✓ PayPal credentials valid');
  } catch (e) {
    console.error('✗ PayPal credentials invalid');
    console.error('Check PAYPAL_CLIENT_ID, PAYPAL_SECRET, and PAYPAL_MODE');
  }
  console.log('======================\n');
  
  await verifyRobloxAuth();
});