const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const { authenticateToken: auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/tests/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'test-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// @route   GET /api/tests
// @desc    Get all tests (public for users, admin/staff for management)
// @access  Private (All authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    // All authenticated users can view tests for booking purposes

    const { category, search, page = 1, limit = 10 } = req.query;
    
    // Build query
    let query = { isActive: true };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tests = await Test.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add createdBy info only for admin/staff
    if (['admin', 'staff', 'lab_manager', 'technician'].includes(req.user.role)) {
      await Test.populate(tests, { path: 'createdBy', select: 'firstName lastName email' });
    }

    const total = await Test.countDocuments(query);

    res.json({
      success: true,
      data: tests,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total
      }
    });
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tests'
    });
  }
});

// @route   POST /api/tests
// @desc    Create a new test
// @access  Private (Admin/Staff)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    // Check if user is admin or staff
    if (!['admin', 'staff', 'lab_manager', 'technician'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or staff role required.'
      });
    }

    const { name, description, category, price, duration, preparation } = req.body;

    // Validate required fields
    if (!name || !description || !category || !price || !duration) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Validate category
    const validCategories = ['blood', 'urine', 'imaging', 'cardiology', 'pathology'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
      });
    }

    // Validate price
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid positive number'
      });
    }

    // Handle image upload
    let imagePath = null;
    if (req.file) {
      imagePath = req.file.path;
    }

    // Create test
    const test = new Test({
      name: name.trim(),
      description: description.trim(),
      category,
      price: priceNum,
      duration: duration.trim(),
      preparation: preparation ? preparation.trim() : '',
      image: imagePath,
      createdBy: req.user.id
    });

    await test.save();

    // Populate createdBy field
    await test.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Test created successfully',
      data: test
    });
  } catch (error) {
    console.error('Error creating test:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating test'
    });
  }
});

// @route   PUT /api/tests/:id
// @desc    Update a test
// @access  Private (Admin/Staff)
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    // Check if user is admin or staff
    if (!['admin', 'staff', 'lab_manager', 'technician'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or staff role required.'
      });
    }

    const { name, description, category, price, duration, preparation } = req.body;

    // Find test
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Update fields
    if (name) test.name = name.trim();
    if (description) test.description = description.trim();
    if (category) {
      const validCategories = ['blood', 'urine', 'imaging', 'cardiology', 'pathology'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
        });
      }
      test.category = category;
    }
    if (price) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid positive number'
        });
      }
      test.price = priceNum;
    }
    if (duration) test.duration = duration.trim();
    if (preparation !== undefined) test.preparation = preparation ? preparation.trim() : '';

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (test.image && fs.existsSync(test.image)) {
        fs.unlinkSync(test.image);
      }
      test.image = req.file.path;
    }

    await test.save();

    // Populate createdBy field
    await test.populate('createdBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Test updated successfully',
      data: test
    });
  } catch (error) {
    console.error('Error updating test:', error);
    
    // Handle validation errors
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
      message: 'Server error while updating test'
    });
  }
});

// @route   DELETE /api/tests/:id
// @desc    Delete a test
// @access  Private (Admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Delete image file if exists
    if (test.image && fs.existsSync(test.image)) {
      fs.unlinkSync(test.image);
    }

    // Soft delete by setting isActive to false
    test.isActive = false;
    await test.save();

    res.json({
      success: true,
      message: 'Test deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting test'
    });
  }
});

// @route   GET /api/tests/:id
// @desc    Get a single test (public for users)
// @access  Private (All authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    // All authenticated users can view individual tests

    const test = await Test.findById(req.params.id);

    if (!test || !test.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Add createdBy info only for admin/staff
    if (['admin', 'staff', 'lab_manager', 'technician'].includes(req.user.role)) {
      await Test.populate(test, { path: 'createdBy', select: 'firstName lastName email' });
    }

    res.json({
      success: true,
      data: test
    });
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching test'
    });
  }
});

// @route   GET /api/tests/lab/:labId
// @desc    Get all tests for a specific lab
// @access  Local Admin only
router.get('/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests for your assigned lab.' 
      });
    }

    // First, get the lab to find which tests are available for this lab
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availableTests');
    
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Get tests that are available for this lab
    const tests = await Test.find({ 
      _id: { $in: lab.availableTests || [] }, 
      isActive: true 
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: tests
    });
  } catch (error) {
    console.error('Error fetching lab tests:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching lab tests'
    });
  }
});

// @route   GET /api/tests/available/lab/:labId
// @desc    Get all available tests that can be added to a lab (with current lab assignments)
// @access  Local Admin only
router.get('/available/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests for your assigned lab.' 
      });
    }

    // Get all active tests
    const allTests = await Test.find({ isActive: true }).sort({ createdAt: -1 });

    // Get the lab to find which tests are already assigned
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availableTests');
    
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Mark which tests are already assigned to this lab
    const testsWithAssignment = allTests.map(test => ({
      ...test.toObject(),
      isAssignedToLab: lab.availableTests.includes(test._id.toString())
    }));

    res.json({
      success: true,
      data: testsWithAssignment
    });
  } catch (error) {
    console.error('Error fetching available tests:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available tests'
    });
  }
});

// @route   PUT /api/tests/lab/:labId/assign
// @desc    Assign/unassign tests to/from a lab
// @access  Local Admin only
router.put('/lab/:labId/assign', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;
    const { testIds } = req.body;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests for your assigned lab.' 
      });
    }

    if (!Array.isArray(testIds)) {
      return res.status(400).json({
        success: false,
        message: 'testIds must be an array'
      });
    }

    // Validate that all tests exist and are active
    const validTests = await Test.find({ 
      _id: { $in: testIds }, 
      isActive: true 
    });

    if (validTests.length !== testIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some tests are invalid or inactive'
      });
    }

    // Update the lab's availableTests array
    const Lab = require('../models/Lab');
    const updatedLab = await Lab.findByIdAndUpdate(
      labId,
      { availableTests: testIds },
      { new: true }
    ).select('availableTests');

    if (!updatedLab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Get the updated tests for response
    const updatedTests = await Test.find({ 
      _id: { $in: updatedLab.availableTests }, 
      isActive: true 
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Test assignments updated successfully',
      data: updatedTests
    });
  } catch (error) {
    console.error('Error updating test assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating test assignments'
    });
  }
});

// @route   POST /api/tests/lab/:labId
// @desc    Create a new test for a specific lab (Local Admin only)
// @access  Local Admin only
router.post('/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests for your assigned lab.' 
      });
    }

    const { name, description, category, price, duration, preparationInstructions } = req.body;

    // Validation
    if (!name || !description || !category || !price || !duration) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, description, category, price, and duration are required.' 
      });
    }

    // Validate category
    const validCategories = ['blood', 'urine', 'imaging', 'cardiology', 'pathology'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
      });
    }

    // Create new test (global test)
    const newTest = new Test({
      name: name.trim(),
      description: description.trim(),
      category,
      price: parseFloat(price),
      duration: duration.trim(),
      preparation: preparationInstructions ? preparationInstructions.trim() : '',
      isActive: true,
      createdBy: req.user.id
    });

    await newTest.save();

    // Add the test to the lab's availableTests array
    const Lab = require('../models/Lab');
    await Lab.findByIdAndUpdate(
      labId,
      { $addToSet: { availableTests: newTest._id } },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Test created successfully and added to your lab.',
      data: newTest
    });

  } catch (error) {
    console.error('Error creating test:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not create test.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/tests/lab/:labId/:testId
// @desc    Update test for a specific lab (Local Admin only)
// @access  Local Admin only
router.put('/lab/:labId/:testId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId, testId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests for your assigned lab.' 
      });
    }

    // Check if test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found.' 
      });
    }

    // Check if the test is available for this lab
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availableTests');
    if (!lab || !lab.availableTests.includes(testId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests assigned to your lab.' 
      });
    }

    const { name, description, category, price, duration, preparationInstructions } = req.body;

    // Update fields
    if (name) test.name = name.trim();
    if (description) test.description = description.trim();
    if (category) {
      const validCategories = ['blood', 'urine', 'imaging', 'cardiology', 'pathology'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
        });
      }
      test.category = category;
    }
    if (price) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid positive number'
        });
      }
      test.price = priceNum;
    }
    if (duration) test.duration = duration.trim();
    if (preparationInstructions !== undefined) test.preparation = preparationInstructions ? preparationInstructions.trim() : '';

    await test.save();

    res.status(200).json({
      success: true,
      message: 'Test updated successfully.',
      data: test
    });

  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not update test.' 
    });
  }
});

// @route   DELETE /api/tests/lab/:labId/:testId
// @desc    Delete test for a specific lab (Local Admin only)
// @access  Local Admin only
router.delete('/lab/:labId/:testId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId, testId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests for your assigned lab.' 
      });
    }

    // Check if test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ 
        success: false, 
        message: 'Test not found.' 
      });
    }

    // Check if the test is available for this lab
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availableTests');
    if (!lab || !lab.availableTests.includes(testId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage tests assigned to your lab.' 
      });
    }

    // Remove the test from the lab's availableTests array
    await Lab.findByIdAndUpdate(
      labId,
      { $pull: { availableTests: testId } },
      { new: true }
    );

    // Soft delete the test (set isActive to false)
    test.isActive = false;
    await test.save();

    res.status(200).json({
      success: true,
      message: 'Test removed from your lab successfully.'
    });

  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not delete test.' 
    });
  }
});

module.exports = router;
