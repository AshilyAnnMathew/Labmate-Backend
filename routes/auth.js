const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if phone number already exists
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Create new user (role defaults to 'user' for public signup)
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      role: 'user' // Only patients can sign up publicly
    });

    await user.save();

    // Generate OTP for email verification
    const otp = Otp.generateOTP();

    // Save OTP to database
    const otpRecord = new Otp({
      email: user.email,
      otp,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    });

    await otpRecord.save();

    // Send OTP email
    try {
      await emailService.sendOTPVerification(user.email, otp, user.firstName);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail registration if email fails, just log it
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email with the OTP sent to your inbox.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt
        },
        requiresEmailVerification: true
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Email not verified. Please verify your email before logging in.',
        requiresEmailVerification: true,
        email: user.email
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support for assistance.',
        isBlocked: true,
        blockReason: user.blockReason || 'Account blocked by administrator'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          age: user.age,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          emergencyContact: user.emergencyContact,
          role: user.role,
          assignedLab: user.assignedLab,
          profileImage: user.profileImage,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  // Since we're using JWT, logout is handled client-side by removing the token
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// @route   PUT /api/auth/profile
// @desc    Update user profile information
// @access  Private
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phone, age, gender, dateOfBirth, address, emergencyContact } = req.body;
    const userId = req.user.id;

    // Check user exists
    const existing = await User.findById(userId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Build $set object — only include fields that are actually provided and non-empty
    const $set = {};

    if (firstName && firstName.trim()) $set.firstName = firstName.trim();
    if (lastName && lastName.trim()) $set.lastName = lastName.trim();

    // Phone: check for duplicates first
    if (phone && phone.trim() && phone.trim() !== existing.phone) {
      const phoneConflict = await User.findOne({ phone: phone.trim(), _id: { $ne: userId } });
      if (phoneConflict) {
        return res.status(400).json({ success: false, message: 'Phone number is already in use by another account.' });
      }
      $set.phone = phone.trim();
    }

    if (gender && gender.trim()) $set.gender = gender.trim();
    if (address !== undefined) $set.address = address;
    if (age !== undefined && age !== '' && age !== null) $set.age = Number(age);

    if (dateOfBirth && dateOfBirth !== '') {
      const birthDate = new Date(dateOfBirth);
      if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
        return res.status(400).json({ success: false, message: 'Invalid or future date of birth' });
      }
      $set.dateOfBirth = birthDate;
    }

    if (emergencyContact && typeof emergencyContact === 'object') {
      const { name, phone: ecPhone, relation } = emergencyContact;
      if (name || ecPhone || relation) {
        $set['emergencyContact.name'] = name || '';
        $set['emergencyContact.phone'] = ecPhone || '';
        $set['emergencyContact.relation'] = relation || '';
      }
    }

    // Use findByIdAndUpdate — avoids full-document re-validation
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set },
      { new: true, runValidators: false }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updated.toJSON()
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating profile', detail: error.message });
  }
});

// @route   POST /api/auth/check-email
// @desc    Check if email already exists
// @access  Public
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if email exists in database
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    res.json({
      success: true,
      exists: !!existingUser
    });
  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking email'
    });
  }
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/profiles/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// @route   POST /api/auth/profile-image
// @desc    Upload profile image
// @access  Private
router.post('/profile-image', authenticateToken, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      // Clean up uploaded file if user not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old profile image if exists and matches upload pattern
    if (user.profileImage && user.profileImage.startsWith('uploads/profiles/') && fs.existsSync(user.profileImage)) {
      try {
        fs.unlinkSync(user.profileImage);
      } catch (err) {
        console.error('Error deleting old profile image:', err);
      }
    }

    // Update user profile image path
    user.profileImage = req.file.path.replace(/\\/g, '/'); // Normalize path for cross-platform compatibility
    await user.save();

    res.json({
      success: true,
      message: 'Profile image updated successfully',
      data: {
        profileImage: user.profileImage
      }
    });

  } catch (error) {
    console.error('Profile image upload error:', error);
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Server error while uploading image'
    });
  }
});

module.exports = router;
