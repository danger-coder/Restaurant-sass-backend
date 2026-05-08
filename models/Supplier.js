const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Supplier', supplierSchema);
