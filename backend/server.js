const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const c = process.env.ROBLOX_COOKIE;
const g = process.env.GROUP_ID;
const ppEnv = new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);
const ppClient = new paypal.core.PayPalHttpClient(ppEnv);

async function getUid(u) {
  const r = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [u] });
  return r.data.data[0]?.id;
}

async function checkGroup(uid) {
  try {
    const r = await axios.get(`https://groups.roblox.com/v2/users/${uid}/groups/roles`);
    const m = r.data.data.find(x => x.group.id == g);
    if (!m) return { valid: false, msg: 'Not in group' };
    return { valid: true };
  } catch (e) {
    return { valid: false, msg: 'Error checking group' };
  }
}

async function payout(uid, amt) {
  const x = await axios.post(`https://groups.roblox.com/v1/groups/${g}/payouts`, {
    PayoutType: 'FixedAmount',
    Recipients: [{ recipientId: uid, recipientType: 'User', amount: amt }]
  }, {
    headers: { 'Cookie': `.ROBLOSECURITY=${c}`, 'Content-Type': 'application/json', 'x-csrf-token': '' }
  }).catch(async e => {
    if (e.response?.headers['x-csrf-token']) {
      const t = e.response.headers['x-csrf-token'];
      return axios.post(`https://groups.roblox.com/v1/groups/${g}/payouts`, {
        PayoutType: 'FixedAmount',
        Recipients: [{ recipientId: uid, recipientType: 'User', amount: amt }]
      }, {
        headers: { 'Cookie': `.ROBLOSECURITY=${c}`, 'Content-Type': 'application/json', 'x-csrf-token': t }
      });
    }
    throw e;
  });
  return x.data;
}

app.post('/api/check-group', async (req, res) => {
  try {
    const { username } = req.body;
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const chk = await checkGroup(uid);
    if (!chk.valid) return res.json({ success: false, error: chk.msg });
    
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Error checking group' });
  }
});

app.post('/api/create-payment', async (req, res) => {
  try {
    const { username, amount, method } = req.body;
    
    if (amount < 1000) {
      return res.json({ success: false, error: 'Minimum 1,000 Robux' });
    }
    
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });
    
    const chk = await checkGroup(uid);
    if (!chk.valid) return res.json({ success: false, error: chk.msg });
    
    const price = (amount / 1000) * 5.50;
    
    if (method === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${amount} Robux` }, unit_amount: Math.round(price * 100) }, quantity: 1 }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
        metadata: { username, amount, uid }
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
      const { username, amount, uid } = event.data.object.metadata;
      await payout(parseInt(uid), parseInt(amount));
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/webhook/paypal', async (req, res) => {
  try {
    const request = new paypal.orders.OrdersCaptureRequest(req.body.resource.id);
    const capture = await ppClient.execute(request);
    if (capture.result.status === 'COMPLETED') {
      const match = capture.result.purchase_units[0].description.match(/(\d+) Robux for (\w+)/);
      if (match) {
        const uid = await getUid(match[2]);
        await payout(uid, parseInt(match[1]));
      }
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