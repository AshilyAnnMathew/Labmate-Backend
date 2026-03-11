const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const User = require('./models/User');

    // Set all users as email verified
    const result = await User.updateMany(
        { isEmailVerified: { $ne: true } },
        { $set: { isEmailVerified: true } }
    );

    console.log('Updated', result.modifiedCount, 'users to email verified');

    const total = await User.countDocuments();
    const verified = await User.countDocuments({ isEmailVerified: true });
    console.log('Total users:', total, '| Verified:', verified);

    process.exit(0);
}).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
