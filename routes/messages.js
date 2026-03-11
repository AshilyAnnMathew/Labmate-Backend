const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { authenticateToken: auth } = require('../middleware/auth');
const Message = require('../models/Message');
const User = require('../models/User');

async function optionalAuth(req, _res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (user) req.user = user;
    return next();
  } catch {
    // Ignore invalid token for public message submission
    return next();
  }
}

// POST /api/messages (public, optional auth)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'name, email, subject, and message are required' });
    }

    const doc = await Message.create({
      userId: req.user?.id || null,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      subject: String(subject).trim(),
      message: String(message).trim(),
      status: 'new'
    });

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// GET /api/messages (Staff/Admin)
router.get('/', auth, async (req, res) => {
  try {
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { status = 'all', page = 1, limit = 20 } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const query = {};
    if (status && status !== 'all') query.status = status;

    const [items, total] = await Promise.all([
      Message.find(query).sort({ createdAt: -1 }).skip(skip).limit(l),
      Message.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        current: p,
        pages: Math.ceil(total / l),
        total
      }
    });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// PUT /api/messages/:id/status
router.put('/:id/status', auth, async (req, res) => {
  try {
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { status } = req.body || {};
    if (!['new', 'read', 'replied'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const updated = await Message.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update message status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update message status' });
  }
});

module.exports = router;

