const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Lab = require('../models/Lab');
const User = require('../models/User');
const Vital = require('../models/Vital');
const { authenticateToken: auth } = require('../middleware/auth');
const { razorpay } = require('../config/razorpay');
const pushService = require('../services/pushService');

// @route   GET /api/bookings/latest-vitals
// @desc    Get latest vitals summary for dashboard cards (BP/Sugar)
// @access  Private (All authenticated users)
router.get('/latest-vitals', auth, async (req, res) => {
  try {
    // 1. Try to fetch from Vitals collection first (manual entries)
    let latestVital = await Vital.findOne({
      userId: req.user.id,
      $or: [{ bloodPressure: { $ne: null } }, { bloodSugar: { $ne: null } }]
    }).sort({ createdAt: -1 });

    let bloodPressure = latestVital?.bloodPressure || null;
    let bloodSugar = latestVital?.bloodSugar || null;

    // 2. If missing, look into Booking test results
    if (!bloodPressure || !bloodSugar) {
      const recentBookings = await Booking.find({
        userId: req.user.id,
        status: { $in: ['result_published', 'completed'] },
        testResults: { $exists: true, $ne: [] }
      })
        .sort({ appointmentDate: -1 })
        .limit(10) // Check last 10 bookings
        .populate('selectedTests.testId', 'name');

      for (const booking of recentBookings) {
        // Stop if we found both
        if (bloodPressure && bloodSugar) break;

        const results = booking.testResults || [];

        // Map test names for easier lookup
        const testMap = {};
        if (booking.selectedTests) {
          booking.selectedTests.forEach(t => {
            if (t.testId) testMap[t.testId._id.toString()] = t.testName || t.testId.name;
          });
        }

        for (const result of results) {
          const testIdStr = result.testId ? result.testId.toString() : '';
          const testName = (testMap[testIdStr] || '').toLowerCase();

          console.log(`Checking test result: ${testName}`, result.values);

          // Check for Blood Pressure
          if (!bloodPressure) {
            // Strategy 1: Look for explicit "Blood Pressure" or "BP" in test name
            // AND a value that looks like "120/80" or has "pressure" in label
            if (testName.includes('pressure') || testName.includes('bp') || testName.includes('vitals')) {
              const bpValue = result.values.find(v => v.value && (v.label.toLowerCase().includes('pressure') || v.value.toString().includes('/')));
              if (bpValue) {
                console.log('Found BP via strategy 1:', bpValue);
                bloodPressure = {
                  value: bpValue.value,
                  unit: bpValue.unit || 'mmHg',
                  date: booking.appointmentDate
                };
              }
            }

            // Strategy 2: Look for Systolic/Diastolic values specifically
            if (!bloodPressure) {
              const systolic = result.values.find(v => v.label.toLowerCase().includes('systolic'));
              const diastolic = result.values.find(v => v.label.toLowerCase().includes('diastolic'));

              if (systolic && diastolic && systolic.value && diastolic.value) {
                console.log('Found BP via strategy 2 (systolic/diastolic):', systolic, diastolic);
                bloodPressure = {
                  value: `${systolic.value}/${diastolic.value}`,
                  unit: 'mmHg',
                  date: booking.appointmentDate
                };
              }
            }

            // Strategy 3: Scan ALL values for "X/Y" pattern where X and Y are numbers (e.g. "120/80")
            if (!bloodPressure) {
              const bpPattern = /^\d{2,3}\/\d{2,3}$/;
              const bpValue = result.values.find(v => v.value && bpPattern.test(v.value.toString()));
              if (bpValue) {
                console.log('Found BP via strategy 3 (pattern match):', bpValue);
                bloodPressure = {
                  value: bpValue.value,
                  unit: bpValue.unit || 'mmHg',
                  date: booking.appointmentDate
                };
              }
            }
          }

          // Check for Blood Sugar / Glucose
          if (!bloodSugar && (testName.includes('sugar') || testName.includes('glucose') || testName.includes('diabetic'))) {
            const sugarValue = result.values.find(v => v.value); // Simple check for any value if title matches
            if (sugarValue) {
              console.log('Found Blood Sugar:', sugarValue);
              bloodSugar = {
                value: sugarValue.value,
                unit: sugarValue.unit || 'mg/dL',
                type: testName.includes('fasting') ? 'Fasting' : testName.includes('post') ? 'Post-Prandial' : 'Random',
                date: booking.appointmentDate
              };
            }
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        bloodPressure: bloodPressure,
        bloodSugar: bloodSugar
      }
    });
  } catch (error) {
    console.error('Error fetching latest vitals:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching vitals' });
  }
});

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

    // Validate lab exists and is active
    const lab = await Lab.findById(labId);
    if (!lab || !lab.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or inactive'
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

    // Validate that all tests exist in the lab
    if (selectedTests && selectedTests.length > 0) {
      console.log('Booking validation:', {
        totalTests: selectedTests.length,
        testIds: selectedTests.map(t => t.testId),
        testNames: selectedTests.map(t => t.testName)
      });

      // Validate that all tests exist in the lab
      const availableTestIds = lab.availableTests?.map(test =>
        typeof test === 'object' ? test._id.toString() : test.toString()
      ) || [];

      const invalidTests = selectedTests.filter(test =>
        !availableTestIds.includes(test.testId.toString())
      );

      if (invalidTests.length > 0) {
        return res.status(400).json({
          success: false,
          message: `The following tests are not available at this lab: ${invalidTests.map(t => t.testName).join(', ')}`
        });
      }
    }

    // Calculate total amount
    let totalAmount = 0;

    // Add test prices
    if (selectedTests && selectedTests.length > 0) {
      totalAmount += selectedTests.reduce((sum, test) => {
        return sum + (test.price || 0);
      }, 0);
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
    } else if (paymentMethod === 'pay_later') {
      bookingData.paymentStatus = 'pending';
    } else {
      bookingData.paymentStatus = 'pending';
    }

    console.log('Creating booking with data:', {
      userId: bookingData.userId,
      labId: bookingData.labId,
      selectedTestsCount: bookingData.selectedTests.length,
      selectedPackagesCount: bookingData.selectedPackages.length,
      totalAmount: bookingData.totalAmount,
      paymentMethod: bookingData.paymentMethod,
      appointmentDate: bookingData.appointmentDate
    });

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
      .populate('userId', 'firstName lastName email phone age gender dateOfBirth address emergencyContact createdAt lastLogin')
      .populate('testResults.testId', 'name description department category')
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
      .populate('userId', 'firstName lastName email phone age gender dateOfBirth address emergencyContact createdAt lastLogin')
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

// @route   POST /api/bookings/:id/create-order
// @desc    Create Razorpay order for a booking
// @access  Private
router.post('/:id/create-order', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, isActive: true });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Already paid' });
    }

    const options = {
      amount: Math.round(booking.totalAmount * 100), // Razorpay expects amount in paise
      currency: "INR",
      receipt: `receipt_${booking._id}`
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      }
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
});

// @route   POST /api/bookings/:id/payment
// @desc    Process payment for booking (Razorpay or Lab payment)
// @access  Private (All authenticated users)
router.post('/:id/payment', auth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const { role } = req.user;

    // Find the booking
    const booking = await Booking.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if this is a Razorpay payment (user making online payment)
    if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
      // Verify user owns this booking
      if (booking.userId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only process payments for your own bookings.'
        });
      }

      // Upgrade payment method to pay_now if user is paying online
      booking.paymentMethod = 'pay_now';

      // Update Razorpay payment details
      booking.razorpayOrderId = razorpayOrderId;
      booking.razorpayPaymentId = razorpayPaymentId;
      booking.razorpaySignature = razorpaySignature;
      booking.paymentStatus = 'completed';
      booking.paidAmount = booking.totalAmount;
      booking.paymentDate = new Date();

      await booking.save();

      await booking.populate('labId', 'name address contact');

      res.json({
        success: true,
        message: 'Payment processed successfully',
        data: booking
      });
    } else {
      // This is a lab payment (staff processing "pay on lab" bookings)

      // Check if user is staff or local_admin
      if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only staff and local admins can process lab payments.'
        });
      }

      // Resolve assignedLab reliably (fallback to DB if not in token)
      let effectiveAssignedLab = req.user.assignedLab;
      if (!effectiveAssignedLab && (['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role))) {
        const User = require('../models/User');
        const dbUser = await User.findById(req.user.id).select('assignedLab');
        effectiveAssignedLab = dbUser?.assignedLab;
      }

      // Check if user has access to this booking's lab
      if (['staff', 'lab_technician', 'xray_technician'].includes(role) && effectiveAssignedLab?.toString() !== booking.labId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only process payments for bookings in your assigned lab.'
        });
      }

      if (role === 'local_admin' && effectiveAssignedLab?.toString() !== booking.labId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only process payments for bookings in your assigned lab.'
        });
      }

      // Check if payment method is pay_later
      if (booking.paymentMethod !== 'pay_later') {
        return res.status(400).json({
          success: false,
          message: 'This booking is not eligible for lab payment processing'
        });
      }

      // Check if payment is already completed
      if (booking.paymentStatus === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Payment has already been processed for this booking'
        });
      }

      // Update payment status to completed
      booking.paymentStatus = 'completed';
      booking.paymentDate = new Date();
      booking.updatedAt = new Date();

      await booking.save();

      res.json({
        success: true,
        message: 'Payment processed successfully',
        data: booking
      });
    }
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

// @route   GET /api/bookings/lab/:labId/reports
// @desc    Get all bookings with reports for a specific lab
// @access  Private (Lab Staff/Local Admin)
router.get('/lab/:labId/reports', auth, async (req, res) => {
  try {
    const { labId } = req.params;
    const { status = 'all', page = 1, limit = 50 } = req.query;

    // Check if user is staff or local_admin
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only staff and local admins can view lab reports.'
      });
    }

    // Resolve assignedLab reliably (fallback to DB if not in token)
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab && (['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(req.user.role))) {
      const User = require('../models/User');
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }

    // For staff members, check if they are assigned to this lab
    if (['staff', 'lab_technician', 'xray_technician'].includes(req.user.role) && effectiveAssignedLab?.toString() !== labId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view reports for your assigned lab.'
      });
    }

    // For local_admin, check if they manage this lab
    if (req.user.role === 'local_admin' && effectiveAssignedLab?.toString() !== labId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view reports for your assigned lab.'
      });
    }

    // Build query
    let query = {
      labId: labId,
      isActive: true,
      $or: [
        { reportFile: { $exists: true, $ne: null } },
        { testResults: { $exists: true, $ne: [] } }
      ]
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch bookings with reports
    const bookings = await Booking.find(query)
      .populate('userId', 'firstName lastName email phone age gender')
      .populate('labId', 'name address contact email')
      .populate('selectedTests.testId', 'name price category resultFields')
      .populate({
        path: 'selectedPackages.packageId',
        select: 'name price selectedTests',
        populate: {
          path: 'selectedTests',
          select: 'name price category resultFields'
        }
      })
      .populate('testResults.testId', 'name')
      .sort({ reportUploadDate: -1, updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
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
    console.error('Error fetching lab reports:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reports'
    });
  }
});

// @route   GET /api/bookings/lab/:labId
// @desc    Get all bookings for a specific lab
// @access  Local Admin and Staff only
router.get('/lab/:labId', auth, async (req, res) => {
  try {
    const { role } = req.user;
    const { labId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Check if user is local_admin or staff and has access to this lab
    if (role !== 'local_admin' && !['staff', 'lab_technician', 'xray_technician'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only local admins and staff can view lab bookings.'
      });
    }

    // Resolve assignedLab reliably (fallback to DB if not in token)
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab && (['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role))) {
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }

    // For staff members, check if they are assigned to this lab
    if (['staff', 'lab_technician', 'xray_technician'].includes(role) && effectiveAssignedLab?.toString() !== labId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view bookings for your assigned lab.'
      });
    }

    // For local_admin, check if they manage this lab
    if (role === 'local_admin' && effectiveAssignedLab?.toString() !== labId) {
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
      .populate('selectedTests.testId', 'name resultFields')
      .populate({
        path: 'selectedPackages.packageId',
        select: 'name selectedTests',
        populate: { path: 'selectedTests', select: 'name resultFields' }
      })
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Booking.countDocuments(query);

    console.log('Lab bookings query result:', {
      labId,
      query,
      bookingsFound: bookings.length,
      bookingIds: bookings.map(b => b._id),
      totalCount: count
    });

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

// @route   PUT /api/bookings/:id/status
// @desc    Update booking status
// @access  Staff and Local Admin only
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;
    const { status } = req.body;

    // Check if user is staff or local_admin
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only staff and local admins can update booking status.'
      });
    }

    // Validate status
    const validStatuses = ['confirmed', 'arrived', 'sample_collected', 'testing', 'results_entered', 'processing', 'completed', 'result_published'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Resolve assignedLab reliably (fallback to DB if not in token)
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab && (['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role))) {
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }

    // Check if user has access to this booking's lab
    if (['staff', 'lab_technician', 'xray_technician'].includes(role) && effectiveAssignedLab?.toString() !== booking.labId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update bookings for your assigned lab.'
      });
    }

    if (role === 'local_admin' && effectiveAssignedLab?.toString() !== booking.labId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update bookings for your assigned lab.'
      });
    }

    // Update the booking status
    booking.status = status;
    booking.updatedAt = new Date();

    await booking.save();

    res.json({
      success: true,
      message: 'Booking status updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating booking status'
    });
  }
});

const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/reports/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow only specific file types
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.'), false)
    }
  }
})

// @route   POST /api/bookings/:id/upload-report
// @desc    Upload report for a booking
// @access  Staff and Local Admin only
router.post('/:id/upload-report', auth, upload.single('reportFile'), async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;

    // Check if user is staff or local_admin
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only staff and local admins can upload reports.'
      });
    }

    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking status allows report upload
    if (!['confirmed', 'sample_collected', 'result_published'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Report can only be uploaded for bookings with confirmed, sample_collected, or result_published status'
      });
    }

    // Payment validation Layer
    if (booking.paymentStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot upload definitive report until payment is marked as completed.'
      });
    }

    // Resolve assignedLab reliably (fallback to DB if not in token)
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab && (['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role))) {
      const User = require('../models/User');
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }

    // Check if user has access to this booking's lab
    if (['staff', 'lab_technician', 'xray_technician'].includes(role) && effectiveAssignedLab?.toString() !== booking.labId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only upload reports for bookings in your assigned lab.'
      });
    }

    if (role === 'local_admin' && effectiveAssignedLab?.toString() !== booking.labId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only upload reports for bookings in your assigned lab.'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Update the booking with report information
    booking.reportFile = req.file.path; // Store file path
    booking.reportUploadDate = new Date();
    booking.status = 'result_published';
    booking.updatedAt = new Date();

    await booking.save();

    // ── Send push notification (non-blocking) ──
    try {
      const patient = await User.findById(booking.userId);
      if (patient) {
        await pushService.notifyUser(
          patient,
          'Lab Results Published',
          `Your results from ${lab?.name || 'LabMate360'} are now available.`,
          '/user/dashboard/download-reports'
        );
      }
    } catch (pushErr) {
      console.error('Push notification failed:', pushErr.message);
    }

    res.json({
      success: true,
      message: 'Report uploaded successfully',
      data: {
        ...booking.toObject(),
        reportFileName: req.file.filename
      }
    });
  } catch (error) {
    console.error('Error uploading report:', error);

    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }

    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while uploading report'
    });
  }
});

// @route   POST /api/bookings/:id/results
// @desc    Submit test results for a booking (entering values instead of file)
// @access  Staff and Local Admin only
router.post('/:id/results', auth, async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;
    // (Early check removed to support dual-format body)
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only staff and local admins can submit results.'
      });
    }


    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Results can be submitted when confirmed, sample collected, or partially completed
    if (!['confirmed', 'sample_collected', 'partially_completed', 'result_published'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Results can only be submitted for confirmed, sample_collected, or partially_completed bookings' });
    }

    // Resolve assignedLab reliably and authorize
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab && (['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role))) {
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }
    if (effectiveAssignedLab?.toString() !== booking.labId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied for this lab' });
    }

    // Store results; replace or upsert per testId
    const byTestId = new Map();
    (booking.testResults || []).forEach(r => byTestId.set(r.testId.toString(), r));

    let { testResults, analyzer } = req.body; // expected array of { testId, values: [...] }

    // Support direct array from older frontend
    if (!testResults && Array.isArray(req.body)) {
      testResults = req.body;
    }

    if (!Array.isArray(testResults) || testResults.length === 0) {
      return res.status(400).json({ success: false, message: 'testResults must be a non-empty array' });
    }

    testResults.forEach(tr => {
      if (!tr || !tr.testId || !Array.isArray(tr.values)) return;
      const cleanValues = tr.values.map(v => ({
        label: (v.label || '').trim(),
        value: v.value,
        unit: (v.unit || '').trim(),
        referenceRange: (v.referenceRange || '').trim(),
        type: ['text', 'number', 'boolean'].includes(v.type) ? v.type : 'text',
        required: !!v.required
      }));
      byTestId.set(tr.testId.toString(), {
        testId: tr.testId,
        values: cleanValues,
        status: 'completed',
        analyzer: analyzer || tr.analyzer || null,
        submittedBy: req.user.id,
        submittedAt: new Date()
      });
    });

    booking.testResults = Array.from(byTestId.values());

    // Calculate total expected tests (direct tests + tests inside packages)
    const Package = require('../models/Package');
    let totalExpectedTests = (booking.selectedTests || []).length;
    if (booking.selectedPackages && booking.selectedPackages.length > 0) {
      const packageIds = booking.selectedPackages.map(p => p.packageId);
      const packages = await Package.find({ _id: { $in: packageIds } }).select('selectedTests');
      packages.forEach(pkg => {
        totalExpectedTests += (pkg.selectedTests || []).length;
      });
    }

    // Smart status: partially_completed vs results_entered (awaiting verification)
    const resultsCount = booking.testResults.length;
    if (resultsCount >= totalExpectedTests) {
      booking.status = 'results_entered';
    } else if (resultsCount > 0) {
      booking.status = 'partially_completed';
    }
    booking.updatedAt = new Date();

    await booking.save();

    // ── Send push notification if published (non-blocking) ──
    if (booking.status === 'result_published') {
      try {
        const patient = await User.findById(booking.userId);
        const lab = await Lab.findById(booking.labId);
        if (patient) {
          await pushService.notifyUser(
            patient,
            'Lab Results Published',
            `Your results from ${lab?.name || 'LabMate360'} are now available.`,
            '/user/dashboard/download-reports'
          );
        }
      } catch (pushErr) {
        console.error('Push notification failed:', pushErr.message);
      }
    }

    res.json({ success: true, message: 'Results saved successfully', data: booking });
  } catch (error) {
    console.error('Error saving results:', error);
    res.status(500).json({ success: false, message: 'Server error while saving results' });
  }
});

// --- Multer config for test result files (imaging) ---
const multerResultStorage = require('multer').diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/test-results/';
    const fs = require('fs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'result-' + uniqueSuffix + require('path').extname(file.originalname));
  }
});
const uploadTestResult = require('multer')({
  storage: multerResultStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB for imaging files
  fileFilter: function (req, file, cb) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/dicom', 'application/dicom'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, and DICOM files are allowed.'), false);
    }
  }
});

// @route   POST /api/bookings/:id/upload-test-result/:testId
// @desc    Upload a file result for imaging tests (ECG, X-ray, CT scan, etc.)
// @access  Staff and Local Admin only
router.post('/:id/upload-test-result/:testId', auth, uploadTestResult.single('resultFile'), async (req, res) => {
  try {
    const { role } = req.user;
    const { id, testId } = req.params;
    const { findings } = req.body;

    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please select an image or PDF.' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!['confirmed', 'sample_collected', 'partially_completed', 'result_published'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Results can only be submitted for active bookings' });
    }

    // Auth check: staff must belong to same lab
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab && ['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }
    if (effectiveAssignedLab?.toString() !== booking.labId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied for this lab' });
    }

    // Upsert the test result with file
    const existingIdx = (booking.testResults || []).findIndex(
      r => r.testId.toString() === testId
    );

    const resultEntry = {
      testId: testId,
      values: [],
      resultFile: req.file.path.replace(/\\/g, '/'),
      findings: (findings || '').trim(),
      status: 'completed',
      submittedBy: req.user.id,
      submittedAt: new Date()
    };

    if (existingIdx >= 0) {
      booking.testResults[existingIdx] = resultEntry;
    } else {
      booking.testResults.push(resultEntry);
    }

    // Smart status update
    const PackageModel = require('../models/Package');
    let totalExpectedTests = (booking.selectedTests || []).length;
    if (booking.selectedPackages && booking.selectedPackages.length > 0) {
      const packageIds = booking.selectedPackages.map(p => p.packageId);
      const packages = await PackageModel.find({ _id: { $in: packageIds } }).select('selectedTests');
      packages.forEach(pkg => { totalExpectedTests += (pkg.selectedTests || []).length; });
    }

    const resultsCount = booking.testResults.length;
    if (resultsCount >= totalExpectedTests) {
      booking.status = 'processing';
    } else if (resultsCount > 0) {
      booking.status = 'partially_completed';
    }
    booking.updatedAt = new Date();

    await booking.save();

    // ── Send push notification if published (non-blocking) ──
    if (booking.status === 'result_published') {
      try {
        const patient = await User.findById(booking.userId);
        const lab = await Lab.findById(booking.labId);
        if (patient) {
          await pushService.notifyUser(
            patient,
            'Lab Results Published',
            `Your results from ${lab?.name || 'LabMate360'} are now available.`,
            '/user/dashboard/download-reports'
          );
        }
      } catch (pushErr) {
        console.error('Push notification failed:', pushErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Imaging result uploaded successfully',
      data: {
        resultFile: resultEntry.resultFile,
        findings: resultEntry.findings,
        status: resultEntry.status
      }
    });
  } catch (error) {
    console.error('Error uploading test result file:', error);
    if (error.message?.includes('Invalid file type')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Server error while uploading result' });
  }
});

// @route   POST /api/bookings/:id/create-order
// @desc    Create Razorpay order for a booking
// @access  Private (All authenticated users)
router.post('/:id/create-order', auth, async (req, res) => {
  try {
    const bookingId = req.params.id;

    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      userId: req.user.id,
      isActive: true
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking is eligible for online payment
    if (booking.paymentMethod !== 'pay_now') {
      return res.status(400).json({
        success: false,
        message: 'This booking is not eligible for online payment'
      });
    }

    // Check if payment is already completed
    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Payment has already been processed for this booking'
      });
    }

    // Create Razorpay order
    const options = {
      amount: booking.totalAmount * 100, // Amount in paise
      currency: 'INR',
      receipt: `${booking._id.toString().slice(-8)}`, // Use last 8 chars of booking ID
      notes: {
        bookingId: booking._id.toString(),
        userId: booking.userId.toString(),
        labId: booking.labId.toString()
      }
    };

    const order = await razorpay.orders.create(options);

    // Update booking with order ID
    booking.razorpayOrderId = order.id;
    await booking.save();

    res.json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        booking: booking
      }
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating order'
    });
  }
});

// @route   POST /api/bookings/:id/payment
// @desc    Process Razorpay payment for a booking
// @access  Private (All authenticated users)
router.post('/:id/payment', auth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const bookingId = req.params.id;

    // Validate required fields
    if (!razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Payment details are required'
      });
    }

    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      userId: req.user.id,
      isActive: true
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking is eligible for payment
    if (booking.paymentMethod !== 'pay_now') {
      return res.status(400).json({
        success: false,
        message: 'This booking is not eligible for online payment'
      });
    }

    // Check if payment is already completed
    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Payment has already been processed for this booking'
      });
    }

    // Verify Razorpay payment signature (optional - for production use)
    // For now, we'll trust the frontend verification and proceed

    // Update booking with payment details
    booking.razorpayOrderId = razorpayOrderId;
    booking.razorpayPaymentId = razorpayPaymentId;
    booking.razorpaySignature = razorpaySignature;
    booking.paymentStatus = 'completed';
    booking.paidAmount = booking.totalAmount;
    booking.paymentDate = new Date();
    booking.status = 'confirmed'; // Confirm the booking after successful payment
    booking.updatedAt = new Date();

    await booking.save();

    // Populate the booking with lab and user details for response
    await booking.populate('labId', 'name address contact');
    await booking.populate('userId', 'firstName lastName email phone');

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

// @route   GET /api/bookings/admin/all
// @desc    Get all bookings (Admin only)
// @access  Private (Admin only)
router.get('/admin/all', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const {
      status,
      labId,
      date,
      search,
      page = 1,
      limit = 10
    } = req.query;

    // Build query
    let query = { isActive: true };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (labId && labId !== 'all') {
      query.labId = labId;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.appointmentDate = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let bookings = await Booking.find(query)
      .populate('userId', 'firstName lastName email phone age gender')
      .populate('labId', 'name address contact email')
      .populate('selectedTests.testId', 'name price')
      .populate('selectedPackages.packageId', 'name price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Apply search filter if provided
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      bookings = bookings.filter(booking =>
        booking.userId?.firstName?.match(searchRegex) ||
        booking.userId?.lastName?.match(searchRegex) ||
        booking.userId?.email?.match(searchRegex) ||
        booking.labId?.name?.match(searchRegex)
      );
    }

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
    console.error('Error fetching all bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings'
    });
  }
});

// @route   PUT /api/bookings/admin/:id/status
// @desc    Update booking status (Admin only)
// @access  Private (Admin only)
router.put('/admin/:id/status', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['pending', 'confirmed', 'arrived', 'sample_collected', 'testing', 'results_entered', 'processing', 'completed', 'result_published', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.status = status;
    booking.updatedAt = new Date();

    await booking.save();

    await booking.populate('userId', 'firstName lastName email phone');
    await booking.populate('labId', 'name address contact');

    res.json({
      success: true,
      message: 'Booking status updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating booking status'
    });
  }
});

// @route   DELETE /api/bookings/admin/:id
// @desc    Delete booking (Admin only)
// @access  Private (Admin only)
router.delete('/admin/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Soft delete by setting isActive to false
    booking.isActive = false;
    booking.updatedAt = new Date();

    await booking.save();

    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting booking'
    });
  }
});

// @route   PUT /api/bookings/:id/verify-test/:testId
// @desc    Verify a test result (Staff/Local Admin only)
// @access  Private
router.put('/:id/verify-test/:testId', auth, async (req, res) => {
  try {
    const { id, testId } = req.params;
    const { role } = req.user;

    if (!['staff', 'lab_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const testResult = (booking.testResults || []).find(r => r.testId.toString() === testId);
    if (!testResult) return res.status(404).json({ success: false, message: 'Test results not found' });

    testResult.status = 'verified';
    testResult.verifiedBy = req.user.id;
    testResult.verifiedAt = new Date();

    // Set to 'completed' (Wait-for-Publish) if ALL test results are now verified
    const allVerified = (booking.testResults || []).every(r => r.status === 'verified');
    if (allVerified) {
      booking.status = 'completed';
    }

    booking.updatedAt = new Date();
    await booking.save();

    res.json({ success: true, message: 'Test verified successfully', data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while verifying test' });
  }
});

// @route   PUT /api/bookings/:id/publish
// @desc    Publish verified results to the patient
// @access  Staff/Local Admin only
router.put('/:id/publish', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.user;

    if (!['staff', 'lab_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const booking = await Booking.findById(id)
      .populate('selectedTests.testId', 'name')
      .populate('selectedPackages.packageId', 'name selectedTests');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Only allow publishing completed bookings (all tests verified)
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only fully verified bookings can be published. Current status: ' + booking.status
      });
    }

    // Verify all tests are indeed verified
    const allVerified = (booking.testResults || []).every(r => r.status === 'verified');
    if (!allVerified) {
      return res.status(400).json({
        success: false,
        message: 'All test results must be verified before publishing'
      });
    }

    booking.status = 'result_published';
    booking.publishedAt = new Date();
    booking.publishedBy = req.user.id;
    booking.updatedAt = new Date();

    await booking.save();

    // ── Send push notification (non-blocking) ──
    try {
      const patient = await User.findById(booking.userId);
      if (patient) {
        await pushService.notifyUser(
          patient,
          'Lab Results Published',
          `Your results from ${booking.labId?.name || 'LabMate360'} are now available.`,
          '/user/dashboard/download-reports'
        );
      }
    } catch (pushErr) {
      console.error('Push notification failed:', pushErr.message);
    }

    await booking.populate('userId', 'firstName lastName email phone');
    await booking.populate('labId', 'name');

    // ── Send email notification (non-blocking) ──
    try {
      const emailService = require('../services/emailService');
      const patientEmail = booking.userId?.email;
      const firstName = booking.userId?.firstName || 'Patient';
      const labName = booking.labId?.name || 'LabMate360';

      if (patientEmail) {
        // Build test name lookup from selectedTests + packages
        const testNameById = new Map();
        (booking.selectedTests || []).forEach(t => {
          const tid = (t.testId?._id || t.testId)?.toString();
          const tname = t.testId?.name || t.testName;
          if (tid && tname) testNameById.set(tid, tname);
        });
        (booking.selectedPackages || []).forEach(pkg => {
          const pkgTests = pkg.packageId?.selectedTests || [];
          pkgTests.forEach(pt => {
            const tid = (pt._id || pt)?.toString();
            const tname = pt.name;
            if (tid && tname) testNameById.set(tid, tname);
          });
        });

        // Build test summary for email
        const testSummary = (booking.testResults || []).map(tr => {
          const testId = (tr.testId?._id || tr.testId)?.toString();
          const testName = testNameById.get(testId) || 'Test';
          const isImaging = !!tr.resultFile && (!tr.values || tr.values.length === 0);

          if (isImaging) {
            return { testName, isImaging: true, findings: tr.findings || '' };
          }

          // Build values with abnormal flags
          const values = (tr.values || []).map(v => {
            let isAbnormal = false;
            let flag = '';
            if (v.value && v.referenceRange && !isNaN(v.value)) {
              const parts = (v.referenceRange || '').replace(/\s/g, '').split('-');
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const numVal = parseFloat(v.value);
                const lo = parseFloat(parts[0]);
                const hi = parseFloat(parts[1]);
                if (numVal < lo) { isAbnormal = true; flag = 'LOW'; }
                else if (numVal > hi) { isAbnormal = true; flag = 'HIGH'; }
              }
            }
            return {
              label: v.label || '',
              value: v.value,
              unit: v.unit || '',
              referenceRange: v.referenceRange || '',
              isAbnormal,
              flag
            };
          });

          return { testName, isImaging: false, values };
        });

        emailService.sendResultPublishedEmail(patientEmail, firstName, labName, testSummary, booking._id)
          .then(result => {
            if (result.success) console.log('Result publish email sent to', patientEmail);
            else console.warn('Result publish email failed:', result.error);
          })
          .catch(err => console.error('Result publish email error:', err));
      }
    } catch (emailErr) {
      console.error('Error preparing result publish email:', emailErr);
      // Don't fail the publish operation
    }

    res.json({
      success: true,
      message: 'Results published to patient successfully',
      data: booking
    });
  } catch (error) {
    console.error('Error publishing results:', error);
    res.status(500).json({ success: false, message: 'Server error while publishing results' });
  }
});

// @route   GET /api/bookings/patient/:userId/history
// @desc    Get a patient's complete booking & health history (Staff only)
// @access  Private (Staff / Local Admin)
router.get('/patient/:userId/history', auth, async (req, res) => {
  try {
    const { role } = req.user;
    const { userId } = req.params;

    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Resolve staff's assigned lab
    let effectiveAssignedLab = req.user.assignedLab;
    if (!effectiveAssignedLab) {
      const dbUser = await User.findById(req.user.id).select('assignedLab');
      effectiveAssignedLab = dbUser?.assignedLab;
    }

    if (!effectiveAssignedLab) {
      return res.status(400).json({ success: false, message: 'No assigned lab found for your account' });
    }

    // Get patient info
    const patient = await User.findById(userId).select(
      'firstName lastName email phone age gender dateOfBirth address emergencyContact createdAt'
    );
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // All bookings for this patient at this lab
    const bookings = await Booking.find({
      userId: userId,
      labId: effectiveAssignedLab,
      isActive: true
    })
      .populate('labId', 'name address contact')
      .populate('selectedTests.testId', 'name price category resultFields')
      .populate({
        path: 'selectedPackages.packageId',
        select: 'name price selectedTests',
        populate: { path: 'selectedTests', select: 'name price category resultFields' }
      })
      .populate('testResults.testId', 'name')
      .sort({ appointmentDate: -1 });

    // Patient vitals
    const vitals = await Vital.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: {
        patient,
        bookings,
        vitals
      }
    });
  } catch (error) {
    console.error('Error fetching patient history:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching patient history' });
  }
});

// @route   PUT /api/bookings/:id/confirm-payment
// @desc    Confirm offline payment by staff/local admin
// @access  Staff, Local Admin, Admin
router.put('/:id/confirm-payment', auth, async (req, res) => {
  try {
    const { role } = req.user;
    if (!['staff', 'lab_technician', 'local_admin', 'admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Payment already completed' });
    }

    booking.paymentStatus = 'completed';
    booking.paidAmount = booking.totalAmount;
    booking.paymentDate = new Date();

    await booking.save();
    res.json({ success: true, message: 'Payment confirmed successfully', data: booking });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ success: false, message: 'Server error while confirming payment' });
  }
});

// @route   POST /api/bookings/:id/payment
// @desc    Process online payment for a pay_later booking
// @access  Private (booking owner)
router.post('/:id/payment', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Only the booking owner can pay
    if (booking.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to pay for this booking' });
    }

    // Can't pay for cancelled bookings
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot pay for a cancelled booking' });
    }

    // Already paid
    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Payment has already been completed for this booking' });
    }

    // Process payment (simulated — marks as paid)
    booking.paymentStatus = 'completed';
    booking.paymentMethod = 'pay_now'; // upgrade from pay_later to pay_now
    booking.paidAmount = booking.totalAmount;
    booking.paymentDate = new Date();

    await booking.save();

    // Populate for response
    await booking.populate('labId', 'name address contact');

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: booking
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ success: false, message: 'Server error while processing payment' });
  }
});

module.exports = router;
