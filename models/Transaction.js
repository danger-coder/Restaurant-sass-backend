const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    type: {
      type: String,
      enum: ['purchase', 'payment'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    notes: { type: String },
    items: [
      {
        name: { type: String },
        quantity: { type: Number },
        unit: { type: String },
        pricePerUnit: { type: Number },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
