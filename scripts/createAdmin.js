const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('../models/User');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Create admin user
const createAdminUser = async () => {
  try {
    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@labmate.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
      console.log('Email Verified:', existingAdmin.isEmailVerified);
      return;
    }

    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('Admin@123', saltRounds);

    // Create admin user
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@labmate.com',
      phone: '+1234567890',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      isEmailVerified: true, // Admin user is pre-verified
    });

    await adminUser.save();

    console.log('✅ Admin user created successfully!');
    console.log('Email: admin@labmate.com');
    console.log('Password: Admin@123');
    console.log('Role: admin');
    console.log('Email Verified: true');
    console.log('User ID:', adminUser._id);

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the script
const runScript = async () => {
  await connectDB();
  await createAdminUser();
};

runScript();
