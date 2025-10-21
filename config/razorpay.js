const Razorpay = require('razorpay');

// Razorpay configuration
const razorpayConfig = {
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_R79jO6N4F99QLG',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'HgKjdH7mCViwebMQTIFmbx7R'
};

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: razorpayConfig.key_id,
  key_secret: razorpayConfig.key_secret
});

module.exports = {
  razorpay,
  razorpayConfig
};
