const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    // The "owner" userId used for scoping all DB queries (team members share the owner's data)
    req.ownerId = decoded.ownerId || decoded.userId;
    req.role = decoded.role || 'owner';
    next();
  } catch {
    res.status(401).json({ message: 'Token is invalid or expired' });
  }
};
