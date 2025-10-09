const mongoose = require('mongoose');
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

// Create admin user (let the model handle password hashing)
const createAdminUser = async () => {
  try {
    // Delete existing admin user if any
    await User.deleteOne({ email: 'admin@labmate.com' });
    console.log('Deleted existing admin user');

    // Create admin user with plain text password (model will hash it)
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@labmate.com',
      phone: '+1234567890',
      password: 'Admin@123', // Plain text - model will hash it
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
    });

    await adminUser.save();

    console.log('✅ Admin user created successfully!');
    console.log('Email: admin@labmate.com');
    console.log('Password: Admin@123');
    console.log('Role: admin');
    console.log('Email Verified: true');
    console.log('User ID:', adminUser._id);

    // Test password comparison
    const passwordTest = await adminUser.comparePassword('Admin@123');
    console.log('Password validation test:', passwordTest);

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
