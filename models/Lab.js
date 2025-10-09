const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  address: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'India'
    }
  },
  contact: {
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    website: {
      type: String,
      default: ''
    }
  },
  operatingHours: {
    monday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '18:00' },
      isOpen: { type: Boolean, default: true }
    },
    tuesday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '18:00' },
      isOpen: { type: Boolean, default: true }
    },
    wednesday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '18:00' },
      isOpen: { type: Boolean, default: true }
    },
    thursday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '18:00' },
      isOpen: { type: Boolean, default: true }
    },
    friday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '18:00' },
      isOpen: { type: Boolean, default: true }
    },
    saturday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '16:00' },
      isOpen: { type: Boolean, default: true }
    },
    sunday: {
      open: { type: String, default: '10:00' },
      close: { type: String, default: '14:00' },
      isOpen: { type: Boolean, default: false }
    }
  },
  facilities: [{
    type: String,
    enum: ['Parking', 'Wheelchair Access', 'WiFi', 'Waiting Area', 'Emergency Services', 'Ambulance', 'Pharmacy']
  }],
  image: {
    type: String, // URL or file path
    default: null
  },
  availableTests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test'
  }],
  availablePackages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package'
  }],
  capacity: {
    daily: {
      type: Number,
      default: 100
    },
    hourly: {
      type: Number,
      default: 10
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better search performance
labSchema.index({ name: 'text', description: 'text' });
labSchema.index({ 'address.city': 1 });
labSchema.index({ 'address.state': 1 });
labSchema.index({ isActive: 1 });

module.exports = mongoose.model('Lab', labSchema);
