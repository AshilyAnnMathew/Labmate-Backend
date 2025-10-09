const axios = require('axios');

// Test admin login
const testAdminLogin = async () => {
  try {
    console.log('Testing admin login...');
    
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@labmate.com',
      password: 'Admin@123'
    });

    console.log('✅ Admin login successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.data.user.role === 'admin') {
      console.log('✅ Admin role confirmed!');
    } else {
      console.log('❌ Role mismatch!');
    }

  } catch (error) {
    console.error('❌ Admin login failed:', error.response?.data || error.message);
  }
};

// Run the test
testAdminLogin();
