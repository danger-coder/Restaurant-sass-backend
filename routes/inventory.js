const router = require('express').Router();
const auth = require('../middleware/auth');
const InventoryItem = require('../models/InventoryItem');

// GET /api/inventory - get all items for user
router.get('/', auth, async (req, res) => {
  try {
    const items = await InventoryItem.find({ user: req.ownerId }).sort({ name: 1 });
    res.json(items);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/inventory/low-stock - items at or below threshold
router.get('/low-stock', auth, async (req, res) => {
  try {
    const items = await InventoryItem.find({
      user: req.ownerId,
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
    }).select('name quantity unit lowStockThreshold category');
    res.json(items);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/inventory - create item
router.post('/', auth, async (req, res) => {
  try {
    const { name, category, unit, quantity, lowStockThreshold, pricePerUnit } = req.body;
    if (!name || !unit) {
      return res.status(400).json({ message: 'Name and unit are required' });
    }
    const item = await InventoryItem.create({
      user: req.ownerId,
      name,
      category: category || '',
      unit,
      quantity: quantity || 0,
      lowStockThreshold: lowStockThreshold !== undefined ? lowStockThreshold : 10,
      pricePerUnit: pricePerUnit || 0,
    });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/inventory/:id - update item
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, category, unit, quantity, lowStockThreshold, pricePerUnit } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (category !== undefined) update.category = category;
    if (unit !== undefined) update.unit = unit;
    if (quantity !== undefined) update.quantity = quantity;
    if (lowStockThreshold !== undefined) update.lowStockThreshold = lowStockThreshold;
    if (pricePerUnit !== undefined) update.pricePerUnit = pricePerUnit;
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await InventoryItem.findOneAndDelete({
      _id: req.params.id,
      user: req.ownerId,
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
