const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticateToken: auth } = require('../middleware/auth');

// @route   GET /api/audit-logs/lab/:labId
// @desc    Get audit logs for a specific lab
// @access  Local Admin and Staff only
router.get('/lab/:labId', auth, async (req, res) => {
    try {
        const { role } = req.user;
        const { labId } = req.params;
        const { page = 1, limit = 50, action } = req.query;

        if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only staff and local admins can view audit logs.'
            });
        }

        let effectiveAssignedLab = req.user.assignedLab;
        if (!effectiveAssignedLab) {
            const User = require('../models/User');
            const dbUser = await User.findById(req.user.id).select('assignedLab');
            effectiveAssignedLab = dbUser?.assignedLab;
        }

        if (effectiveAssignedLab?.toString() !== labId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view logs for your assigned lab.'
            });
        }

        const query = { labId: labId };
        if (action && action !== 'all') {
            query.action = action;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AuditLog.find(query)
            .populate('performedBy', 'firstName lastName email')
            .populate({
                path: 'bookingId',
                select: 'userId',
                populate: { path: 'userId', select: 'firstName lastName' }
            })
            .populate('testId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await AuditLog.countDocuments(query);

        res.json({
            success: true,
            data: logs,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total: total
            }
        });

    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching audit logs'
        });
    }
});

module.exports = router;
