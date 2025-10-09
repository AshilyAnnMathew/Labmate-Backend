const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Lab information
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true
  },
  
  // Selected tests and packages
  selectedTests: [{
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true
    },
    testName: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  }],
  
  selectedPackages: [{
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Package',
      required: true
    },
    packageName: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  }],
  
  // Appointment details
  appointmentDate: {
    type: Date,
    required: true
  },
  appointmentTime: {
    type: String,
    required: true
  },
  
  // Payment information
  paymentMethod: {
    type: String,
    enum: ['pay_now', 'pay_later'],
    required: true
  },
  
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Razorpay payment details
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpaySignature: {
    type: String,
    default: null
  },
  
  // Pricing
  totalAmount: {
    type: Number,
    required: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  
  // Booking status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // Additional information
  notes: {
    type: String,
    default: ''
  },
  
  // User location at time of booking
  userLocation: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Update the updatedAt field before saving
bookingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Index for better query performance
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ labId: 1, appointmentDate: 1 });
bookingSchema.index({ status: 1, appointmentDate: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
