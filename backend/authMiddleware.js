const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tsms_secure_secret_key_123';

function generateToken(user, role) {
  return jwt.sign({ id: user.id || user.username, role, fullName: user.fullName || user.full_name }, JWT_SECRET, { expiresIn: '12h' });
}

function verifyToken(req, res, next) {
  let token = null;
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    const tokenCookie = cookies.find(c => c.startsWith('tsms_jwt='));
    if (tokenCookie) {
      token = tokenCookie.split('=')[1];
    }
  }
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: "Access Denied. No token provided." });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden. Insufficient permissions." });
    }
    next();
  };
}

module.exports = { generateToken, verifyToken, requireRole };