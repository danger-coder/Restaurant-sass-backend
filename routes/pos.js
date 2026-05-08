/**
 * POS routes – used by the in-restaurant Point of Sale system
 * All require JWT auth (staff or owner)
 *
 * POST  /api/pos/orders           – create a new order from POS
 * GET   /api/pos/orders           – get active orders (kitchen queue)
 * PATCH /api/pos/orders/:id/status – advance order status
 */

const router = require('express').Router();
const auth = require('../middleware/auth');
const CustomerOrder = require('../models/CustomerOrder');
const MenuItem = require('../models/MenuItem');
const { emitToOwner, emitToOrder } = require('../services/socket');

// POST /api/pos/orders
router.post('/orders', auth, async (req, res) => {
  try {
    const { customer, orderType, items, paymentMethod, specialInstructions, tableNumber } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must have at least one item' });
    }

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

    const customerData = customer?.name
      ? customer
      : { name: tableNumber ? `Table ${tableNumber}` : 'Walk-in', email: 'pos@local', phone: '0000000000' };

    const order = await CustomerOrder.create({
      customer: customerData,
      orderType: orderType || 'dine-in',
      items: orderItems,
      subtotal,
      deliveryFee: 0,
      total: subtotal,
      paymentMethod: paymentMethod || 'cash',
      specialInstructions: specialInstructions || '',
      // POS orders skip 'pending' – they're confirmed immediately by the cashier
      status: 'confirmed',
      owner: req.ownerId,
    });

    // Real-time: notify kitchen display and dashboard
    emitToOwner(req.ownerId, 'new_order', {
      _id: order._id,
      orderNumber: order.orderNumber,
      customer: order.customer,
      items: order.items,
      total: order.total,
      orderType: order.orderType,
      status: order.status,
      paymentMethod: order.paymentMethod,
      specialInstructions: order.specialInstructions,
      tableNumber: tableNumber || null,
      source: 'pos',
      createdAt: order.createdAt,
    });

    res.status(201).json(order);
  } catch (err) {
    console.error('POS order error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pos/orders – active orders for kitchen queue
router.get('/orders', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { owner: req.ownerId };

    if (status) {
      // Support comma-separated: ?status=confirmed,preparing
      const statuses = status.split(',').map((s) => s.trim());
      filter.status = { $in: statuses };
    } else {
      filter.status = { $in: ['confirmed', 'preparing', 'ready'] };
    }

    const orders = await CustomerOrder.find(filter).sort({ createdAt: 1 }).limit(100);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/pos/orders/:id/status
router.patch('/orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await CustomerOrder.findOneAndUpdate(
      { _id: req.params.id, owner: req.ownerId },
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Real-time: notify dashboard, POS, and customer tracking page
    emitToOwner(req.ownerId, 'order_status_changed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
    });
    emitToOrder(order._id.toString(), 'order_status_changed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
    });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
