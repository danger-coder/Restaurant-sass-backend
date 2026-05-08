const mongoose = require('mongoose');

const menuCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    icon: { type: String, default: '🍽️' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Link to restaurant owner for multi-tenant SaaS
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

menuCategorySchema.index({ owner: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('MenuCategory', menuCategorySchema);
