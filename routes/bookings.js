const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Lab = require('../models/Lab');
const User = require('../models/User');
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

      if (booking.paymentMethod !== 'pay_now') {
        return res.status(400).json({
          success: false,
          message: 'This booking does not require immediate payment'
        });
      }

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

    // Validate status - only allow confirmed, sample_collected, and result_published
    const validStatuses = ['confirmed', 'sample_collected', 'result_published'];
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
    if (!['confirmed', 'sample_collected'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Report can only be uploaded for bookings with confirmed or sample_collected status'
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
    const { testResults } = req.body; // expected array of { testId, values: [{label, value, unit, referenceRange, type, required}] }

    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin'].includes(role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only staff and local admins can submit results.' 
      });
    }

    if (!Array.isArray(testResults) || testResults.length === 0) {
      return res.status(400).json({ success: false, message: 'testResults must be a non-empty array' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Results can be submitted when confirmed or sample is collected
    if (!['confirmed', 'sample_collected'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Results can only be submitted for confirmed or sample_collected bookings' });
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
        submittedBy: req.user.id,
        submittedAt: new Date()
      });
    });

    booking.testResults = Array.from(byTestId.values());
    // Update status to result_published
    booking.status = 'result_published';
    booking.updatedAt = new Date();

    await booking.save();

    res.json({ success: true, message: 'Results saved successfully', data: booking });
  } catch (error) {
    console.error('Error saving results:', error);
    res.status(500).json({ success: false, message: 'Server error while saving results' });
  }
});


module.exports = router;
