const mongoose = require('mongoose');
require('dotenv').config();

const Test = require('./models/Test');
const Package = require('./models/Package');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const fs = require('fs');

const checkImages = async () => {
    await connectDB();

    let log = '';
    log += '--- TESTS ---\n';
    const tests = await Test.find({}, 'name image category');
    if (tests.length === 0) log += 'No tests found.\n';
    tests.forEach(t => {
        log += `Test: ${t.name} | Category: ${t.category} | Image: ${t.image || 'NULL'}\n`;
    });

    log += '\n--- PACKAGES ---\n';
    const packages = await Package.find({}, 'name image');
    if (packages.length === 0) log += 'No packages found.\n';
    packages.forEach(p => {
        log += `Package: ${p.name} | Image: ${p.image || 'NULL'}\n`;
    });

    fs.writeFileSync('images_log.txt', log);
    console.log('Log written to images_log.txt');

    mongoose.connection.close();
};

checkImages();
