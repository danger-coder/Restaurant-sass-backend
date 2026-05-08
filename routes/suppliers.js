const router = require('express').Router();
const auth = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const Transaction = require('../models/Transaction');

// Helper: compute balance for a supplier
async function getSupplierBalance(userId, supplierId) {
  const transactions = await Transaction.find({
    user: userId,
    supplier: supplierId,
  }).select('type amount');
  const totalPurchase = transactions
    .filter((t) => t.type === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPayment = transactions
    .filter((t) => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);
  return { totalPurchase, totalPayment, udhaaro: totalPurchase - totalPayment };
}

// GET /api/suppliers
router.get('/', auth, async (req, res) => {
  try {
    const suppliers = await Supplier.find({ user: req.ownerId }).sort({ name: 1 });
    const result = await Promise.all(
      suppliers.map(async (s) => {
        const balance = await getSupplierBalance(req.ownerId, s._id);
        return { ...s.toObject(), ...balance };
      })
    );
    res.json(result);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/suppliers/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({
      _id: req.params.id,
      user: req.ownerId,
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const balance = await getSupplierBalance(req.ownerId, supplier._id);
    const transactions = await Transaction.find({
      user: req.ownerId,
      supplier: supplier._id,
    }).sort({ date: -1 });

    res.json({ ...supplier.toObject(), ...balance, transactions });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/suppliers
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, address, email, notes } = req.body;
    if (!name) return res.status(400).json({ message: 'Supplier name is required' });
    const supplier = await Supplier.create({
      user: req.ownerId,
      name,
      phone,
      address,
      email,
      notes,
    });
    res.status(201).json({ ...supplier.toObject(), totalPurchase: 0, totalPayment: 0, udhaaro: 0 });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      req.body,
      { new: true }
    );
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    const balance = await getSupplierBalance(req.ownerId, supplier._id);
    res.json({ ...supplier.toObject(), ...balance });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndDelete({
      _id: req.params.id,
      user: req.ownerId,
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
