// backend/middleware/auth.js
// Shared authentication middleware used across all routes
const jwt = require('jsonwebtoken');
const { attachAuditLogger } = require('../utils/audit');

/**
 * Verify JWT from Authorization header (Bearer <token>)
 * Attaches decoded user to req.user
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token is not valid' });
        req.user = user;
        attachAuditLogger(req, res);
        next();
    });
};

/**
 * Require Admin role — must be used AFTER authenticateToken
 */
const isAdmin = (req, res, next) => {
    const role = req.user?.role || req.user?.Role;
    if (role === 'Admin') {
        return next();
    }
    res.status(403).json({ success: false, message: 'Permission denied. Admin access required.' });
};

module.exports = { authenticateToken, isAdmin };
