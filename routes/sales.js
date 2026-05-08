const router = require('express').Router();
const auth = require('../middleware/auth');
const Sale = require('../models/Sale');

// GET /api/sales?from=&to=&limit=
router.get('/', auth, async (req, res) => {
  try {
    const { from, to, limit = 30 } = req.query;
    const filter = { user: req.ownerId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.date.$lte = toDate;
      }
    }
    const sales = await Sale.find(filter)
      .sort({ date: -1 })
      .limit(parseInt(limit));
    res.json(sales);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/sales
router.post('/', auth, async (req, res) => {
  try {
    const { date, totalSales, cashSales, onlineSales, covers, note } = req.body;
    if (totalSales === undefined || totalSales < 0)
      return res.status(400).json({ message: 'totalSales is required and must be >= 0' });

    const sale = await Sale.create({
      user: req.ownerId,
      date: date ? new Date(date) : new Date(),
      totalSales,
      cashSales: cashSales || 0,
      onlineSales: onlineSales || 0,
      covers: covers || 0,
      note,
    });
    res.status(201).json(sale);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/sales/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { date, totalSales, cashSales, onlineSales, covers, note } = req.body;
    const update = {};
    if (date !== undefined) update.date = new Date(date);
    if (totalSales !== undefined) update.totalSales = totalSales;
    if (cashSales !== undefined) update.cashSales = cashSales;
    if (onlineSales !== undefined) update.onlineSales = onlineSales;
    if (covers !== undefined) update.covers = covers;
    if (note !== undefined) update.note = note;
    const sale = await Sale.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/sales/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const sale = await Sale.findOneAndDelete({ _id: req.params.id, user: req.ownerId });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json({ message: 'Sale deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
