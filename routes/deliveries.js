const router = require('express').Router();
const auth = require('../middleware/auth');
const Delivery = require('../models/Delivery');
const Supplier = require('../models/Supplier');

// GET /api/deliveries
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const query = { user: req.ownerId };
    if (status) query.status = status;
    const deliveries = await Delivery.find(query)
      .populate('supplier', 'name phone')
      .sort({ date: -1 });
    res.json(deliveries);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/deliveries
router.post('/', auth, async (req, res) => {
  try {
    const { itemName, quantity, unit, supplier, date, expectedDate, notes } = req.body;
    if (!itemName || quantity === undefined) {
      return res.status(400).json({ message: 'Item name and quantity are required' });
    }

    // If supplier provided, verify it belongs to user
    if (supplier) {
      const supplierDoc = await Supplier.findOne({ _id: supplier, user: req.ownerId });
      if (!supplierDoc) return res.status(404).json({ message: 'Supplier not found' });
    }

    const delivery = await Delivery.create({
      user: req.ownerId,
      itemName,
      quantity,
      unit,
      supplier: supplier || null,
      date: date ? new Date(date) : new Date(),
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes,
    });
    await delivery.populate('supplier', 'name phone');
    res.status(201).json(delivery);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/deliveries/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { itemName, quantity, unit, supplier, date, expectedDate, notes, status } = req.body;
    const update = {};
    if (itemName !== undefined) update.itemName = itemName;
    if (quantity !== undefined) update.quantity = quantity;
    if (unit !== undefined) update.unit = unit;
    if (supplier !== undefined) update.supplier = supplier || null;
    if (date !== undefined) update.date = new Date(date);
    if (expectedDate !== undefined) update.expectedDate = expectedDate ? new Date(expectedDate) : null;
    if (notes !== undefined) update.notes = notes;
    if (status !== undefined) update.status = status;
    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      { $set: update },
      { new: true, runValidators: true }
    ).populate('supplier', 'name phone');
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    res.json(delivery);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/deliveries/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const delivery = await Delivery.findOneAndDelete({
      _id: req.params.id,
      user: req.ownerId,
    });
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    res.json({ message: 'Delivery deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
