/**
 * Admin Menu Management routes
 * All require JWT auth (restaurant owner)
 */

const router = require('express').Router();
const auth = require('../middleware/auth');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const CustomerOrder = require('../models/CustomerOrder');
const SiteContent = require('../models/SiteContent');
const { emitToOwner, emitToOrder } = require('../services/socket');

// ─── CATEGORIES ─────────────────────────────────────────────────────────────

// GET /api/menu/categories
router.get('/categories', auth, async (req, res) => {
  try {
    const cats = await MenuCategory.find({ owner: req.ownerId }).sort({ sortOrder: 1, name: 1 });
    res.json(cats);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/menu/categories
router.post('/categories', auth, async (req, res) => {
  try {
    const { name, description, image, icon, sortOrder } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    const cat = await MenuCategory.create({ name, slug, description, image, icon, sortOrder: sortOrder || 0, owner: req.ownerId });
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Category with this name already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/menu/categories/:id
router.put('/categories/:id', auth, async (req, res) => {
  try {
    const { name, description, image, icon, sortOrder, isActive } = req.body;
    const update = { description, image, icon, sortOrder, isActive };
    if (name) { update.name = name; update.slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''); }
    const cat = await MenuCategory.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, update, { new: true });
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    res.json(cat);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/menu/categories/:id
router.delete('/categories/:id', auth, async (req, res) => {
  try {
    const itemCount = await MenuItem.countDocuments({ category: req.params.id, owner: req.ownerId });
    if (itemCount > 0) return res.status(400).json({ message: `Cannot delete: ${itemCount} items in this category` });
    await MenuCategory.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
    res.json({ message: 'Category deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ─── MENU ITEMS ─────────────────────────────────────────────────────────────

// GET /api/menu/items
router.get('/items', auth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const filter = { owner: req.ownerId };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      MenuItem.find(filter).populate('category', 'name slug icon').sort({ sortOrder: 1, name: 1 }).skip(skip).limit(parseInt(limit)),
      MenuItem.countDocuments(filter),
    ]);
    res.json({ items, total });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/menu/items
router.post('/items', auth, async (req, res) => {
  try {
    const { name, description, category, price, discountedPrice, images, tags, addons, isAvailable, isFeatured, preparationTime, calories, sortOrder } = req.body;
    if (!name || !category || price === undefined) return res.status(400).json({ message: 'Name, category, and price are required' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
    const item = await MenuItem.create({ name, slug, description, category, price, discountedPrice, images: images || [], tags: tags || [], addons: addons || [], isAvailable: isAvailable !== false, isFeatured: isFeatured || false, preparationTime: preparationTime || 15, calories, sortOrder: sortOrder || 0, owner: req.ownerId });
    const populated = await item.populate('category', 'name slug icon');
    emitToOwner(req.ownerId, 'menu_updated', { action: 'create', type: 'item', item: populated });
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/menu/items/:id
router.put('/items/:id', auth, async (req, res) => {
  try {
    const fields = ['name', 'description', 'category', 'price', 'discountedPrice', 'images', 'tags', 'addons', 'isAvailable', 'isFeatured', 'preparationTime', 'calories', 'sortOrder'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    if (update.name) update.slug = update.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
    const item = await MenuItem.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, update, { new: true }).populate('category', 'name slug icon');
    if (!item) return res.status(404).json({ message: 'Item not found' });
    emitToOwner(req.ownerId, 'menu_updated', { action: 'update', type: 'item', item });
    res.json(item);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/menu/items/:id
router.delete('/items/:id', auth, async (req, res) => {
  try {
    await MenuItem.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
    emitToOwner(req.ownerId, 'menu_updated', { action: 'delete', type: 'item', itemId: req.params.id });
    res.json({ message: 'Item deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ─── CUSTOMER ORDERS ─────────────────────────────────────────────────────────

// GET /api/menu/orders
router.get('/orders', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { owner: req.ownerId };
    if (status) filter.status = status;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      CustomerOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      CustomerOrder.countDocuments(filter),
    ]);
    res.json({ orders, total });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/menu/orders/:id/status
router.patch('/orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const order = await CustomerOrder.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { status }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Real-time: notify POS, kitchen, dashboard, and customer tracking
    emitToOwner(req.ownerId, 'order_status_changed', { orderId: order._id, orderNumber: order.orderNumber, status: order.status });
    emitToOrder(order._id.toString(), 'order_status_changed', { orderId: order._id, orderNumber: order.orderNumber, status: order.status });
    res.json(order);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ─── SITE CONTENT ───────────────────────────────────────────────────────────

// GET /api/menu/site-content
router.get('/site-content', auth, async (req, res) => {
  try {
    let content = await SiteContent.findOne({ owner: req.ownerId });
    if (!content) content = await SiteContent.create({ owner: req.ownerId });
    res.json(content);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/menu/site-content
router.put('/site-content', auth, async (req, res) => {
  try {
    const { hero, about, contact, social, delivery } = req.body;
    const update = {};
    if (hero) update.hero = hero;
    if (about) update.about = about;
    if (contact) update.contact = contact;
    if (social) update.social = social;
    if (delivery) update.delivery = delivery;
    const content = await SiteContent.findOneAndUpdate({ owner: req.ownerId }, { $set: update }, { new: true, upsert: true });
    res.json(content);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
