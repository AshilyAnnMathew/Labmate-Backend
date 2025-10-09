const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Lab = require('../models/Lab');
const { authenticateToken: auth } = require('../middleware/auth');

// @route   POST /api/bookings
// @desc    Create a new booking
// @access  Private (All authenticated users)
router.post('/', auth, async (req, res) => {
  try {
    const {
      labId,
      selectedTests,
      selectedPackages,
      appointmentDate,
      appointmentTime,
      paymentMethod,
      notes,
      userLocation
    } = req.body;

    // Validate required fields
    if (!labId || !appointmentDate || !appointmentTime || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Lab ID, appointment date, time, and payment method are required'
      });
    }

    // Validate that at least one test or package is selected
    if ((!selectedTests || selectedTests.length === 0) && 
        (!selectedPackages || selectedPackages.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'At least one test or package must be selected'
      });
    }

    // Validate lab exists and is active
    const lab = await Lab.findById(labId);
    if (!lab || !lab.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or inactive'
      });
    }

    // Calculate total amount
    let totalAmount = 0;
    
    // Add test prices
    if (selectedTests && selectedTests.length > 0) {
      totalAmount += selectedTests.reduce((sum, test) => sum + (test.price || 0), 0);
    }
    
    // Add package prices
    if (selectedPackages && selectedPackages.length > 0) {
      totalAmount += selectedPackages.reduce((sum, pkg) => sum + (pkg.price || 0), 0);
    }

    // Create booking data
    const bookingData = {
      userId: req.user.id,
      labId,
      selectedTests: selectedTests || [],
      selectedPackages: selectedPackages || [],
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      paymentMethod,
      totalAmount,
      notes: notes || '',
      userLocation: userLocation || null,
      status: 'pending'
    };

    // Set payment status based on payment method
    if (paymentMethod === 'pay_now') {
      bookingData.paymentStatus = 'pending';
    } else {
      bookingData.paymentStatus = 'pending';
    }

    // Create booking
    const booking = new Booking(bookingData);
    await booking.save();

    // Populate the booking with lab details
    await booking.populate('labId', 'name address contact');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating booking'
    });
  }
});

// @route   GET /api/bookings
// @desc    Get user's bookings
// @access  Private (All authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    // Build query
    let query = { userId: req.user.id, isActive: true };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bookings = await Booking.find(query)
      .populate('labId', 'name address contact')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total
      }
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get a single booking
// @access  Private (All authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isActive: true
    })
    .populate('labId', 'name address contact operatingHours')
    .populate('selectedTests.testId', 'name description category duration')
    .populate('selectedPackages.packageId', 'name description selectedTests');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching booking'
    });
  }
});

// @route   PUT /api/bookings/:id
// @desc    Update booking (cancel or reschedule)
// @access  Private (All authenticated users)
router.put('/:id', auth, async (req, res) => {
  try {
    const { status, appointmentDate, appointmentTime, notes } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isActive: true
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Only allow certain updates
    if (status) {
      if (['cancelled'].includes(status)) {
        booking.status = status;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid status update'
        });
      }
    }

    if (appointmentDate) {
      booking.appointmentDate = new Date(appointmentDate);
    }

    if (appointmentTime) {
      booking.appointmentTime = appointmentTime;
    }

    if (notes !== undefined) {
      booking.notes = notes;
    }

    await booking.save();

    await booking.populate('labId', 'name address contact');

    res.json({
      success: true,
      message: 'Booking updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating booking'
    });
  }
});

// @route   POST /api/bookings/:id/payment
// @desc    Process payment for booking
// @access  Private (All authenticated users)
router.post('/:id/payment', auth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isActive: true
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.paymentMethod !== 'pay_now') {
      return res.status(400).json({
        success: false,
        message: 'This booking does not require immediate payment'
      });
    }

    // Update payment details
    booking.razorpayOrderId = razorpayOrderId;
    booking.razorpayPaymentId = razorpayPaymentId;
    booking.razorpaySignature = razorpaySignature;
    booking.paymentStatus = 'completed';
    booking.paidAmount = booking.totalAmount;

    await booking.save();

    await booking.populate('labId', 'name address contact');

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: booking
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while processing payment'
    });
  }
});

// @route   DELETE /api/bookings/:id
// @desc    Cancel/Delete booking (soft delete)
// @access  Private (All authenticated users)
router.delete('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isActive: true
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be cancelled
    const appointmentDate = new Date(booking.appointmentDate);
    const now = new Date();
    const hoursUntilAppointment = (appointmentDate - now) / (1000 * 60 * 60);

    if (hoursUntilAppointment < 24) {
      return res.status(400).json({
        success: false,
        message: 'Booking cannot be cancelled less than 24 hours before appointment'
      });
    }

    // Soft delete
    booking.isActive = false;
    booking.status = 'cancelled';
    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling booking'
    });
  }
});

// @route   GET /api/bookings/lab/:labId
// @desc    Get all bookings for a specific lab
// @access  Local Admin only
router.get('/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only view bookings for your assigned lab.' 
      });
    }

    const query = { labId: labId, isActive: true };

    if (status && status !== 'all') {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'firstName lastName email phone')
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching lab bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching lab bookings'
    });
  }
});

module.exports = router;
