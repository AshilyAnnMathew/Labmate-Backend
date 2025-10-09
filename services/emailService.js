const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    try {
      // Create transporter using Gmail (you can change this to your preferred email service)
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'your-email@gmail.com',
          pass: process.env.EMAIL_PASSWORD || 'your-app-password'
        }
      });
      console.log('Email service initialized successfully');
    } catch (error) {
      console.error('Error initializing email service:', error);
      this.transporter = null;
    }
  }

  // Send OTP verification email
  async sendOTPVerification(email, otp, firstName) {
    const mailOptions = {
      from: {
        name: 'LabMate360',
        address: process.env.EMAIL_USER || 'noreply@labmate360.com'
      },
      to: email,
      subject: 'Verify Your Email - LabMate360',
      html: this.getOTPEmailTemplate(firstName, otp),
      text: `Hello ${firstName},\n\nYour email verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nLabMate360 Team`
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('OTP email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending OTP email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  // Send welcome email after successful verification
  async sendWelcomeEmail(email, firstName) {
    const mailOptions = {
      from: {
        name: 'LabMate360',
        address: process.env.EMAIL_USER || 'noreply@labmate360.com'
      },
      to: email,
      subject: 'Welcome to LabMate360!',
      html: this.getWelcomeEmailTemplate(firstName),
      text: `Hello ${firstName},\n\nWelcome to LabMate360! Your email has been successfully verified.\n\nYou can now access all features of our AI-powered laboratory management system.\n\nBest regards,\nLabMate360 Team`
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Don't throw error for welcome email as it's not critical
      return { success: false, error: error.message };
    }
  }

  // Send staff welcome email with login credentials
  async sendStaffWelcomeEmail(email, firstName, lastName, password, role, department) {
    if (!this.transporter) {
      console.error('Email service not initialized');
      throw new Error('Email service not available');
    }

    const mailOptions = {
      from: {
        name: 'LabMate360',
        address: process.env.EMAIL_USER || 'noreply@labmate360.com'
      },
      to: email,
      subject: 'Welcome to LabMate360 Staff Portal',
      html: this.getStaffWelcomeEmailTemplate(firstName, lastName, email, password, role, department),
      text: `Hello ${firstName} ${lastName},\n\nWelcome to LabMate360 Staff Portal!\n\nYour account has been created with the following details:\n\nEmail: ${email}\nPassword: ${password}\nRole: ${role}\nDepartment: ${department}\n\nPlease log in and change your password for security.\n\nBest regards,\nLabMate360 Admin Team`
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Staff welcome email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending staff welcome email:', error);
      throw new Error('Failed to send staff welcome email');
    }
  }

  // Get OTP email HTML template
  getOTPEmailTemplate(firstName, otp) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification - LabMate360</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8fafc;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                color: #3b82f6;
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .otp-code {
                background: #eff6ff;
                border: 2px solid #3b82f6;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                margin: 30px 0;
                font-size: 32px;
                font-weight: bold;
                color: #1d4ed8;
                letter-spacing: 5px;
            }
            .warning {
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">LabMate360</div>
                <h1>Email Verification Required</h1>
            </div>
            
            <p>Hello <strong>${firstName}</strong>,</p>
            
            <p>Thank you for registering with LabMate360! To complete your registration and verify your email address, please use the verification code below:</p>
            
            <div class="otp-code">${otp}</div>
            
            <div class="warning">
                <strong>Important:</strong> This verification code will expire in 10 minutes for security reasons.
            </div>
            
            <p>If you didn't create an account with LabMate360, please ignore this email.</p>
            
            <div class="footer">
                <p>This email was sent from LabMate360 - AI-Powered Smart Clinical Laboratory Software</p>
                <p>© 2024 LabMate360. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Get welcome email HTML template
  getWelcomeEmailTemplate(firstName) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to LabMate360</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8fafc;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                color: #3b82f6;
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .success-badge {
                background: #d1fae5;
                color: #065f46;
                padding: 10px 20px;
                border-radius: 20px;
                display: inline-block;
                margin: 20px 0;
                font-weight: bold;
            }
            .features {
                background: #eff6ff;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">LabMate360</div>
                <h1>Welcome to LabMate360!</h1>
                <div class="success-badge">✓ Email Verified Successfully</div>
            </div>
            
            <p>Hello <strong>${firstName}</strong>,</p>
            
            <p>Congratulations! Your email has been successfully verified and your LabMate360 account is now fully active.</p>
            
            <div class="features">
                <h3>What you can do now:</h3>
                <ul>
                    <li>Book laboratory tests and appointments</li>
                    <li>Upload prescriptions for test authorization</li>
                    <li>View your test results and reports</li>
                    <li>Find nearby laboratory locations</li>
                    <li>Access 24/7 customer support</li>
                </ul>
            </div>
            
            <p>Thank you for choosing LabMate360 for your laboratory management needs. We're excited to help streamline your healthcare journey!</p>
            
            <div class="footer">
                <p>This email was sent from LabMate360 - AI-Powered Smart Clinical Laboratory Software</p>
                <p>© 2024 LabMate360. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Get staff welcome email HTML template
  getStaffWelcomeEmailTemplate(firstName, lastName, email, password, role, department) {
    const roleDisplay = role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to LabMate360 Staff Portal</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8fafc;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                color: #3b82f6;
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .welcome-badge {
                background: #d1fae5;
                color: #065f46;
                padding: 10px 20px;
                border-radius: 20px;
                display: inline-block;
                margin: 20px 0;
                font-weight: bold;
            }
            .credentials-box {
                background: #eff6ff;
                border: 2px solid #3b82f6;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
            }
            .credential-item {
                margin: 10px 0;
                padding: 8px 0;
                border-bottom: 1px solid #dbeafe;
            }
            .credential-item:last-child {
                border-bottom: none;
            }
            .credential-label {
                font-weight: bold;
                color: #1d4ed8;
                display: inline-block;
                width: 120px;
            }
            .credential-value {
                color: #1e40af;
                font-family: monospace;
                background: #dbeafe;
                padding: 2px 8px;
                border-radius: 4px;
            }
            .password-highlight {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                color: #92400e;
                font-weight: bold;
            }
            .warning {
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            .features {
                background: #f0f9ff;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">LabMate360</div>
                <h1>Welcome to LabMate360 Staff Portal!</h1>
                <div class="welcome-badge">✓ Staff Account Created</div>
            </div>
            
            <p>Hello <strong>${firstName} ${lastName}</strong>,</p>
            
            <p>Welcome to the LabMate360 team! Your staff account has been successfully created. You now have access to our comprehensive laboratory management system.</p>
            
            <div class="credentials-box">
                <h3>Your Login Credentials:</h3>
                <div class="credential-item">
                    <span class="credential-label">Email:</span>
                    <span class="credential-value">${email}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">Password:</span>
                    <span class="credential-value password-highlight">${password}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">Role:</span>
                    <span class="credential-value">${roleDisplay}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">Department:</span>
                    <span class="credential-value">${department}</span>
                </div>
            </div>
            
            <div class="warning">
                <strong>Security Notice:</strong> Please log in immediately and change your password for security purposes. Keep your login credentials confidential.
            </div>
            
            <div class="features">
                <h3>What you can do with your account:</h3>
                <ul>
                    <li>Access the staff dashboard with role-specific features</li>
                    <li>Manage patient bookings and appointments</li>
                    <li>Upload and manage test reports</li>
                    <li>Handle prescription processing</li>
                    <li>Communicate with patients</li>
                    <li>View laboratory analytics and reports</li>
                </ul>
            </div>
            
            <p>If you have any questions or need assistance, please contact the system administrator.</p>
            
            <p>We're excited to have you on the LabMate360 team!</p>
            
            <div class="footer">
                <p>This email was sent from LabMate360 - AI-Powered Smart Clinical Laboratory Software</p>
                <p>© 2024 LabMate360. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }
}

module.exports = new EmailService();
