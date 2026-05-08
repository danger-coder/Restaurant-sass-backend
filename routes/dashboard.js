const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const InventoryItem = require('../models/InventoryItem');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const Staff = require('../models/Staff');
const Delivery = require('../models/Delivery');
const CustomerOrder = require('../models/CustomerOrder');
const Sale = require('../models/Sale');

// GET /api/dashboard - aggregated summary for dashboard
router.get('/', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.ownerId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Last 7 days range (for sales chart)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 6 days back + today = 7 days

    // Yesterday for comparison
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      lowStockItems,
      todayExpensesResult,
      monthExpensesResult,
      allTransactions,
      staffCount,
      pendingDeliveries,
      recentExpenses,
      pendingOrdersCount,
      todayOrdersResult,
      recentOrders,
      // Sales data
      todaySalesResult,
      monthSalesResult,
      yesterdaySalesResult,
      sevenDayExpensesChart,
      sevenDaySalesChart,
      // Order type breakdown
      orderTypeBreakdown,
      orderStatusBreakdown,
      // Top menu items (last 30 days)
      topMenuItems,
      // Cancelled orders today
      cancelledTodayResult,
    ] = await Promise.all([
      InventoryItem.find({
        user: userId,
        $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
      }).select('name quantity unit lowStockThreshold category'),

      Expense.aggregate([
        { $match: { user: userId, date: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Expense.aggregate([
        { $match: { user: userId, date: { $gte: firstOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Transaction.find({ user: userId }).select('type amount'),

      Staff.countDocuments({ user: userId }),

      Delivery.countDocuments({ user: userId, status: 'pending' }),

      Expense.find({ user: userId }).sort({ date: -1 }).limit(5),

      CustomerOrder.countDocuments({ owner: userId, status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] } }),

      CustomerOrder.aggregate([
        { $match: { owner: userId, createdAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),

      CustomerOrder.find({ owner: userId }).sort({ createdAt: -1 }).limit(8)
        .select('orderNumber customer status total orderType createdAt paymentMethod'),

      // Today's recorded sales (from Sales model)
      Sale.aggregate([
        { $match: { user: userId, date: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$totalSales' }, cash: { $sum: '$cashSales' }, online: { $sum: '$onlineSales' }, covers: { $sum: '$covers' } } },
      ]),

      // Month sales
      Sale.aggregate([
        { $match: { user: userId, date: { $gte: firstOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalSales' }, cash: { $sum: '$cashSales' }, online: { $sum: '$onlineSales' }, covers: { $sum: '$covers' } } },
      ]),

      // Yesterday sales (for % change)
      Sale.aggregate([
        { $match: { user: userId, date: { $gte: yesterday, $lt: today } } },
        { $group: { _id: null, total: { $sum: '$totalSales' } } },
      ]),

      // 7-day daily expenses for chart (single aggregate instead of N+1 loop)
      Expense.aggregate([
        { $match: { user: userId, date: { $gte: sevenDaysAgo, $lt: tomorrow } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 7-day daily sales for chart
      Sale.aggregate([
        { $match: { user: userId, date: { $gte: sevenDaysAgo, $lt: tomorrow } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            revenue: { $sum: '$totalSales' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Order type breakdown (last 30 days)
      CustomerOrder.aggregate([
        { $match: { owner: userId, createdAt: { $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$orderType', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),

      // Order status breakdown (active orders)
      CustomerOrder.aggregate([
        { $match: { owner: userId, status: { $nin: ['delivered', 'cancelled'] } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Top selling items (last 30 days)
      CustomerOrder.aggregate([
        { $match: { owner: userId, status: { $nin: ['cancelled'] }, createdAt: { $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // Cancelled orders today
      CustomerOrder.aggregate([
        { $match: { owner: userId, status: 'cancelled', createdAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),
    ]);

    // Build 7-day chart data (fill missing days with 0)
    const chartDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = sevenDaySalesChart.find((s) => s._id === key);
      const expRow = sevenDayExpensesChart.find((e) => e._id === key);
      chartDays.push({
        date: key,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        revenue: found?.revenue || 0,
        expenses: expRow?.total || 0,
      });
    }

    const totalPurchase = allTransactions
      .filter((t) => t.type === 'purchase')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalPayment = allTransactions
      .filter((t) => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);

    const todaySales = todaySalesResult[0]?.total || 0;
    const yesterdaySales = yesterdaySalesResult[0]?.total || 0;
    const salesChangePercent = yesterdaySales > 0
      ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
      : null;

    const monthRevenue = monthSalesResult[0]?.total || 0;
    const monthExpenses = monthExpensesResult[0]?.total || 0;
    const netProfit = monthRevenue - monthExpenses;

    res.json({
      // Existing fields
      lowStockCount: lowStockItems.length,
      lowStockItems,
      todayExpenses: todayExpensesResult[0]?.total || 0,
      monthExpenses,
      totalUdhaaro: totalPurchase - totalPayment,
      staffCount,
      pendingDeliveries,
      recentExpenses,
      pendingOrders: pendingOrdersCount,
      todayOrders: todayOrdersResult[0]?.count || 0,
      todayOrdersRevenue: todayOrdersResult[0]?.revenue || 0,
      recentOrders,
      // New: Sales report data
      todaySales,
      yesterdaySales,
      salesChangePercent,
      monthRevenue,
      monthCovers: monthSalesResult[0]?.covers || 0,
      todayCovers: todaySalesResult[0]?.covers || 0,
      todayCash: todaySalesResult[0]?.cash || 0,
      todayOnline: todaySalesResult[0]?.online || 0,
      netProfit,
      sevenDayChart: chartDays,
      // New: Order analytics
      orderTypeBreakdown,
      orderStatusBreakdown,
      topMenuItems,
      cancelledToday: cancelledTodayResult[0]?.count || 0,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/dashboard/messages – contact form submissions
const ContactMessage = require('../models/ContactMessage');
router.get('/messages', auth, async (req, res) => {
  try {
    const messages = await ContactMessage.find({ owner: req.ownerId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/dashboard/messages/:id/read – mark as read
router.patch('/messages/:id/read', auth, async (req, res) => {
  try {
    await ContactMessage.findOneAndUpdate(
      { _id: req.params.id, owner: req.ownerId },
      { isRead: true }
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
