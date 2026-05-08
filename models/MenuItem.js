const mongoose = require('mongoose');

const addonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
});

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuCategory', required: true },
    price: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, default: null },
    images: [{ type: String }],
    tags: [{ type: String }], // e.g. ['bestseller', 'spicy', 'veg']
    addons: [addonSchema],
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    preparationTime: { type: Number, default: 15 }, // minutes
    calories: { type: Number, default: null },
    sortOrder: { type: Number, default: 0 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

menuItemSchema.index({ owner: 1, category: 1 });
menuItemSchema.index({ owner: 1, isAvailable: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
