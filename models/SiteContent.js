const mongoose = require('mongoose');

// Dynamic site content for homepage/about/contact – controlled by admin
const siteContentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    hero: {
      headline: { type: String, default: 'Authentic Flavors, Unforgettable Moments' },
      subheadline: { type: String, default: 'Fresh ingredients, traditional recipes, and a passion for great food.' },
      cta: { type: String, default: 'Order Now' },
      backgroundImage: { type: String, default: '' },
    },
    about: {
      title: { type: String, default: 'Our Story' },
      description: { type: String, default: 'We are a family restaurant dedicated to serving fresh, authentic dishes.' },
      image: { type: String, default: '' },
      foundedYear: { type: String, default: '2020' },
      chefName: { type: String, default: '' },
    },
    contact: {
      address: { type: String, default: 'Kathmandu, Nepal' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      openingHours: { type: String, default: 'Mon–Sun: 10:00 AM – 10:00 PM' },
      mapEmbedUrl: { type: String, default: '' },
    },
    social: {
      facebook: { type: String, default: '' },
      instagram: { type: String, default: '' },
      tiktok: { type: String, default: '' },
    },
    delivery: {
      isEnabled: { type: Boolean, default: true },
      fee: { type: Number, default: 50 },
      freeAbove: { type: Number, default: 500 },
      estimatedTime: { type: Number, default: 30 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteContent', siteContentSchema);
