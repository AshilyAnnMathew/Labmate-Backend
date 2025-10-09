const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const router = express.Router();

// @route   GET /api/staff
// @desc    Get all staff members
// @access  Admin only
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    // Get all staff members (exclude regular users)
    const staffMembers = await User.find({
      role: { $in: ['staff', 'lab_technician', 'xray_technician', 'local_admin', 'admin'] }
    }).select('-password').sort({ createdAt: -1 });

    // Populate lab information for staff members with assigned labs
    const populatedStaff = await Promise.all(staffMembers.map(async (staff) => {
      const staffObj = staff.toObject();
      if (staffObj.assignedLab) {
        const Lab = require('../models/Lab');
        const lab = await Lab.findById(staffObj.assignedLab).select('name');
        if (lab) {
          staffObj.assignedLabInfo = { _id: lab._id, name: lab.name };
        }
      }
      return staffObj;
    }));

    res.status(200).json({
      success: true,
      data: populatedStaff,
      count: populatedStaff.length
    });
  } catch (error) {
    console.error('Error fetching staff members:', error);
    res.status(500).json({ success: false, message: 'Server error. Could not fetch staff members.' });
  }
});

// @route   GET /api/staff/users
// @desc    Get all regular users/patients
// @access  Admin only
router.get('/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    // Get all regular users/patients
    const users = await User.find({ role: 'user' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Server error. Could not fetch users.' });
  }
});

// @route   POST /api/staff
// @desc    Create a new staff member
// @access  Admin only
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { firstName, lastName, email, phone, role, department, assignedLab, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !role || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists.' 
      });
    }

    // Validate role
    const validRoles = ['staff', 'lab_technician', 'xray_technician', 'local_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Must be staff, lab_technician, xray_technician, or local_admin.' 
      });
    }

    // Validate lab assignment for local_admin role
    if (role === 'local_admin' && (!assignedLab || assignedLab.trim() === '')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lab assignment is required for local_admin role.' 
      });
    }

    // Create new staff member
    const newStaff = new User({
      firstName,
      lastName,
      email,
      phone,
      password, // Will be hashed by pre-save hook
      role,
      department,
      assignedLab: assignedLab && assignedLab.trim() !== '' ? assignedLab : null,
      isEmailVerified: true, // Staff accounts are pre-verified
      isActive: true,
      joinDate: new Date()
    });

    await newStaff.save();

    // Send welcome email with login credentials
    try {
      await emailService.sendStaffWelcomeEmail(
        newStaff.email, 
        newStaff.firstName, 
        newStaff.lastName,
        password,
        newStaff.role,
        newStaff.department
      );
      console.log(`Welcome email sent to ${newStaff.email}`);
    } catch (emailError) {
      console.error('Error sending staff welcome email:', emailError);
      // Don't fail the request if email fails, just log it
      console.log('Staff member created successfully, but email could not be sent');
    }

    // Return staff member without password, populated with lab info if assigned
    let staffData = newStaff.toJSON();
    
    // If assignedLab exists, populate it
    if (staffData.assignedLab) {
      const Lab = require('../models/Lab');
      const lab = await Lab.findById(staffData.assignedLab).select('name');
      if (lab) {
        staffData.assignedLabInfo = { _id: lab._id, name: lab.name };
      }
    }

    res.status(201).json({
      success: true,
      message: 'Staff member created successfully and welcome email sent.',
      data: staffData
    });

  } catch (error) {
    console.error('Error creating staff member:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not create staff member.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/staff/:id
// @desc    Update staff member
// @access  Admin only
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { firstName, lastName, email, phone, role, department, assignedLab, isActive } = req.body;
    const staffId = req.params.id;

    // Check if staff member exists
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff member not found.' 
      });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== staff.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already exists.' 
        });
      }
    }

    // Validate lab assignment for local_admin role
    if (role === 'local_admin' && (!assignedLab || assignedLab.trim() === '')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lab assignment is required for local_admin role.' 
      });
    }

    // Update fields
    const updateFields = {};
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;
    if (email) updateFields.email = email;
    if (phone) updateFields.phone = phone;
    if (role) updateFields.role = role;
    if (department !== undefined) updateFields.department = department;
    if (assignedLab !== undefined) updateFields.assignedLab = assignedLab && assignedLab.trim() !== '' ? assignedLab : null;
    if (isActive !== undefined) updateFields.isActive = isActive;

    const updatedStaff = await User.findByIdAndUpdate(
      staffId,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password');

    // Add lab information if assigned
    let staffData = updatedStaff.toJSON();
    if (staffData.assignedLab) {
      const Lab = require('../models/Lab');
      const lab = await Lab.findById(staffData.assignedLab).select('name');
      if (lab) {
        staffData.assignedLabInfo = { _id: lab._id, name: lab.name };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully.',
      data: staffData
    });

  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not update staff member.' 
    });
  }
});

// @route   DELETE /api/staff/:id
// @desc    Delete staff member
// @access  Admin only
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const staffId = req.params.id;

    // Prevent admin from deleting themselves
    if (staffId === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot delete your own account.' 
      });
    }

    // Check if staff member exists
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff member not found.' 
      });
    }

    await User.findByIdAndDelete(staffId);

    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully.'
    });

  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not delete staff member.' 
    });
  }
});

// @route   GET /api/staff/:id
// @desc    Get single staff member
// @access  Admin only
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const staff = await User.findById(req.params.id).select('-password');
    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff member not found.' 
      });
    }

    res.status(200).json({
      success: true,
      data: staff
    });

  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not fetch staff member.' 
    });
  }
});

// @route   PUT /api/staff/user/:id/block
// @desc    Update user block status
// @access  Private (Admin only)
router.put('/user/:id/block', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { isBlocked, blockReason } = req.body;

    // Find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent blocking admin users
    if (user.email === 'admin@labmate.com') {
      return res.status(400).json({ success: false, message: 'Admin user cannot be blocked.' });
    }

    // Update user block status
    const updateData = {
      isBlocked: isBlocked,
      updatedAt: new Date()
    };

    if (isBlocked) {
      updateData.blockReason = blockReason || 'Blocked by administrator';
      updateData.blockedAt = new Date();
    } else {
      updateData.blockReason = null;
      updateData.blockedAt = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: `User has been ${isBlocked ? 'blocked' : 'unblocked'} successfully.`,
      data: updatedUser
    });

  } catch (err) {
    console.error('Error updating user block status:', err);
    res.status(500).json({
      success: false,
      message: 'Server error. Could not update user block status.',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// @route   GET /api/staff/lab/:labId
// @desc    Get all staff members for a specific lab
// @access  Local Admin only
router.get('/lab/:labId', authenticateToken, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ success: false, message: 'Access denied. You can only manage staff for your assigned lab.' });
    }

    // Get all staff members for the specific lab
    const staffMembers = await User.find({
      assignedLab: labId,
      role: { $in: ['staff', 'lab_technician', 'xray_technician'] }
    }).select('-password').sort({ createdAt: -1 });

    // Populate lab information
    const populatedStaff = await Promise.all(staffMembers.map(async (staff) => {
      const staffObj = staff.toObject();
      if (staffObj.assignedLab) {
        const Lab = require('../models/Lab');
        const lab = await Lab.findById(staffObj.assignedLab).select('name');
        if (lab) {
          staffObj.assignedLabInfo = { _id: lab._id, name: lab.name };
        }
      }
      return staffObj;
    }));

    res.status(200).json({
      success: true,
      data: populatedStaff,
      count: populatedStaff.length
    });
  } catch (error) {
    console.error('Error fetching lab staff members:', error);
    res.status(500).json({ success: false, message: 'Server error. Could not fetch lab staff members.' });
  }
});

// @route   POST /api/staff/lab/:labId
// @desc    Create a new staff member for a specific lab (Local Admin only)
// @access  Local Admin only
router.post('/lab/:labId', authenticateToken, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage staff for your assigned lab.' 
      });
    }

    const { firstName, lastName, email, phone, role: staffRole, department, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !staffRole || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists.' 
      });
    }

    // Validate role (local admin can only create staff, lab_technician, xray_technician - not other local_admin or admin)
    const validRoles = ['staff', 'lab_technician', 'xray_technician'];
    if (!validRoles.includes(staffRole)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. You can only create staff, lab_technician, or xray_technician.' 
      });
    }

    // Create new staff member
    const newStaff = new User({
      firstName,
      lastName,
      email,
      phone,
      password, // Will be hashed by pre-save hook
      role: staffRole,
      department,
      assignedLab: labId, // Always assign to the lab the local admin manages
      isEmailVerified: true, // Staff accounts are pre-verified
      isActive: true,
      joinDate: new Date()
    });

    await newStaff.save();

    // Send welcome email with login credentials
    try {
      await emailService.sendStaffWelcomeEmail(
        newStaff.email, 
        newStaff.firstName, 
        newStaff.lastName,
        password,
        newStaff.role,
        newStaff.department
      );
      console.log(`Welcome email sent to ${newStaff.email}`);
    } catch (emailError) {
      console.error('Error sending staff welcome email:', emailError);
      // Don't fail the request if email fails, just log it
      console.log('Staff member created successfully, but email could not be sent');
    }

    // Return staff member without password, populated with lab info
    let staffData = newStaff.toJSON();
    
    // Populate lab information
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('name');
    if (lab) {
      staffData.assignedLabInfo = { _id: lab._id, name: lab.name };
    }

    res.status(201).json({
      success: true,
      message: 'Staff member created successfully and welcome email sent.',
      data: staffData
    });

  } catch (error) {
    console.error('Error creating staff member:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not create staff member.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/staff/lab/:labId/:staffId
// @desc    Update staff member for a specific lab (Local Admin only)
// @access  Local Admin only
router.put('/lab/:labId/:staffId', authenticateToken, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId, staffId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage staff for your assigned lab.' 
      });
    }

    const { firstName, lastName, email, phone, role: staffRole, department, isActive } = req.body;

    // Check if staff member exists and belongs to this lab
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff member not found.' 
      });
    }

    // Ensure the staff member belongs to the lab the local admin manages
    if (staff.assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage staff assigned to your lab.' 
      });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== staff.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already exists.' 
        });
      }
    }

    // Validate role (local admin can only update staff, lab_technician, xray_technician)
    if (staffRole) {
      const validRoles = ['staff', 'lab_technician', 'xray_technician'];
      if (!validRoles.includes(staffRole)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid role. You can only assign staff, lab_technician, or xray_technician roles.' 
        });
      }
    }

    // Update fields
    const updateFields = {};
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;
    if (email) updateFields.email = email;
    if (phone) updateFields.phone = phone;
    if (staffRole) updateFields.role = staffRole;
    if (department !== undefined) updateFields.department = department;
    if (isActive !== undefined) updateFields.isActive = isActive;

    const updatedStaff = await User.findByIdAndUpdate(
      staffId,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password');

    // Add lab information
    let staffData = updatedStaff.toJSON();
    const Lab = require('../models/Lab');
    const lab = await Lab.findById(labId).select('name');
    if (lab) {
      staffData.assignedLabInfo = { _id: lab._id, name: lab.name };
    }

    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully.',
      data: staffData
    });

  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not update staff member.' 
    });
  }
});

// @route   DELETE /api/staff/lab/:labId/:staffId
// @desc    Delete staff member for a specific lab (Local Admin only)
// @access  Local Admin only
router.delete('/lab/:labId/:staffId', authenticateToken, async (req, res) => {
  try {
    const { role, assignedLab } = req.user;
    const { labId, staffId } = req.params;

    // Check if user is local_admin and has access to this lab
    if (role !== 'local_admin' || assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage staff for your assigned lab.' 
      });
    }

    // Check if staff member exists and belongs to this lab
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff member not found.' 
      });
    }

    // Ensure the staff member belongs to the lab the local admin manages
    if (staff.assignedLab.toString() !== labId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only manage staff assigned to your lab.' 
      });
    }

    await User.findByIdAndDelete(staffId);

    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully.'
    });

  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Could not delete staff member.' 
    });
  }
});

module.exports = router;
