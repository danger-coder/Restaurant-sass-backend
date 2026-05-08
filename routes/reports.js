const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Staff = require('../models/Staff');
const CustomerOrder = require('../models/CustomerOrder');

/**
 * GET /api/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD&period=month|week|day
 *
 * Returns a Profit & Loss summary for the given date range:
 * - Revenue (from Sales entries)
 * - Expenses broken down by category
 * - Staff salary cost (prorated for the period if needed)
 * - Gross profit = Revenue - Cost of Goods (purchases from transactions)
 * - Net profit  = Revenue - all expenses - salaries
 * - Daily breakdown for charting
 */
router.get('/pnl', auth, async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.ownerId);

    // Default to current month
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const from = req.query.from ? new Date(req.query.from) : defaultFrom;
    const to = req.query.to
      ? (() => { const d = new Date(req.query.to); d.setHours(23, 59, 59, 999); return d; })()
      : defaultTo;

    // Validate date inputs
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // Revenue (Sales entries + CustomerOrders not cancelled)
    const [revenueResult, orderRevenueResult, expensesByCategory, dailySales, dailyOrders, dailyExpenses] = await Promise.all([
      Sale.aggregate([
        { $match: { user: ownerId, date: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalSales' },
            cashRevenue: { $sum: '$cashSales' },
            onlineRevenue: { $sum: '$onlineSales' },
            totalCovers: { $sum: '$covers' },
          },
        },
      ]),

      // Revenue from customer orders (online/POS)
      CustomerOrder.aggregate([
        { $match: { owner: ownerId, status: { $nin: ['cancelled'] }, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),

      // Expenses by category
      Expense.aggregate([
        { $match: { user: ownerId, date: { $gte: from, $lte: to } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),

      // Daily revenue for chart
      Sale.aggregate([
        { $match: { user: ownerId, date: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            revenue: { $sum: '$totalSales' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Daily order revenue for chart
      CustomerOrder.aggregate([
        { $match: { owner: ownerId, status: { $nin: ['cancelled'] }, createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Daily expenses for chart
      Expense.aggregate([
        { $match: { user: ownerId, date: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            expenses: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const manualRevenue = revenueResult[0]?.totalRevenue || 0;
    const orderRevenue = orderRevenueResult[0]?.total || 0;
    const totalRevenue = manualRevenue + orderRevenue;
    const totalExpenses = expensesByCategory.reduce((s, c) => s + c.total, 0);

    // Staff salary cost for the period (monthly salary prorated by days)
    const staffList = await Staff.find({ user: ownerId }).select('salary');
    const monthlyPayroll = staffList.reduce((s, m) => s + m.salary, 0);
    const periodDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;
    const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    const proratedPayroll = (monthlyPayroll / daysInMonth) * periodDays;

    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = grossProfit - proratedPayroll;

    // Merge daily data for chart (sales + orders + expenses)
    const dailyMap = {};
    dailySales.forEach((d) => {
      dailyMap[d._id] = { date: d._id, revenue: d.revenue, expenses: 0 };
    });
    dailyOrders.forEach((d) => {
      if (!dailyMap[d._id]) dailyMap[d._id] = { date: d._id, revenue: 0, expenses: 0 };
      dailyMap[d._id].revenue += d.revenue;
    });
    dailyExpenses.forEach((d) => {
      if (!dailyMap[d._id]) dailyMap[d._id] = { date: d._id, revenue: 0, expenses: 0 };
      dailyMap[d._id].expenses = d.expenses;
    });
    const daily = Object.values(dailyMap)
      .map((d) => ({ ...d, profit: d.revenue - d.expenses }))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    res.json({
      period: { from, to },
      revenue: {
        total: totalRevenue,
        manual: manualRevenue,
        orders: orderRevenue,
        cash: revenueResult[0]?.cashRevenue || 0,
        online: revenueResult[0]?.onlineRevenue || 0,
        covers: revenueResult[0]?.totalCovers || 0,
      },
      expenses: {
        total: totalExpenses,
        byCategory: expensesByCategory.map((c) => ({ category: c._id, amount: c.total })),
      },
      payroll: {
        monthly: monthlyPayroll,
        prorated: Math.round(proratedPayroll),
        staffCount: staffList.length,
      },
      grossProfit: Math.round(grossProfit),
      netProfit: Math.round(netProfit),
      profitMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0,
      daily,
    });
  } catch (err) {
    console.error('P&L error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
