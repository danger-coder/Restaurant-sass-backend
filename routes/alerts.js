const router = require('express').Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const InventoryItem = require('../models/InventoryItem');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const { sendLowStockAlert, sendDailySummary } = require('../services/whatsapp');

// GET /api/alerts/settings – get current WhatsApp alert config
router.get('/settings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('whatsappAlerts');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.whatsappAlerts);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/alerts/settings – update WhatsApp alert config
router.put('/settings', auth, async (req, res) => {
  try {
    const { enabled, phone, lowStock, dailySummary } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        'whatsappAlerts.enabled': enabled !== undefined ? enabled : undefined,
        'whatsappAlerts.phone': phone,
        'whatsappAlerts.lowStock': lowStock !== undefined ? lowStock : undefined,
        'whatsappAlerts.dailySummary': dailySummary !== undefined ? dailySummary : undefined,
      },
      { new: true, runValidators: true }
    ).select('whatsappAlerts');
    res.json(user.whatsappAlerts);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/alerts/test-whatsapp – send a test WhatsApp message
router.post('/test-whatsapp', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('whatsappAlerts name restaurantName');
    if (!user?.whatsappAlerts?.phone) {
      return res.status(400).json({ message: 'WhatsApp phone number not configured' });
    }

    const { sendWhatsAppMessage } = require('../services/whatsapp');
    const ok = await sendWhatsAppMessage(
      user.whatsappAlerts.phone,
      `✅ Test message from Restaurant Manager!\nNamaste ${user.name}, your WhatsApp alerts are configured correctly for ${user.restaurantName}.`
    );

    if (!ok) return res.status(503).json({ message: 'WhatsApp provider not configured on server. Check WHATSAPP_PROVIDER env vars.' });
    res.json({ message: 'Test message sent' });
  } catch (err) {
    console.error('Test WhatsApp error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/alerts/send-low-stock – manually trigger low-stock alert
router.post('/send-low-stock', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('whatsappAlerts restaurantName');
    if (!user?.whatsappAlerts?.enabled || !user?.whatsappAlerts?.phone) {
      return res.status(400).json({ message: 'WhatsApp alerts not enabled or phone not set' });
    }

    const lowItems = await InventoryItem.find({
      user: req.ownerId,
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
    }).select('name quantity unit');

    if (!lowItems.length) return res.json({ message: 'No low stock items' });

    await sendLowStockAlert(user.whatsappAlerts.phone, user.restaurantName, lowItems);
    res.json({ message: `Low stock alert sent for ${lowItems.length} item(s)` });
  } catch (err) {
    console.error('Low stock alert error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/alerts/send-daily-summary – manually trigger daily summary
router.post('/send-daily-summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('whatsappAlerts restaurantName');
    if (!user?.whatsappAlerts?.enabled || !user?.whatsappAlerts?.phone) {
      return res.status(400).json({ message: 'WhatsApp alerts not enabled or phone not set' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [salesResult, expenseResult] = await Promise.all([
      Sale.aggregate([
        { $match: { user: req.ownerId, date: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$totalSales' } } },
      ]),
      Expense.aggregate([
        { $match: { user: req.ownerId, date: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const revenue = salesResult[0]?.total || 0;
    const expenses = expenseResult[0]?.total || 0;
    const profit = revenue - expenses;

    await sendDailySummary(user.whatsappAlerts.phone, user.restaurantName, { revenue, expenses, profit });
    res.json({ message: 'Daily summary sent', revenue, expenses, profit });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
