const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Test name is required'],
    trim: true,
    maxlength: [100, 'Test name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Test description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Test category is required'],
    enum: {
      values: ['blood', 'urine', 'imaging', 'cardiology', 'pathology'],
      message: 'Category must be one of: blood, urine, imaging, cardiology, pathology'
    }
  },
  price: {
    type: Number,
    required: [true, 'Test price is required'],
    min: [0, 'Price cannot be negative']
  },
  duration: {
    type: String,
    required: [true, 'Test duration is required'],
    trim: true,
    maxlength: [50, 'Duration cannot exceed 50 characters']
  },
  preparation: {
    type: String,
    trim: true,
    maxlength: [500, 'Preparation instructions cannot exceed 500 characters']
  },
  // Result fields define the structure of outputs captured for this test
  resultFields: [
    {
      label: { type: String, trim: true, required: false },
      unit: { type: String, trim: true, default: '' },
      referenceRange: { type: String, trim: true, default: '' },
      type: {
        type: String,
        enum: ['text', 'number', 'boolean'],
        default: 'text'
      },
      required: { type: Boolean, default: false }
    }
  ],
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
testSchema.index({ category: 1, isActive: 1 });
testSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Test', testSchema);
