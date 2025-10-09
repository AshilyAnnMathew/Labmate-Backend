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

// Check admin user
const checkAdminUser = async () => {
  try {
    const adminUser = await User.findOne({ email: 'admin@labmate.com' });
    
    if (adminUser) {
      console.log('✅ Admin user found!');
      console.log('Email:', adminUser.email);
      console.log('Role:', adminUser.role);
      console.log('Email Verified:', adminUser.isEmailVerified);
      console.log('Active:', adminUser.isActive);
      console.log('User ID:', adminUser._id);
    } else {
      console.log('❌ Admin user not found!');
    }

    // List all users
    const allUsers = await User.find({}, 'firstName lastName email role isEmailVerified');
    console.log('\nAll users in database:');
    console.table(allUsers);

  } catch (error) {
    console.error('Error checking admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the script
const runScript = async () => {
  await connectDB();
  await checkAdminUser();
};

runScript();
