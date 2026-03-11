const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken: auth } = require('../middleware/auth');

// POST /api/push/subscribe - Save push subscription
router.post('/subscribe', auth, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: 'Invalid subscription object' });
        }

        await User.findByIdAndUpdate(req.user.id, {
            pushSubscription: subscription
        });

        res.json({ success: true, message: 'Push subscription saved' });
    } catch (error) {
        console.error('Push subscribe error:', error);
        res.status(500).json({ success: false, message: 'Failed to save subscription' });
    }
});

// DELETE /api/push/unsubscribe - Remove push subscription
router.delete('/unsubscribe', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, {
            $unset: { pushSubscription: 1 }
        });

        res.json({ success: true, message: 'Push subscription removed' });
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove subscription' });
    }
});

// GET /api/push/vapid-key - Get VAPID public key
router.get('/vapid-key', (req, res) => {
    res.json({
        success: true,
        publicKey: process.env.VAPID_PUBLIC_KEY || ''
    });
});

module.exports = router;
