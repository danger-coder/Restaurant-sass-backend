const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  addons: [{ name: String, price: Number }],
  subtotal: { type: Number, required: true },
});

const customerOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },
    deliveryAddress: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      note: { type: String, default: '' },
    },
    orderType: { type: String, enum: ['delivery', 'pickup', 'dine-in'], default: 'pickup' },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: { type: String, enum: ['cash', 'esewa', 'card'], default: 'cash' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    specialInstructions: { type: String, default: '' },
    estimatedTime: { type: Number, default: 30 }, // minutes
    // Restaurant owner scope
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Auto-generate order number before save
// Uses timestamp (base-36) + random suffix to avoid race conditions with countDocuments
customerOrderSchema.pre('save', function (next) {
  if (!this.orderNumber) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    this.orderNumber = `ORD-${ts}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('CustomerOrder', customerOrderSchema);
