/**
 * Patch existing menu items with food images from Unsplash.
 * Run once: node patch-images.js
 * Safe to re-run — only updates items whose images array is empty.
 */

require('dotenv').config();
const mongoose = require('mongoose');
require('./models/MenuCategory'); // register schema for populate
const MenuItem = require('./models/MenuItem');

// Unsplash CDN — specific photo IDs chosen for each food type
const IMAGE_MAP = [
  // ── Momo ─────────────────────────────────────────────────────────────────
  {
    match: /chicken momo/i,
    images: ['https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&q=80'],
  },
  {
    match: /buff momo/i,
    images: ['https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=800&q=80'],
  },
  {
    match: /veg momo/i,
    images: ['https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&q=80'],
  },
  {
    match: /jhol momo/i,
    images: ['https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80'],
  },
  // ── Pizza ─────────────────────────────────────────────────────────────────
  {
    match: /margherita/i,
    images: ['https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80'],
  },
  {
    match: /bbq chicken pizza/i,
    images: ['https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80'],
  },
  {
    match: /veggie supreme/i,
    images: ['https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&q=80'],
  },
  // ── Drinks ────────────────────────────────────────────────────────────────
  {
    match: /mango lassi/i,
    images: ['https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&q=80'],
  },
  {
    match: /lime soda/i,
    images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80'],
  },
  {
    match: /cold coffee/i,
    images: ['https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80'],
  },
  // ── Burgers ───────────────────────────────────────────────────────────────
  {
    match: /chicken burger/i,
    images: ['https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80'],
  },
  {
    match: /veg.*burger|bean burger/i,
    images: ['https://images.unsplash.com/photo-1550317138-10000687a72b?w=800&q=80'],
  },
  // ── Desserts ──────────────────────────────────────────────────────────────
  {
    match: /brownie/i,
    images: ['https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=800&q=80'],
  },
  {
    match: /gulab jamun/i,
    images: ['https://images.unsplash.com/photo-1601303516534-bf4a3e0dc0c3?w=800&q=80'],
  },
];

// Fallback by category name for any item not matched above
const CATEGORY_FALLBACK = {
  momo:     'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&q=80',
  pizza:    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80',
  drinks:   'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80',
  burgers:  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
  desserts: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=800&q=80',
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Fetch all items, populating the category name for fallback matching
  const items = await MenuItem.find({}).populate('category', 'name');
  console.log(`📋 Found ${items.length} menu items total`);

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    if (item.images && item.images.length > 0) {
      skipped++;
      continue; // already has images
    }

    // Try name-based match first
    const nameMatch = IMAGE_MAP.find((m) => m.match.test(item.name));
    if (nameMatch) {
      await MenuItem.updateOne({ _id: item._id }, { $set: { images: nameMatch.images } });
      console.log(`  ✔ ${item.name}  →  (name match)`);
      updated++;
      continue;
    }

    // Fallback: use category name
    const catName = (item.category?.name || '').toLowerCase();
    const fallbackUrl = CATEGORY_FALLBACK[catName];
    if (fallbackUrl) {
      await MenuItem.updateOne({ _id: item._id }, { $set: { images: [fallbackUrl] } });
      console.log(`  ✔ ${item.name}  →  (category fallback: ${catName})`);
      updated++;
      continue;
    }

    console.log(`  ⚠ ${item.name}  →  no match found, skipping`);
  }

  console.log(`\n✅ Done — updated: ${updated}, already had images: ${skipped}`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
