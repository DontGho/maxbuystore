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

async function getShirtInfo(url) {
  const match = url.match(/catalog\/(\d+)/);
  if (!match) return null;
  const id = match[1];
  
  try {
    const r = await axios.get(`https://economy.roblox.com/v2/assets/${id}/details`);
    return { id, price: r.data.PriceInRobux, creator: r.data.Creator };
  } catch (e) {
    return null;
  }
}

async function buyShirt(shirtId, price) {
  try {
    const r = await axios.post(
      `https://economy.roblox.com/v1/purchases/products/${shirtId}`,
      { expectedCurrency: 1, expectedPrice: price, expectedSellerId: 0 },
      { headers: { 'Cookie': `.ROBLOSECURITY=${c}`, 'Content-Type': 'application/json', 'x-csrf-token': '' }}
    ).catch(async e => {
      if (e.response?.headers['x-csrf-token']) {
        const t = e.response.headers['x-csrf-token'];
        return axios.post(
          `https://economy.roblox.com/v1/purchases/products/${shirtId}`,
          { expectedCurrency: 1, expectedPrice: price, expectedSellerId: 0 },
          { headers: { 'Cookie': `.ROBLOSECURITY=${c}`, 'Content-Type': 'application/json', 'x-csrf-token': t }}
        );
      }
      throw e;
    });
    return r.data;
  } catch (e) {
    throw new Error('Failed to buy shirt');
  }
}

app.post('/api/verify-shirt', async (req, res) => {
  try {
    const { username, shirtUrl } = req.body;
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const shirt = await getShirtInfo(shirtUrl);
    if (!shirt) return res.json({ success: false, error: 'Invalid shirt link' });
    
    if (shirt.creator.Id != uid && shirt.creator.CreatorTargetId != uid) {
      return res.json({ success: false, error: 'Shirt not owned by this user' });
    }
    
    res.json({ success: true, price: shirt.price });
  } catch (e) {
    res.json({ success: false, error: 'Error verifying shirt' });
  }
});

app.post('/api/create-payment', async (req, res) => {
  try {
    const { username, amount, shirtUrl, method } = req.body;
    
    if (amount < 1000) {
      return res.json({ success: false, error: 'Minimum 1,000 Robux' });
    }
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const shirt = await getShirtInfo(shirtUrl);
    if (!shirt) return res.json({ success: false, error: 'Invalid shirt link' });
    
    if (shirt.creator.Id != uid && shirt.creator.CreatorTargetId != uid) {
      return res.json({ success: false, error: 'Shirt not owned by you' });
    }
    
    const requiredPrice = Math.ceil(amount / 0.7);
    if (shirt.price < requiredPrice) {
      return res.json({ success: false, error: `Shirt price too low. Set to ${requiredPrice} Robux` });
    }
    
    const price = (amount / 1000) * 5.50;
    
    if (method === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${amount} Robux` }, unit_amount: Math.round(price * 100) }, quantity: 1 }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
        metadata: { username, amount, shirtUrl, shirtId: shirt.id, shirtPrice: shirt.price }
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

app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const { shirtId, shirtPrice } = event.data.object.metadata;
      await buyShirt(shirtId, shirtPrice);
      console.log(`Bought shirt ${shirtId} for ${shirtPrice} Robux`);
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
    
    const orderId = req.body.resource.id;
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    const capture = await ppClient.execute(request);
    
    if (capture.result.status === 'COMPLETED') {
      console.log('PayPal payment completed - manually buy the shirt');
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(process.env.PORT || 3000);