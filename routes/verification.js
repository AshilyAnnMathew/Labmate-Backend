const express = require('express');
const Otp = require('../models/Otp');
const User = require('../models/User');
const emailService = require('../services/emailService');

const router = express.Router();

// @route   POST /api/verification/send-otp
// @desc    Send OTP for email verification
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists and is not already verified
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Delete any existing OTPs for this email
    await Otp.deleteMany({ email, type: 'email_verification' });

    // Generate new OTP
    const otp = Otp.generateOTP();

    // Save OTP to database
    const otpRecord = new Otp({
      email,
      otp,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    });

    await otpRecord.save();

    // Send OTP email
    await emailService.sendOTPVerification(email, otp, user.firstName);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
});

// @route   POST /api/verification/verify-otp
// @desc    Verify OTP for email verification
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Find the OTP record
    const otpRecord = await Otp.findOne({
      email,
      otp,
      type: 'email_verification',
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // Update user's email verification status
    user.isEmailVerified = true;
    await user.save();

    // Send welcome email
    await emailService.sendWelcomeEmail(email, user.firstName);

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          isEmailVerified: user.isEmailVerified
        }
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

// @route   POST /api/verification/resend-otp
// @desc    Resend OTP for email verification
// @access  Public
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists and is not already verified
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Check if there's a recent OTP (prevent spam)
    const recentOtp = await Otp.findOne({
      email,
      type: 'email_verification',
      createdAt: { $gt: new Date(Date.now() - 60000) } // 1 minute ago
    });

    if (recentOtp) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 1 minute before requesting a new OTP'
      });
    }

    // Delete any existing OTPs for this email
    await Otp.deleteMany({ email, type: 'email_verification' });

    // Generate new OTP
    const otp = Otp.generateOTP();

    // Save OTP to database
    const otpRecord = new Otp({
      email,
      otp,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    });

    await otpRecord.save();

    // Send OTP email
    await emailService.sendOTPVerification(email, otp, user.firstName);

    res.json({
      success: true,
      message: 'OTP resent successfully to your email'
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP'
    });
  }
});

module.exports = router;
