const router = require('express').Router();
const auth = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Supplier = require('../models/Supplier');

// GET /api/transactions
router.get('/', auth, async (req, res) => {
  try {
    const { supplierId, type, startDate, endDate } = req.query;
    const query = { user: req.ownerId };
    if (supplierId) query.supplier = supplierId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    const transactions = await Transaction.find(query)
      .populate('supplier', 'name')
      .sort({ date: -1 })
      .limit(200);
    res.json(transactions);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/transactions/udhaaro - total udhaaro summary
router.get('/udhaaro', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.ownerId }).select('type amount');
    const totalPurchase = transactions
      .filter((t) => t.type === 'purchase')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalPayment = transactions
      .filter((t) => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);
    res.json({ totalPurchase, totalPayment, totalUdhaaro: totalPurchase - totalPayment });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/transactions
router.post('/', auth, async (req, res) => {
  try {
    const { supplier, type, amount, date, notes, items } = req.body;
    if (!supplier || !type || amount === undefined) {
      return res.status(400).json({ message: 'Supplier, type, and amount are required' });
    }
    if (!['purchase', 'payment'].includes(type)) {
      return res.status(400).json({ message: 'Type must be purchase or payment' });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Verify supplier belongs to this user
    const supplierDoc = await Supplier.findOne({ _id: supplier, user: req.ownerId });
    if (!supplierDoc) return res.status(404).json({ message: 'Supplier not found' });

    const transaction = await Transaction.create({
      user: req.ownerId,
      supplier,
      type,
      amount,
      date: date ? new Date(date) : new Date(),
      notes,
      items: items || [],
    });
    await transaction.populate('supplier', 'name');
    res.status(201).json(transaction);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { type, amount, date, notes, items } = req.body;
    const update = {};
    if (type !== undefined) update.type = type;
    if (amount !== undefined) update.amount = amount;
    if (date !== undefined) update.date = new Date(date);
    if (notes !== undefined) update.notes = notes;
    if (items !== undefined) update.items = items;
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      { $set: update },
      { new: true, runValidators: true }
    ).populate('supplier', 'name');
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json(transaction);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.ownerId,
    });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json({ message: 'Transaction deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
