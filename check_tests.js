require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/database');

connectDB().then(async () => {
    const Test = require('./models/Test');

    const tests = await Test.find({}).select('name isActive category');

    console.log('\n=== ALL TESTS IN DATABASE ===');
    tests.forEach(t => {
        console.log(t.isActive ? '✅' : '❌', t.name, `(${t.category})`, t.isActive ? '' : '<-- INACTIVE');
    });

    const inactive = tests.filter(t => !t.isActive);
    console.log(`\nTotal: ${tests.length} | Active: ${tests.filter(t => t.isActive).length} | Inactive: ${inactive.length}`);

    if (inactive.length > 0) {
        console.log('\n--- Activating all inactive tests ---');
        const result = await Test.updateMany({ isActive: false }, { $set: { isActive: true } });
        console.log(`Activated ${result.modifiedCount} tests`);
    }

    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
