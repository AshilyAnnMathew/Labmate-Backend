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

// Test password
const testPassword = async () => {
  try {
    const adminUser = await User.findOne({ email: 'admin@labmate.com' });
    
    if (!adminUser) {
      console.log('❌ Admin user not found!');
      return;
    }

    console.log('Testing password for admin user...');
    console.log('Stored password hash:', adminUser.password.substring(0, 20) + '...');
    
    // Test the password
    const isValid = await adminUser.comparePassword('Admin@123');
    console.log('Password validation result:', isValid);
    
    // Also test with bcrypt directly
    const directTest = await bcrypt.compare('Admin@123', adminUser.password);
    console.log('Direct bcrypt test result:', directTest);

  } catch (error) {
    console.error('Error testing password:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the script
const runScript = async () => {
  await connectDB();
  await testPassword();
};

runScript();
