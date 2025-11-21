const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
const ppEnv = new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET);
const ppClient = new paypal.core.PayPalHttpClient(ppEnv);

async function sendDiscordNotification(username, amount, method, price) {
  if (!discordWebhook) return;
  
  try {
    const embed = {
      title: '✅ New Purchase',
      color: 0x00ff00,
      fields: [
        { name: '👤 Username', value: username, inline: true },
        { name: '💎 Robux', value: amount.toLocaleString(), inline: true },
        { name: '💳 Method', value: method === 'stripe' ? 'Card' : 'PayPal', inline: true },
        { name: '💵 Amount', value: `$${price.toFixed(2)}`, inline: true },
        { name: '⏰ Time', value: new Date().toLocaleString(), inline: false }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'MaxBuy Purchase System' }
    };

    await axios.post(discordWebhook, {
      embeds: [embed]
    });
  } catch (e) {
    console.error('Discord notification error:', e.message);
  }
}

async function getUid(u) {
  const r = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [u] });
  return r.data.data[0]?.id;
}

app.post('/api/check-group', async (req, res) => {
  try {
    const { username } = req.body;
    const uid = await getUid(username);
    if (!uid) return res.json({ success: false, error: 'User not found' });

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Error checking user' });
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

    const price = (amount / 1000) * 5.50;

    if (method === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${amount} Robux` }, unit_amount: Math.round(price * 100) }, quantity: 1 }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
        metadata: { username, amount, uid, price: price.toFixed(2) }
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

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const { username, amount, price } = event.data.object.metadata;
      
      await sendDiscordNotification(username, parseInt(amount), 'stripe', parseFloat(price));
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
        const amount = parseInt(match[1]);
        const username = match[2];
        const price = parseFloat(capture.result.purchase_units[0].amount.value);
        
        await sendDiscordNotification(username, amount, 'paypal', price);
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