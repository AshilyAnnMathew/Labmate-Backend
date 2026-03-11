const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: [
            'status_update',
            'sample_collected',
            'result_entered',
            'report_uploaded',
            'report_verified',
            'payment_processed'
        ]
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    sampleId: {
        type: String, // UUID of the specific sample, if applicable
        default: null
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Test',
        default: null
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    labId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        required: true
    },
    details: {
        type: String,
        default: ''
    },
    ipAddress: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for common queries
auditLogSchema.index({ labId: 1, createdAt: -1 });
auditLogSchema.index({ bookingId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
