const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: function() {
      return this.provider === 'local';
    },
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        if (!v) return this.provider !== 'local'; // Allow empty for Google OAuth users
        return v.length >= 1;
      },
      message: 'First name is required for local users'
    }
  },
  lastName: {
    type: String,
    required: function() {
      return this.provider === 'local';
    },
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        if (!v) return this.provider !== 'local'; // Allow empty for Google OAuth users
        return v.length >= 1;
      },
      message: 'Last name is required for local users'
    }
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: function() {
      return this.provider === 'local';
    },
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty for Google OAuth users
        return /^[\+]?[0-9][\d]{7,15}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  age: {
    type: Number,
    min: [0, 'Age cannot be negative'],
    max: [150, 'Age cannot exceed 150']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    trim: true
  },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Date of birth cannot be in the future'
    }
  },
  address: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  emergencyContact: {
    type: String,
    trim: true,
    maxlength: [100, 'Emergency contact cannot exceed 100 characters']
  },
  password: {
    type: String,
    required: function() {
      return this.provider === 'local';
    },
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    enum: ['user', 'staff', 'lab_technician', 'xray_technician', 'local_admin', 'admin'],
    default: 'user'
  },
  department: {
    type: String,
    trim: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  assignedLab: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    default: null
  },
  // Google OAuth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  },
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockReason: {
    type: String,
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Auto-update age when date of birth changes
userSchema.pre('save', function(next) {
  if (this.isModified('dateOfBirth') && this.dateOfBirth) {
    this.updateAgeFromDateOfBirth();
  }
  next();
});

// Virtual field to calculate age from date of birth
userSchema.virtual('calculatedAge').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Method to update age based on date of birth
userSchema.methods.updateAgeFromDateOfBirth = function() {
  if (this.dateOfBirth) {
    this.age = this.calculatedAge;
  }
};

// Method to check if profile is complete
userSchema.methods.isProfileComplete = function() {
  return !!(this.age || this.dateOfBirth) && !!(this.gender) && !!(this.address);
};

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Index for faster queries (email is already unique, so no need for separate index)
userSchema.index({ phone: 1 });

module.exports = mongoose.model('User', userSchema);
