const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    restaurantName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },

    // Multi-user roles
    role: {
      type: String,
      enum: ['owner', 'manager', 'staff'],
      default: 'owner',
    },
    // Link team members back to the restaurant owner
    parentUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Super admin flag
    isSuperAdmin: { type: Boolean, default: false },

    // Password reset
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpiry: { type: Date, default: null },

    // Subscription
    subscription: {
      plan: { type: String, enum: ['free', 'basic', 'pro'], default: 'free' },
      expiresAt: { type: Date, default: null },
      esewaRefId: { type: String, default: null },
    },

    // WhatsApp alerts config
    whatsappAlerts: {
      enabled: { type: Boolean, default: false },
      phone: { type: String, default: null }, // WhatsApp number with country code
      lowStock: { type: Boolean, default: true },
      dailySummary: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
