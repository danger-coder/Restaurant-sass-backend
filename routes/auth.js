const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/email');

// Helper: build JWT + user object for response
function buildUserPayload(user) {
  // ownerId scopes all DB queries – team members share their restaurant owner's data
  const ownerId = user.parentUser ? user.parentUser.toString() : user._id.toString();
  return {
    token: jwt.sign(
      { userId: user._id, ownerId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    ),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      restaurantName: user.restaurantName,
      phone: user.phone,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      subscription: user.subscription,
    },
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, restaurantName, phone } = req.body;
    if (!name || !email || !password || !restaurantName)
      return res.status(400).json({ message: 'Please fill all required fields' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser)
      return res.status(400).json({ message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      restaurantName,
      phone,
      role: 'owner',
    });

    res.status(201).json(buildUserPayload(user));
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Please provide email and password' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    res.json(buildUserPayload(user));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -resetPasswordToken -resetPasswordExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond success to prevent user enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ message: 'Token and new password are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' });

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = null;
    user.resetPasswordExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/invite-team  (owner only)
// Invite a team member (manager or staff) to the restaurant
router.post('/invite-team', auth, async (req, res) => {
  try {
    if (req.role !== 'owner') {
      return res.status(403).json({ message: 'Only owners can invite team members' });
    }
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: 'name, email, password, role are required' });
    if (!['manager', 'staff'].includes(role))
      return res.status(400).json({ message: 'Role must be manager or staff' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    // Get owner's restaurant name
    const owner = await User.findById(req.userId).select('restaurantName');

    const hashedPassword = await bcrypt.hash(password, 12);
    const member = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      restaurantName: owner.restaurantName,
      role,
      parentUser: req.userId,
    });

    res.status(201).json({
      id: member._id,
      name: member.name,
      email: member.email,
      role: member.role,
    });
  } catch (err) {
    console.error('Invite team error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/team  (owner only – list their team members)
router.get('/team', auth, async (req, res) => {
  try {
    if (req.role !== 'owner') {
      return res.status(403).json({ message: 'Only owners can view team members' });
    }
    const members = await User.find({ parentUser: req.userId }).select('-password -resetPasswordToken -resetPasswordExpiry');
    res.json(members);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/auth/team/:id  (owner only)
router.delete('/team/:id', auth, async (req, res) => {
  try {
    if (req.role !== 'owner') {
      return res.status(403).json({ message: 'Only owners can remove team members' });
    }
    const member = await User.findOneAndDelete({ _id: req.params.id, parentUser: req.userId });
    if (!member) return res.status(404).json({ message: 'Team member not found' });
    res.json({ message: 'Team member removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
