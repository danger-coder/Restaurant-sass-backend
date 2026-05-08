const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true },
    salary: { type: Number, required: true, min: 0 },
    phone: { type: String, trim: true },
    joinDate: { type: Date, default: Date.now },
    attendance: [
      {
        date: { type: Date, required: true },
        status: {
          type: String,
          enum: ['present', 'absent', 'half-day'],
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Staff', staffSchema);
