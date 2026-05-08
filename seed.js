/**
 * Seed script – creates sample menu categories and items for a restaurant owner.
 * Usage:
 *   node seed.js <ownerEmail>
 * Example:
 *   node seed.js testuser@test.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const MenuCategory = require('./models/MenuCategory');
const MenuItem = require('./models/MenuItem');
const SiteContent = require('./models/SiteContent');

const CATEGORIES = [
  { name: 'Momo', icon: '🥟', description: 'Steamed and fried dumplings', sortOrder: 1 },
  { name: 'Pizza', icon: '🍕', description: 'Wood-fired artisan pizzas', sortOrder: 2 },
  { name: 'Drinks', icon: '🥤', description: 'Fresh juices, lassi and beverages', sortOrder: 3 },
  { name: 'Burgers', icon: '🍔', description: 'Juicy gourmet burgers', sortOrder: 4 },
  { name: 'Desserts', icon: '🍰', description: 'Sweet endings', sortOrder: 5 },
];

function makeSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
}

async function seed(ownerEmail) {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const owner = await User.findOne({ email: ownerEmail.toLowerCase() });
  if (!owner) { console.error(`❌ User "${ownerEmail}" not found`); process.exit(1); }
  console.log(`🍽️  Seeding for: ${owner.restaurantName} (${owner.email})`);

  // Remove existing seed data for this owner
  await MenuCategory.deleteMany({ owner: owner._id });
  await MenuItem.deleteMany({ owner: owner._id });
  console.log('🗑️  Cleared existing menu data');

  // Create categories
  const catDocs = await Promise.all(
    CATEGORIES.map((c) => MenuCategory.create({ ...c, slug: c.name.toLowerCase().replace(/\s+/g, '-'), owner: owner._id }))
  );
  const catMap = Object.fromEntries(catDocs.map((c) => [c.name, c._id]));
  console.log(`📦 Created ${catDocs.length} categories`);

  const IMG = {
    chickenMomo:  ['https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&q=80'],
    buffMomo:     ['https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=800&q=80'],
    vegMomo:      ['https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&q=80'],
    jholMomo:     ['https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80'],
    margherita:   ['https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80'],
    bbqPizza:     ['https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80'],
    veggiePizza:  ['https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&q=80'],
    mangoLassi:   ['https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&q=80'],
    limeSoda:     ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80'],
    coldCoffee:   ['https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80'],
    chickenBurger:['https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80'],
    vegBurger:    ['https://images.unsplash.com/photo-1550317138-10000687a72b?w=800&q=80'],
    brownie:      ['https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=800&q=80'],
    gulabJamun:   ['https://images.unsplash.com/photo-1601303516534-bf4a3e0dc0c3?w=800&q=80'],
  };

  const ITEMS = [
    // Momo
    { name: 'Chicken Momo (10 pcs)', category: catMap['Momo'], price: 180, images: IMG.chickenMomo, description: 'Juicy chicken stuffed steamed momo, served with spicy chutney.', tags: ['bestseller'], isFeatured: true, addons: [{ name: 'Extra Chutney', price: 20 }, { name: 'Cheese', price: 40 }] },
    { name: 'Buff Momo (10 pcs)', category: catMap['Momo'], price: 160, images: IMG.buffMomo, description: 'Traditional buffalo momo with aromatic spices.', tags: ['popular'], isFeatured: false },
    { name: 'Veg Momo (10 pcs)', category: catMap['Momo'], price: 140, discountedPrice: 120, images: IMG.vegMomo, description: 'Fresh vegetable momo — light, healthy, delicious.', tags: ['veg'] },
    { name: 'Jhol Momo', category: catMap['Momo'], price: 220, images: IMG.jholMomo, description: 'Steamed momo served in rich sesame-tomato broth.', tags: ['bestseller'], isFeatured: true },
    // Pizza
    { name: 'Margherita Pizza', category: catMap['Pizza'], price: 450, images: IMG.margherita, description: 'Classic tomato sauce, fresh mozzarella, and basil.', tags: ['veg', 'popular'], isFeatured: true, addons: [{ name: 'Extra Cheese', price: 60 }, { name: 'Olives', price: 40 }] },
    { name: 'BBQ Chicken Pizza', category: catMap['Pizza'], price: 550, discountedPrice: 499, images: IMG.bbqPizza, description: 'Smoky BBQ sauce, grilled chicken, red onion, and bell peppers.', tags: ['bestseller'], isFeatured: true },
    { name: 'Veggie Supreme', category: catMap['Pizza'], price: 480, images: IMG.veggiePizza, description: 'Loaded with capsicum, mushrooms, olives, and jalapeños.', tags: ['veg'] },
    // Drinks
    { name: 'Mango Lassi', category: catMap['Drinks'], price: 120, images: IMG.mangoLassi, description: 'Creamy yogurt-based mango drink — refreshing and thick.', tags: ['popular'], isFeatured: false },
    { name: 'Fresh Lime Soda', category: catMap['Drinks'], price: 80, images: IMG.limeSoda, description: 'Zesty fresh lime with soda water. Sweet or salted.', addons: [{ name: 'Sweet', price: 0 }, { name: 'Salted', price: 0 }] },
    { name: 'Cold Coffee', category: catMap['Drinks'], price: 150, images: IMG.coldCoffee, description: 'Chilled blended coffee with vanilla ice cream.', tags: ['bestseller'] },
    // Burgers
    { name: 'Classic Chicken Burger', category: catMap['Burgers'], price: 280, images: IMG.chickenBurger, description: 'Crispy fried chicken with lettuce, tomato, and mayo.', tags: ['popular'], isFeatured: true, addons: [{ name: 'Extra Patty', price: 100 }, { name: 'Cheese Slice', price: 40 }] },
    { name: 'Veg Bean Burger', category: catMap['Burgers'], price: 240, images: IMG.vegBurger, description: 'Spiced black bean patty with fresh salsa.', tags: ['veg'] },
    // Desserts
    { name: 'Chocolate Brownie', category: catMap['Desserts'], price: 180, images: IMG.brownie, description: 'Warm fudgy brownie served with vanilla ice cream.', tags: ['popular'], isFeatured: true, addons: [{ name: 'Extra Scoop', price: 60 }] },
    { name: 'Gulab Jamun (4 pcs)', category: catMap['Desserts'], price: 120, images: IMG.gulabJamun, description: 'Soft milk-solid dumplings soaked in rose-scented syrup.', tags: ['traditional'] },
  ];

  await Promise.all(
    ITEMS.map((item) => MenuItem.create({ ...item, slug: makeSlug(item.name), isAvailable: true, owner: owner._id }))
  );
  console.log(`🍽️  Created ${ITEMS.length} menu items`);

  // Seed site content
  await SiteContent.findOneAndUpdate(
    { owner: owner._id },
    {
      owner: owner._id,
      hero: { headline: `Welcome to ${owner.restaurantName}`, subheadline: 'Fresh ingredients, traditional recipes, and a passion for great food — served with love.', cta: 'Order Now' },
      about: { title: 'Our Story', description: `${owner.restaurantName} was born from a love of authentic Nepali cuisine. We blend traditional recipes with modern presentation to bring you the very best.`, foundedYear: '2020' },
      contact: { address: 'Thamel, Kathmandu, Nepal', openingHours: 'Mon – Sun: 10:00 AM – 10:00 PM' },
      delivery: { isEnabled: true, fee: 50, freeAbove: 500, estimatedTime: 30 },
    },
    { upsert: true }
  );
  console.log('📝 Site content seeded');

  console.log('\n✅ Seed complete!');
  console.log(`\n🔑 Add to backend .env:\n   DEFAULT_RESTAURANT_ID=${owner._id}`);
  console.log(`🔑 Add to frontend .env.local:\n   NEXT_PUBLIC_RESTAURANT_ID=${owner._id}`);

  await mongoose.disconnect();
}

const email = process.argv[2];
if (!email) { console.error('Usage: node seed.js <ownerEmail>'); process.exit(1); }
seed(email).catch((e) => { console.error(e); process.exit(1); });
