const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Package name is required'],
    trim: true,
    maxlength: [100, 'Package name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Package description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  price: {
    type: Number,
    required: [true, 'Package price is required'],
    min: [0, 'Price cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  selectedTests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  }],
  duration: {
    type: String,
    trim: true,
    maxlength: [50, 'Duration cannot exceed 50 characters']
  },
  benefits: {
    type: String,
    trim: true,
    maxlength: [500, 'Benefits cannot exceed 500 characters']
  },
  image: {
    type: String, // URL or file path
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
packageSchema.index({ isActive: 1 });
packageSchema.index({ name: 'text', description: 'text' });

// Virtual for total savings
packageSchema.virtual('totalSavings').get(function() {
  return this.discount || 0;
});

// Ensure virtual fields are serialized
packageSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Package', packageSchema);
