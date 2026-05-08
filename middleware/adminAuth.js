const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('isSuperAdmin');
    if (!user || !user.isSuperAdmin) {
      return res.status(403).json({ message: 'Super admin access required' });
    }
    req.userId = decoded.userId;
    req.role = 'superadmin';
    next();
  } catch {
    res.status(401).json({ message: 'Token is invalid or expired' });
  }
};
