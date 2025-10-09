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

// Recreate admin user
const recreateAdminUser = async () => {
  try {
    // Delete existing admin user
    await User.deleteOne({ email: 'admin@labmate.com' });
    console.log('Deleted existing admin user');

    // Hash the password with the same method used in User model
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('Admin@123', saltRounds);

    console.log('Password hash:', hashedPassword.substring(0, 30) + '...');

    // Test the hash immediately
    const testResult = await bcrypt.compare('Admin@123', hashedPassword);
    console.log('Immediate test result:', testResult);

    // Create new admin user
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@labmate.com',
      phone: '+1234567890',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
    });

    await adminUser.save();

    console.log('✅ New admin user created successfully!');
    console.log('Email: admin@labmate.com');
    console.log('Password: Admin@123');
    console.log('Role: admin');
    console.log('User ID:', adminUser._id);

    // Test password comparison using the model method
    const finalTest = await adminUser.comparePassword('Admin@123');
    console.log('Final password test:', finalTest);

  } catch (error) {
    console.error('Error recreating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the script
const runScript = async () => {
  await connectDB();
  await recreateAdminUser();
};

runScript();
