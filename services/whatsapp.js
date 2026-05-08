const axios = require('axios');

/**
 * Send a WhatsApp message via Twilio or Meta Cloud API.
 * Set WHATSAPP_PROVIDER=twilio or WHATSAPP_PROVIDER=meta in .env
 */
async function sendWhatsAppMessage(to, message) {
  const provider = process.env.WHATSAPP_PROVIDER || 'twilio';

  if (provider === 'twilio') {
    // Twilio WhatsApp
    // Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886

    if (!sid || !token || !from) {
      console.warn('WhatsApp (Twilio) credentials not configured.');
      return false;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({
      From: from,
      To: `whatsapp:${to}`,
      Body: message,
    });

    await axios.post(url, params.toString(), {
      auth: { username: sid, password: token },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return true;
  }

  if (provider === 'meta') {
    // Meta Cloud API (WhatsApp Business)
    // Requires: META_WA_TOKEN, META_WA_PHONE_ID
    const token = process.env.META_WA_TOKEN;
    const phoneId = process.env.META_WA_PHONE_ID;

    if (!token || !phoneId) {
      console.warn('WhatsApp (Meta) credentials not configured.');
      return false;
    }

    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
        type: 'text',
        text: { body: message },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return true;
  }

  return false;
}

/**
 * Send low-stock alert to the restaurant owner
 */
async function sendLowStockAlert(whatsappPhone, restaurantName, items) {
  const lines = items.map((i) => `• ${i.name}: ${i.quantity} ${i.unit} left`).join('\n');
  const message = `⚠️ Low Stock Alert – ${restaurantName}\n\n${lines}\n\nPlease reorder soon.`;
  return sendWhatsAppMessage(whatsappPhone, message);
}

/**
 * Send daily P&L summary
 */
async function sendDailySummary(whatsappPhone, restaurantName, { revenue, expenses, profit }) {
  const message =
    `📊 Daily Summary – ${restaurantName}\n` +
    `Date: ${new Date().toLocaleDateString('en-NP')}\n\n` +
    `Revenue:  रू ${revenue.toFixed(2)}\n` +
    `Expenses: रू ${expenses.toFixed(2)}\n` +
    `Profit:   रू ${profit.toFixed(2)}`;
  return sendWhatsAppMessage(whatsappPhone, message);
}

module.exports = { sendWhatsAppMessage, sendLowStockAlert, sendDailySummary };
