const router = require('express').Router();
const crypto = require('crypto');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { sendSubscriptionEmail } = require('../services/email');

/**
 * eSewa Payment Integration (Nepal)
 *
 * Flow:
 * 1. POST /api/subscriptions/initiate  → returns form params to POST to eSewa
 * 2. eSewa redirects to success/failure URL
 * 3. GET  /api/subscriptions/verify?oid=&amt=&refId= → verify payment with eSewa
 *
 * Environment variables needed:
 *   ESEWA_MERCHANT_CODE  – your eSewa merchant code (e.g. EPAYTEST for sandbox)
 *   ESEWA_VERIFY_URL     – https://uat.esewa.com.np/epay/transrec  (sandbox)
 *                        – https://esewa.com.np/epay/transrec       (production)
 *   ESEWA_PAY_URL        – https://uat.esewa.com.np/epay/main       (sandbox)
 *                        – https://esewa.com.np/epay/main            (production)
 */

const PLANS = {
  basic: { price: 499, label: 'Basic', days: 30 },
  pro:   { price: 999, label: 'Pro',   days: 30 },
};

// GET /api/subscriptions/plans
router.get('/plans', (req, res) => {
  res.json(PLANS);
});

// POST /api/subscriptions/initiate
// Body: { plan: 'basic' | 'pro' }
// Returns the eSewa payment form parameters the frontend should POST
router.post('/initiate', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ message: 'Invalid plan. Choose basic or pro.' });

    const planDetails = PLANS[plan];
    const orderId = `RM-${req.userId}-${plan}-${Date.now()}`;

    const failureUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/subscription/failure`;
    // Success URL goes to the frontend which then calls the verify API with the token
    const successUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/subscription/success?plan=${plan}`;

    res.json({
      payUrl: process.env.ESEWA_PAY_URL || 'https://uat.esewa.com.np/epay/main',
      params: {
        amt: planDetails.price,
        psc: 0,
        pdc: 0,
        txAmt: 0,
        tAmt: planDetails.price,
        pid: orderId,
        scd: process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST',
        su: successUrl,
        fu: failureUrl,
      },
      plan,
      amount: planDetails.price,
      label: planDetails.label,
    });
  } catch (err) {
    console.error('eSewa initiate error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/subscriptions/verify?oid=&amt=&refId=&plan=
// Called by the frontend's success page after eSewa redirect.
// The frontend passes the query params received from eSewa along with the user's JWT.
router.get('/verify', auth, async (req, res) => {
  try {
    const { oid, amt, refId, plan } = req.query;

    if (!oid || !amt || !refId || !plan)
      return res.status(400).json({ message: 'Missing payment parameters' });

    const planDetails = PLANS[plan];
    if (!planDetails) return res.status(400).json({ message: 'Invalid plan' });

    // Verify amount matches (compare as integers to avoid floating-point issues)
    if (Math.round(parseFloat(amt)) !== planDetails.price)
      return res.status(400).json({ message: 'Amount mismatch' });

    // Idempotency: reject if this refId was already used
    const alreadyUsed = await User.findOne({ 'subscription.esewaRefId': refId });
    if (alreadyUsed)
      return res.status(400).json({ message: 'This payment has already been applied' });

    // Verify with eSewa
    const verifyUrl = process.env.ESEWA_VERIFY_URL || 'https://uat.esewa.com.np/epay/transrec';
    const verifyResponse = await axios.get(verifyUrl, {
      params: {
        amt,
        rid: refId,
        pid: oid,
        scd: process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST',
      },
    });

    const isSuccess = verifyResponse.data.includes('<response_code>Success</response_code>');
    if (!isSuccess) return res.status(400).json({ message: 'Payment verification failed' });

    // Activate subscription
    const expiresAt = new Date(Date.now() + planDetails.days * 24 * 60 * 60 * 1000);
    const user = await User.findByIdAndUpdate(
      req.userId,
      { 'subscription.plan': plan, 'subscription.expiresAt': expiresAt, 'subscription.esewaRefId': refId },
      { new: true }
    ).select('-password');

    // Send confirmation email (non-blocking)
    sendSubscriptionEmail(user.email, user.name, plan, expiresAt).catch(() => {});

    res.json({
      message: 'Subscription activated',
      plan,
      expiresAt,
      user: { id: user._id, subscription: user.subscription },
    });
  } catch (err) {
    console.error('eSewa verify error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/subscriptions/status  – current user's subscription
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('subscription');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { plan, expiresAt } = user.subscription;
    const isActive = plan !== 'free' && expiresAt && new Date(expiresAt) > new Date();

    res.json({
      plan,
      expiresAt,
      isActive,
      daysLeft: isActive ? Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
