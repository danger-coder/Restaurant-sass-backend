/**
 * Public menu routes – no authentication required
 * GET /api/public/site        – site content (hero, about, contact)
 * GET /api/public/categories  – menu categories
 * GET /api/public/menu        – menu items (with filters)
 * GET /api/public/menu/:id    – single menu item
 * POST /api/public/orders     – place an order
 * GET /api/public/orders/:id  – track an order
 */

const router = require('express').Router();
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const CustomerOrder = require('../models/CustomerOrder');
const SiteContent = require('../models/SiteContent');
const User = require('../models/User');
const { emitToOwner } = require('../services/socket');

// Helper: resolve restaurant owner from ?restaurant=ownerId query param
// In a single-restaurant deployment the owner ID is set via env; in SaaS it's per-request
async function resolveOwner(req, res) {
  const ownerId = req.query.restaurant || process.env.DEFAULT_RESTAURANT_ID;
  if (!ownerId) {
    res.status(400).json({ message: 'restaurant param required' });
    return null;
  }
  return ownerId;
}

// GET /api/public/site
router.get('/site', async (req, res) => {
  try {
    const ownerId = await resolveOwner(req, res);
    if (!ownerId) return;

    let content = await SiteContent.findOne({ owner: ownerId });
    const owner = await User.findById(ownerId).select('restaurantName phone');
    if (!content) {
      content = { hero: {}, about: {}, contact: {}, social: {}, delivery: {} };
    }

    res.json({ content, restaurant: owner });
  } catch (err) {
    console.error('Public site error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/public/categories
router.get('/categories', async (req, res) => {
  try {
    const ownerId = await resolveOwner(req, res);
    if (!ownerId) return;

    const categories = await MenuCategory.find({ owner: ownerId, isActive: true })
      .sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/public/menu
router.get('/menu', async (req, res) => {
  try {
    const ownerId = await resolveOwner(req, res);
    if (!ownerId) return;

    const { category, search, featured, tag, page = 1, limit = 50 } = req.query;
    const filter = { owner: ownerId, isAvailable: true };
    if (category) filter.category = category;
    if (featured === 'true') filter.isFeatured = true;
    if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (tag) filter.tags = tag;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      MenuItem.find(filter)
        .populate('category', 'name slug icon')
        .sort({ isFeatured: -1, sortOrder: 1, name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      MenuItem.countDocuments(filter),
    ]);

    res.json({ items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/public/menu/:id
router.get('/menu/:id', async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id).populate('category', 'name slug icon');
    if (!item || !item.isAvailable) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/public/orders
router.post('/orders', async (req, res) => {
  try {
    const ownerId = await resolveOwner(req, res);
    if (!ownerId) return;

    const { customer, deliveryAddress, orderType, items, paymentMethod, specialInstructions } = req.body;

    if (!customer?.name || !customer?.email || !customer?.phone) {
      return res.status(400).json({ message: 'Customer name, email, and phone are required' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must have at least one item' });
    }

    // Validate items and calculate totals
    const orderItems = [];
    let subtotal = 0;

    for (const cartItem of items) {
      const menuItem = await MenuItem.findById(cartItem.menuItemId);
      if (!menuItem || !menuItem.isAvailable) {
        return res.status(400).json({ message: `Item "${cartItem.name}" is no longer available` });
      }
      const price = menuItem.discountedPrice || menuItem.price;
      const addonTotal = (cartItem.addons || []).reduce((sum, a) => sum + (a.price || 0), 0);
      const itemSubtotal = (price + addonTotal) * cartItem.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price,
        quantity: cartItem.quantity,
        addons: cartItem.addons || [],
        subtotal: itemSubtotal,
      });
    }

    // Get delivery settings
    const siteContent = await SiteContent.findOne({ owner: ownerId });
    const delivery = siteContent?.delivery || { fee: 50, freeAbove: 500 };
    const deliveryFee = orderType === 'delivery'
      ? (subtotal >= delivery.freeAbove ? 0 : delivery.fee)
      : 0;
    const total = subtotal + deliveryFee;

    const order = await CustomerOrder.create({
      customer,
      deliveryAddress: deliveryAddress || {},
      orderType: orderType || 'pickup',
      items: orderItems,
      subtotal,
      deliveryFee,
      total,
      paymentMethod: paymentMethod || 'cash',
      specialInstructions: specialInstructions || '',
      owner: ownerId,
    });

    // Real-time: push new order to POS, dashboard, and kitchen instantly
    emitToOwner(ownerId, 'new_order', {
      _id: order._id,
      orderNumber: order.orderNumber,
      customer: order.customer,
      items: order.items,
      total: order.total,
      orderType: order.orderType,
      status: order.status,
      paymentMethod: order.paymentMethod,
      specialInstructions: order.specialInstructions,
      source: 'website',
      createdAt: order.createdAt,
    });

    res.status(201).json({
      message: 'Order placed successfully!',
      orderNumber: order.orderNumber,
      orderId: order._id,
      total: order.total,
      estimatedTime: siteContent?.delivery?.estimatedTime || 30,
    });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/public/contact – contact form submission
router.post('/contact', async (req, res) => {
  try {
    const ownerId = await resolveOwner(req, res);
    if (!ownerId) return;

    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'name, email, and message are required' });
    }

    // Find restaurant owner email to notify them
    const owner = await User.findById(ownerId).select('email restaurantName');

    // Optionally send email notification to restaurant owner
    try {
      const { sendContactEmail } = require('../services/email');
      if (owner?.email && sendContactEmail) {
        await sendContactEmail(owner.email, owner.restaurantName, { name, email, subject, message });
        console.log(`✅ Contact email sent to ${owner.email}`);
      } else {
        console.warn('⚠️ Contact email skipped – owner email not found:', owner?.email);
      }
    } catch (emailErr) {
      console.error('❌ Contact email failed:', emailErr.message);
      // Email is best-effort; don't fail the request
    }

    res.json({ message: 'Message received! We will get back to you shortly.' });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/public/test-email – test SMTP config (remove after testing)
router.get('/test-email', async (req, res) => {
  try {
    const { sendContactEmail } = require('../services/email');
    const testTo = process.env.SMTP_USER;
    await sendContactEmail(testTo, 'Test Restaurant', {
      name: 'Test User',
      email: testTo,
      subject: 'SMTP Test',
      message: 'If you receive this, email is working correctly!',
    });
    res.json({ message: `✅ Test email sent to ${testTo}` });
  } catch (err) {
    res.status(500).json({ message: '❌ Email failed', error: err.message });
  }
});

// GET /api/public/orders – list orders by customer email or phone
router.get('/orders', async (req, res) => {
  try {
    const ownerId = await resolveOwner(req, res);
    if (!ownerId) return;

    const { email, phone } = req.query;
    if (!email && !phone) {
      return res.status(400).json({ message: 'email or phone is required' });
    }

    const filter = { owner: ownerId };
    if (email) filter['customer.email'] = email.toLowerCase().trim();
    if (phone) filter['customer.phone'] = phone.trim();

    const orders = await CustomerOrder.find(filter)
      .select('-owner')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(orders);
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/public/orders/:id – order tracking
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id)
      .select('-owner')
      .populate('items.menuItem', 'name images');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
