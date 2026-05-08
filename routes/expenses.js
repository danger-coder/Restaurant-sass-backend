const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Expense = require('../models/Expense');

// GET /api/expenses
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    const query = { user: req.ownerId };
    if (category) query.category = category;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    const expenses = await Expense.find(query).sort({ date: -1 }).limit(500);
    res.json(expenses);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/expenses/summary - today and month totals
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.ownerId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const [todayResult, monthResult, categoryResult] = await Promise.all([
      Expense.aggregate([
        { $match: { user: userId, date: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { user: userId, date: { $gte: firstOfMonth, $lte: lastOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { user: userId, date: { $gte: firstOfMonth, $lte: lastOfMonth } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    res.json({
      today: todayResult[0]?.total || 0,
      month: monthResult[0]?.total || 0,
      byCategory: categoryResult,
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/expenses
router.post('/', auth, async (req, res) => {
  try {
    const { category, amount, note, date } = req.body;
    if (!category || amount === undefined) {
      return res.status(400).json({ message: 'Category and amount are required' });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    const expense = await Expense.create({
      user: req.ownerId,
      category,
      amount,
      note,
      date: date ? new Date(date) : new Date(),
    });
    res.status(201).json(expense);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/expenses/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { category, amount, note, date } = req.body;
    const update = {};
    if (category !== undefined) update.category = category;
    if (amount !== undefined) update.amount = amount;
    if (note !== undefined) update.note = note;
    if (date !== undefined) update.date = new Date(date);
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      user: req.ownerId,
    });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json({ message: 'Expense deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
