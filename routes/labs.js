const express = require('express');
const router = express.Router();
const Lab = require('../models/Lab');
const Test = require('../models/Test');
const Package = require('../models/Package');
const { authenticateToken: auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/labs/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'lab-' + uniqueSuffix + path.extname(file.originalname));
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

// GET /api/labs - Fetch all labs (public endpoint for users, admin/staff for management)
router.get('/', auth, async (req, res) => {
  try {
    const { role } = req.user;
    
    // Admin and staff get full access, users get public access
    let query = {};
    if (!['admin', 'staff'].includes(role)) {
      // Regular users only see active labs
      query = { isActive: true };
    }
    
    const labs = await Lab.find(query)
      .populate('availableTests', 'name price category')
      .populate('availablePackages', 'name price')
      .sort({ createdAt: -1 });

    // Add createdBy info only for admin/staff
    if (['admin', 'staff'].includes(role)) {
      await Lab.populate(labs, { path: 'createdBy', select: 'firstName lastName' });
    }

    res.json({
      success: true,
      data: labs
    });
  } catch (error) {
    console.error('Error fetching labs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch labs',
      error: error.message 
    });
  }
});

// GET /api/labs/:id - Fetch single lab (public endpoint for users)
router.get('/:id', auth, async (req, res) => {
  try {
    const { role } = req.user;
    
    const lab = await Lab.findById(req.params.id)
      .populate('availableTests', 'name price category description')
      .populate('availablePackages', 'name price description selectedTests');

    if (!lab) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lab not found' 
      });
    }
    
    // Regular users can only access active labs
    if (!['admin', 'staff'].includes(role) && !lab.isActive) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lab not found' 
      });
    }

    // Add createdBy/updatedBy info only for admin/staff
    if (['admin', 'staff'].includes(role)) {
      await Lab.populate(lab, [
        { path: 'createdBy', select: 'firstName lastName' },
        { path: 'updatedBy', select: 'firstName lastName' }
      ]);
    }

    res.json({
      success: true,
      data: lab
    });
  } catch (error) {
    console.error('Error fetching lab:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch lab',
      error: error.message 
    });
  }
});

// POST /api/labs - Create new lab
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { role } = req.user;
    
    if (!['admin', 'staff'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      name,
      description,
      address,
      contact,
      operatingHours,
      facilities,
      availableTests,
      availablePackages,
      capacity,
      isActive
    } = req.body;

    // Validate required fields
    if (!name || !description || !address || !contact) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, description, address, and contact are required' 
      });
    }

    // Parse JSON fields
    let parsedAddress, parsedContact, parsedOperatingHours, parsedFacilities;
    let parsedAvailableTests = [], parsedAvailablePackages = [];
    let parsedCapacity = {};

    try {
      parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
      parsedContact = typeof contact === 'string' ? JSON.parse(contact) : contact;
      parsedOperatingHours = typeof operatingHours === 'string' ? JSON.parse(operatingHours) : operatingHours;
      parsedFacilities = typeof facilities === 'string' ? JSON.parse(facilities) : facilities;
      
      if (availableTests) {
        parsedAvailableTests = typeof availableTests === 'string' ? JSON.parse(availableTests) : availableTests;
      }
      if (availablePackages) {
        parsedAvailablePackages = typeof availablePackages === 'string' ? JSON.parse(availablePackages) : availablePackages;
      }
      if (capacity) {
        parsedCapacity = typeof capacity === 'string' ? JSON.parse(capacity) : capacity;
      }
    } catch (parseError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid JSON format in request body' 
      });
    }

    // Validate available tests and packages exist
    if (parsedAvailableTests.length > 0) {
      const testCount = await Test.countDocuments({ 
        _id: { $in: parsedAvailableTests }, 
        isActive: true 
      });
      if (testCount !== parsedAvailableTests.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected tests are invalid or inactive' 
        });
      }
    }

    if (parsedAvailablePackages.length > 0) {
      const packageCount = await Package.countDocuments({ 
        _id: { $in: parsedAvailablePackages }, 
        isActive: true 
      });
      if (packageCount !== parsedAvailablePackages.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected packages are invalid or inactive' 
        });
      }
    }

    let imagePath = null;
    if (req.file) {
      imagePath = req.file.path;
    }

    const labData = new Lab({
      name,
      description,
      address: parsedAddress,
      contact: parsedContact,
      operatingHours: parsedOperatingHours || {},
      facilities: parsedFacilities || [],
      availableTests: parsedAvailableTests,
      availablePackages: parsedAvailablePackages,
      capacity: parsedCapacity || { daily: 100, hourly: 10 },
      image: imagePath,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id
    });

    const savedLab = await labData.save();
    
    const populatedLab = await Lab.findById(savedLab._id)
      .populate('availableTests', 'name price category')
      .populate('availablePackages', 'name price')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Lab created successfully',
      data: populatedLab
    });
  } catch (error) {
    console.error('Error creating lab:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create lab',
      error: error.message 
    });
  }
});

// PUT /api/labs/:id - Update lab
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { role } = req.user;
    
    if (!['admin', 'staff'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const lab = await Lab.findById(req.params.id);
    if (!lab || !lab.isActive) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lab not found' 
      });
    }

    const {
      name,
      description,
      address,
      contact,
      operatingHours,
      facilities,
      availableTests,
      availablePackages,
      capacity,
      isActive
    } = req.body;

    // Parse JSON fields
    let parsedAddress, parsedContact, parsedOperatingHours, parsedFacilities;
    let parsedAvailableTests = [], parsedAvailablePackages = [];
    let parsedCapacity = {};

    try {
      if (address) {
        parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
        lab.address = parsedAddress;
      }
      if (contact) {
        parsedContact = typeof contact === 'string' ? JSON.parse(contact) : contact;
        lab.contact = parsedContact;
      }
      if (operatingHours) {
        parsedOperatingHours = typeof operatingHours === 'string' ? JSON.parse(operatingHours) : operatingHours;
        lab.operatingHours = parsedOperatingHours;
      }
      if (facilities) {
        parsedFacilities = typeof facilities === 'string' ? JSON.parse(facilities) : facilities;
        lab.facilities = parsedFacilities;
      }
      if (availableTests) {
        parsedAvailableTests = typeof availableTests === 'string' ? JSON.parse(availableTests) : availableTests;
        lab.availableTests = parsedAvailableTests;
      }
      if (availablePackages) {
        parsedAvailablePackages = typeof availablePackages === 'string' ? JSON.parse(availablePackages) : availablePackages;
        lab.availablePackages = parsedAvailablePackages;
      }
      if (capacity) {
        parsedCapacity = typeof capacity === 'string' ? JSON.parse(capacity) : capacity;
        lab.capacity = parsedCapacity;
      }
    } catch (parseError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid JSON format in request body' 
      });
    }

    // Validate available tests and packages exist
    if (parsedAvailableTests.length > 0) {
      const testCount = await Test.countDocuments({ 
        _id: { $in: parsedAvailableTests }, 
        isActive: true 
      });
      if (testCount !== parsedAvailableTests.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected tests are invalid or inactive' 
        });
      }
    }

    if (parsedAvailablePackages.length > 0) {
      const packageCount = await Package.countDocuments({ 
        _id: { $in: parsedAvailablePackages }, 
        isActive: true 
      });
      if (packageCount !== parsedAvailablePackages.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some selected packages are invalid or inactive' 
        });
      }
    }

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (lab.image && fs.existsSync(lab.image)) {
        fs.unlinkSync(lab.image);
      }
      lab.image = req.file.path;
    }

    // Update other fields
    if (name) lab.name = name;
    if (description) lab.description = description;
    if (isActive !== undefined) lab.isActive = isActive;
    lab.updatedBy = req.user.id;

    await lab.save();
    
    const populatedLab = await Lab.findById(lab._id)
      .populate('availableTests', 'name price category')
      .populate('availablePackages', 'name price')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Lab updated successfully',
      data: populatedLab
    });
  } catch (error) {
    console.error('Error updating lab:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update lab',
      error: error.message 
    });
  }
});

// DELETE /api/labs/:id - Delete lab (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { role } = req.user;
    
    if (!['admin', 'staff'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const lab = await Lab.findById(req.params.id);
    if (!lab) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lab not found' 
      });
    }

    // Check if lab is already deleted
    if (!lab.isActive) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lab is already deleted' 
      });
    }

    // Delete image file if exists
    if (lab.image && fs.existsSync(lab.image)) {
      fs.unlinkSync(lab.image);
    }

    // Soft delete by setting isActive to false
    lab.isActive = false;
    lab.updatedBy = req.user.id;
    await lab.save();

    res.json({
      success: true,
      message: 'Lab deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting lab:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete lab',
      error: error.message 
    });
  }
});

module.exports = router;
