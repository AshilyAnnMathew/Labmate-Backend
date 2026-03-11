const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken: auth } = require('../middleware/auth');

// Helper to log audit actions
const createAuditLog = async (action, bookingId, performedBy, labId, details = '', sampleId = null, testId = null) => {
    try {
        await AuditLog.create({ action, bookingId, performedBy, labId, details, sampleId, testId, ipAddress: '' });
    } catch (error) {
        console.error('Failed to create audit log:', error);
    }
};

// @route   POST /api/samples/collect/:bookingId
// @desc    Generate a sample ID and barcode for a booking, marking tests as sample collected
// @access  Local Admin and Staff only
router.post('/collect/:bookingId', auth, async (req, res) => {
    try {
        const { role } = req.user;
        if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const booking = await Booking.findById(req.params.bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // ── Date validation: only allow sample collection on appointment day ──
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const appointmentDay = new Date(booking.appointmentDate);
        appointmentDay.setHours(0, 0, 0, 0);

        if (appointmentDay.getTime() > today.getTime()) {
            return res.status(400).json({
                success: false,
                message: `Sample cannot be collected before the appointment date (${appointmentDay.toLocaleDateString()}). Patient has not arrived yet.`
            });
        }

        if (appointmentDay.getTime() < today.getTime()) {
            // Auto-flag past uncollected bookings as no_show
            booking.status = 'no_show';
            booking.updatedAt = new Date();
            await booking.save();
            await createAuditLog('no_show', booking._id, req.user.id, booking.labId, `Booking auto-flagged as no-show (appointment was ${appointmentDay.toLocaleDateString()})`);
            return res.status(400).json({
                success: false,
                message: `Appointment date has passed (${appointmentDay.toLocaleDateString()}). Booking has been marked as "No Show".`
            });
        }

        const { sampleType, collectedBy } = req.body;

        // Generate unique sample IDs for EACH test and package
        const newSamples = [];
        const timestamp = Date.now().toString().slice(-4);

        // Handle Standalone Tests
        (booking.selectedTests || []).forEach((t, index) => {
            const shortId = uuidv4().split('-')[0].toUpperCase();
            newSamples.push({
                sampleId: `SMP-${shortId}-${timestamp}-${index + 1}`,
                tests: [t.testId],
                packages: [],
                status: 'processing',
                sampleType: sampleType || 'Blood',
                collectedAt: new Date(),
                collectedBy: req.user.id // Default to requester if not provided
            });
        });

        // Handle Packages
        (booking.selectedPackages || []).forEach((p, index) => {
            const shortId = uuidv4().split('-')[0].toUpperCase();
            newSamples.push({
                sampleId: `PKG-${shortId}-${timestamp}-${index + 1}`,
                tests: [],
                packages: [p.packageId],
                status: 'processing',
                sampleType: sampleType || 'Blood',
                collectedAt: new Date(),
                collectedBy: req.user.id
            });
        });

        if (newSamples.length === 0) {
            return res.status(400).json({ success: false, message: 'No tests or packages found to collect.' });
        }

        booking.samples.push(...newSamples);
        booking.status = 'sample_collected';
        await booking.save();

        await createAuditLog('sample_collected', booking._id, req.user.id, booking.labId, `${newSamples.length} samples (${sampleType}) collected for booking`);

        res.json({
            success: true,
            message: `${newSamples.length} samples collected and IDs generated.`,
            data: { samples: newSamples, booking }
        });
    } catch (error) {
        console.error('Error collecting sample:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/samples/active/:labId
// @desc    Get all active samples for the Sample Tracking Panel
// @access  Local Admin and Staff only
router.get('/active/:labId', auth, async (req, res) => {
    try {
        const { labId } = req.params;

        // Fetch bookings that have samples and are not fully verified/cancelled
        const bookings = await Booking.find({
            labId,
            isActive: true,
            status: { $in: ['sample_collected', 'processing', 'partially_completed'] },
            'samples.0': { $exists: true }
        })
            .populate('userId', 'firstName lastName')
            .populate('selectedTests.testId', 'name')
            .select('userId samples status testResults selectedTests selectedPackages');

        // Flatten into a list of samples for the frontend table
        const activeSamples = [];
        bookings.forEach(booking => {
            booking.samples.forEach(sample => {
                if (sample.status !== 'verified') {
                    activeSamples.push({
                        bookingId: booking._id,
                        patientName: booking.userId ? `${booking.userId.firstName} ${booking.userId.lastName}` : 'Unknown',
                        ...sample.toObject(),
                        // Calculate progress based on testResults array matching this sample's tests
                        totalTests: sample.tests.length,
                        completedTests: booking.testResults.filter(tr =>
                            sample.tests.some(st => st.toString() === tr.testId.toString()) &&
                            (tr.status === 'completed' || tr.status === 'verified')
                        ).length
                    });
                }
            });
        });

        res.json({
            success: true,
            data: activeSamples
        });
    } catch (error) {
        console.error('Error fetching active samples:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
