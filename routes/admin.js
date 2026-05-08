const router = require('express').Router();
const bcrypt = require('bcryptjs');
const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');

/**
 * Super Admin Panel routes – all require isSuperAdmin: true
 */

// GET /api/admin/users – list all restaurant owners (paginated)
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { parentUser: null }; // owners only
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { restaurantName: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -resetPasswordExpiry')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/stats – platform-wide stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalOwners, totalTeamMembers, planCounts] = await Promise.all([
      User.countDocuments({ parentUser: null, isSuperAdmin: false }),
      User.countDocuments({ parentUser: { $ne: null } }),
      User.aggregate([
        { $match: { parentUser: null } },
        { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
      ]),
    ]);

    const plans = { free: 0, basic: 0, pro: 0 };
    planCounts.forEach((p) => { if (plans[p._id] !== undefined) plans[p._id] = p.count; });

    res.json({ totalOwners, totalTeamMembers, plans });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/users/:id – single user details
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const teamCount = await User.countDocuments({ parentUser: user._id });
    res.json({ ...user.toObject(), teamCount });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/admin/users/:id/subscription – manually set subscription
router.patch('/users/:id/subscription', adminAuth, async (req, res) => {
  try {
    const { plan, days = 30 } = req.body;
    if (!['free', 'basic', 'pro'].includes(plan))
      return res.status(400).json({ message: 'Invalid plan' });

    const expiresAt = plan === 'free' ? null : new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 'subscription.plan': plan, 'subscription.expiresAt': expiresAt },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Subscription updated', subscription: user.subscription });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id – delete a user account (and their team)
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isSuperAdmin) return res.status(403).json({ message: 'Cannot delete a super admin' });

    // Delete team members too
    await User.deleteMany({ parentUser: user._id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User and their team deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/create-superadmin – bootstrap first super admin
// Only works if there are ZERO super admins (one-time setup)
router.post('/create-superadmin', async (req, res) => {
  try {
    const { name, email, password, secretKey } = req.body;
    if (secretKey !== process.env.SUPER_ADMIN_SECRET) {
      return res.status(403).json({ message: 'Invalid secret key' });
    }

    const existing = await User.findOne({ isSuperAdmin: true });
    if (existing) return res.status(400).json({ message: 'Super admin already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      restaurantName: 'Platform Admin',
      role: 'owner',
      isSuperAdmin: true,
    });

    res.status(201).json({ message: 'Super admin created', id: admin._id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
