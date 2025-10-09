const express = require('express');
const router = express.Router();
const Package = require('../models/Package');
const Test = require('../models/Test');
const { authenticateToken: auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/packages/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'package-' + uniqueSuffix + path.extname(file.originalname));
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

// @route   GET /api/packages
// @desc    Get all packages (public for users, admin/staff for management)
// @access  Private (All authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    // All authenticated users can view packages for booking purposes

    const { search, page = 1, limit = 10 } = req.query;
    
    // Build query
    let query = { isActive: true };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const packages = await Package.find(query)
      .populate('selectedTests', 'name category price duration')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add createdBy info only for admin/staff
    if (['admin', 'staff', 'lab_manager', 'technician'].includes(req.user.role)) {
      await Package.populate(packages, { path: 'createdBy', select: 'firstName lastName email' });
    }

    const total = await Package.countDocuments(query);

    res.json({
      success: true,
      data: packages,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total
      }
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching packages'
    });
  }
});

// @route   POST /api/packages
// @desc    Create a new package
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

    const { name, description, price, discount, selectedTests, duration, benefits } = req.body;

    // Validate required fields
    if (!name || !description || !price || !selectedTests || !Array.isArray(selectedTests) || selectedTests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, price, and at least one test are required'
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

    // Validate discount
    const discountNum = discount ? parseFloat(discount) : 0;
    if (discount && (isNaN(discountNum) || discountNum < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Discount must be a valid positive number'
      });
    }

    // Validate that all selected tests exist and are active
    const tests = await Test.find({ 
      _id: { $in: selectedTests }, 
      isActive: true 
    });

    if (tests.length !== selectedTests.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected tests are invalid or inactive'
      });
    }

    // Handle image upload
    let imagePath = null;
    if (req.file) {
      imagePath = req.file.path;
    }

    // Create package
    const packageData = new Package({
      name: name.trim(),
      description: description.trim(),
      price: priceNum,
      discount: discountNum,
      selectedTests: selectedTests,
      duration: duration ? duration.trim() : '',
      benefits: benefits ? benefits.trim() : '',
      image: imagePath,
      createdBy: req.user.id
    });

    await packageData.save();

    // Populate fields
    await packageData.populate([
      { path: 'selectedTests', select: 'name category price duration' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      data: packageData
    });
  } catch (error) {
    console.error('Error creating package:', error);
    
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
      message: 'Server error while creating package'
    });
  }
});

// @route   PUT /api/packages/:id
// @desc    Update a package
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

    const { name, description, price, discount, selectedTests, duration, benefits } = req.body;

    // Find package
    const packageData = await Package.findById(req.params.id);
    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Update fields
    if (name) packageData.name = name.trim();
    if (description) packageData.description = description.trim();
    if (price) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid positive number'
        });
      }
      packageData.price = priceNum;
    }
    if (discount !== undefined) {
      const discountNum = discount ? parseFloat(discount) : 0;
      if (discount && (isNaN(discountNum) || discountNum < 0)) {
        return res.status(400).json({
          success: false,
          message: 'Discount must be a valid positive number'
        });
      }
      packageData.discount = discountNum;
    }
    if (selectedTests && Array.isArray(selectedTests) && selectedTests.length > 0) {
      // Validate that all selected tests exist and are active
      const tests = await Test.find({ 
        _id: { $in: selectedTests }, 
        isActive: true 
      });

      if (tests.length !== selectedTests.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more selected tests are invalid or inactive'
        });
      }
      packageData.selectedTests = selectedTests;
    }
    if (duration !== undefined) packageData.duration = duration ? duration.trim() : '';
    if (benefits !== undefined) packageData.benefits = benefits ? benefits.trim() : '';

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (packageData.image && fs.existsSync(packageData.image)) {
        fs.unlinkSync(packageData.image);
      }
      packageData.image = req.file.path;
    }

    await packageData.save();

    // Populate fields
    await packageData.populate([
      { path: 'selectedTests', select: 'name category price duration' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]);

    res.json({
      success: true,
      message: 'Package updated successfully',
      data: packageData
    });
  } catch (error) {
    console.error('Error updating package:', error);
    
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
      message: 'Server error while updating package'
    });
  }
});

// @route   DELETE /api/packages/:id
// @desc    Delete a package
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

    const packageData = await Package.findById(req.params.id);
    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Delete image file if exists
    if (packageData.image && fs.existsSync(packageData.image)) {
      fs.unlinkSync(packageData.image);
    }

    // Soft delete by setting isActive to false
    packageData.isActive = false;
    await packageData.save();

    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting package'
    });
  }
});

// @route   GET /api/packages/:id
// @desc    Get a single package
// @access  Private (Admin/Staff)
router.get('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin or staff
    if (!['admin', 'staff', 'lab_manager', 'technician'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or staff role required.'
      });
    }

    const packageData = await Package.findById(req.params.id)
      .populate('selectedTests', 'name category price duration')
      .populate('createdBy', 'firstName lastName email');

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    res.json({
      success: true,
      data: packageData
    });
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching package'
    });
  }
});

// @route   GET /api/packages/lab/:labId
// @desc    Get all packages for a specific lab
// @access  Local Admin only
router.get('/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages for your assigned lab.' 
      });
    }

    // First, get the lab to find which packages are available for this lab
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availablePackages');
    
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Get packages that are available for this lab
    const packages = await Package.find({ 
      _id: { $in: lab.availablePackages || [] }, 
      isActive: true 
    })
      .populate('selectedTests', 'name category price duration')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: packages
    });
  } catch (error) {
    console.error('Error fetching lab packages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching lab packages'
    });
  }
});

// @route   GET /api/packages/available/lab/:labId
// @desc    Get all available packages that can be added to a lab (with current lab assignments)
// @access  Local Admin only
router.get('/available/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages for your assigned lab.' 
      });
    }

    // Get all active packages
    const allPackages = await Package.find({ isActive: true })
      .populate('selectedTests', 'name category price duration')
      .sort({ createdAt: -1 });

    // Get the lab to find which packages are already assigned
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availablePackages');
    
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Mark which packages are already assigned to this lab
    const packagesWithAssignment = allPackages.map(pkg => ({
      ...pkg.toObject(),
      isAssignedToLab: lab.availablePackages.includes(pkg._id.toString())
    }));

    res.json({
      success: true,
      data: packagesWithAssignment
    });
  } catch (error) {
    console.error('Error fetching available packages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available packages'
    });
  }
});

// @route   PUT /api/packages/lab/:labId/assign
// @desc    Assign/unassign packages to/from a lab
// @access  Local Admin only
router.put('/lab/:labId/assign', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;
    const { packageIds } = req.body;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages for your assigned lab.' 
      });
    }

    if (!Array.isArray(packageIds)) {
      return res.status(400).json({
        success: false,
        message: 'packageIds must be an array'
      });
    }

    // Validate that all packages exist and are active
    const validPackages = await Package.find({ 
      _id: { $in: packageIds }, 
      isActive: true 
    });

    if (validPackages.length !== packageIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some packages are invalid or inactive'
      });
    }

    // Update the lab's availablePackages array
    const Lab = require('../models/Lab');
    const updatedLab = await Lab.findByIdAndUpdate(
      labId,
      { availablePackages: packageIds },
      { new: true }
    ).select('availablePackages');

    if (!updatedLab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Get the updated packages for response
    const updatedPackages = await Package.find({ 
      _id: { $in: updatedLab.availablePackages }, 
      isActive: true 
    })
      .populate('selectedTests', 'name category price duration')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Package assignments updated successfully',
      data: updatedPackages
    });
  } catch (error) {
    console.error('Error updating package assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating package assignments'
    });
  }
});

// @route   POST /api/packages/lab/:labId
// @desc    Create a new package for a specific lab (Local Admin only)
// @access  Local Admin only
router.post('/lab/:labId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages for your assigned lab.' 
      });
    }

    const { name, description, price, duration, selectedTests } = req.body;

    // Validation
    if (!name || !description || !price || !duration) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, description, price, and duration are required.' 
      });
    }

    // Validate that selected tests exist and are available for this lab
    if (selectedTests && selectedTests.length > 0) {
      const Lab = require('../models/Lab');
      const lab = await Lab.findById(labId).select('availableTests');
      
      if (!lab) {
        return res.status(404).json({
          success: false,
          message: 'Lab not found'
        });
      }

      // Check if all selected tests are available for this lab
      const availableTestIds = lab.availableTests.map(id => id.toString());
      const invalidTests = selectedTests.filter(testId => !availableTestIds.includes(testId.toString()));
      
      if (invalidTests.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected tests are not available for your lab.' 
        });
      }

      // Verify tests are active
      const Test = require('../models/Test');
      const testCount = await Test.countDocuments({ 
        _id: { $in: selectedTests }, 
        isActive: true 
      });
      if (testCount !== selectedTests.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected tests are invalid or inactive.' 
        });
      }
    }

    // Create new package (global package)
    const newPackage = new Package({
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      duration: duration.trim(),
      selectedTests: selectedTests || [],
      isActive: true,
      createdBy: req.user.id
    });

    await newPackage.save();

    // Add the package to the lab's availablePackages array
    const Lab = require('../models/Lab');
    await Lab.findByIdAndUpdate(
      labId,
      { $addToSet: { availablePackages: newPackage._id } },
      { new: true }
    );

    // Populate the selectedTests for the response
    const populatedPackage = await Package.findById(newPackage._id)
      .populate('selectedTests', 'name category price duration');

    res.status(201).json({
      success: true,
      message: 'Package created successfully and added to your lab.',
      data: populatedPackage
    });

  } catch (error) {
    console.error('Error creating package:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not create package.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/packages/lab/:labId/:packageId
// @desc    Update package for a specific lab (Local Admin only)
// @access  Local Admin only
router.put('/lab/:labId/:packageId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId, packageId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages for your assigned lab.' 
      });
    }

    // Check if package exists
    const packageItem = await Package.findById(packageId);
    if (!packageItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Package not found.' 
      });
    }

    // Check if the package is available for this lab
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availablePackages');
    if (!lab || !lab.availablePackages.includes(packageId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages assigned to your lab.' 
      });
    }

    const { name, description, price, duration, selectedTests } = req.body;

    // Validate that selected tests are available for this lab
    if (selectedTests && selectedTests.length > 0) {
      const labWithTests = await Lab.findById(labId).select('availableTests');
      
      // Check if all selected tests are available for this lab
      const availableTestIds = labWithTests.availableTests.map(id => id.toString());
      const invalidTests = selectedTests.filter(testId => !availableTestIds.includes(testId.toString()));
      
      if (invalidTests.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected tests are not available for your lab.' 
        });
      }

      // Verify tests are active
      const Test = require('../models/Test');
      const testCount = await Test.countDocuments({ 
        _id: { $in: selectedTests }, 
        isActive: true 
      });
      if (testCount !== selectedTests.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected tests are invalid or inactive.' 
        });
      }
    }

    // Update fields
    if (name) packageItem.name = name.trim();
    if (description) packageItem.description = description.trim();
    if (price) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid positive number'
        });
      }
      packageItem.price = priceNum;
    }
    if (duration) packageItem.duration = duration.trim();
    if (selectedTests !== undefined) packageItem.selectedTests = selectedTests;

    await packageItem.save();

    // Populate the selectedTests for the response
    const populatedPackage = await Package.findById(packageItem._id)
      .populate('selectedTests', 'name category price duration');

    res.status(200).json({
      success: true,
      message: 'Package updated successfully.',
      data: populatedPackage
    });

  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not update package.' 
    });
  }
});

// @route   DELETE /api/packages/lab/:labId/:packageId
// @desc    Delete package for a specific lab (Local Admin only)
// @access  Local Admin only
router.delete('/lab/:labId/:packageId', auth, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId, packageId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages for your assigned lab.' 
      });
    }

    // Check if package exists
    const packageItem = await Package.findById(packageId);
    if (!packageItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Package not found.' 
      });
    }

    // Check if the package is available for this lab
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('availablePackages');
    if (!lab || !lab.availablePackages.includes(packageId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage packages assigned to your lab.' 
      });
    }

    // Remove the package from the lab's availablePackages array
    await Lab.findByIdAndUpdate(
      labId,
      { $pull: { availablePackages: packageId } },
      { new: true }
    );

    // Soft delete the package (set isActive to false)
    packageItem.isActive = false;
    await packageItem.save();

    res.status(200).json({
      success: true,
      message: 'Package removed from your lab successfully.'
    });

  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not delete package.' 
    });
  }
});

module.exports = router;
