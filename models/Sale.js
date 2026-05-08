const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now },
    totalSales: { type: Number, required: true, min: 0 },
    cashSales: { type: Number, default: 0, min: 0 },
    onlineSales: { type: Number, default: 0, min: 0 },
    covers: { type: Number, default: 0, min: 0 }, // number of customers / covers
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

// Index for fast date range queries
saleSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('Sale', saleSchema);
