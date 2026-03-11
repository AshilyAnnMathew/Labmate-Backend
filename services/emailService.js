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

    // Send result published notification email
    async sendResultPublishedEmail(email, firstName, labName, testSummary, bookingId) {
        if (!this.transporter) {
            console.error('Email service not initialized');
            return { success: false, error: 'Email service not available' };
        }

        const mailOptions = {
            from: {
                name: 'LabMate360',
                address: process.env.EMAIL_USER || 'noreply@labmate360.com'
            },
            to: email,
            subject: `Your Lab Results Are Ready - ${labName || 'LabMate360'}`,
            html: this.getResultPublishedEmailTemplate(firstName, labName, testSummary, bookingId),
            text: `Hello ${firstName},\n\nYour laboratory test results from ${labName || 'LabMate360'} have been published and are now available for viewing.\n\nPlease log in to your LabMate360 account to view and download your detailed report.\n\nBest regards,\nLabMate360 Team`
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log('Result published email sent successfully:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending result published email:', error);
            return { success: false, error: error.message };
        }
    }

    // Get result published email HTML template
    getResultPublishedEmailTemplate(firstName, labName, testSummary, bookingId) {
        // Build test results rows
        let resultsHTML = '';
        let hasImaging = false;

        if (Array.isArray(testSummary) && testSummary.length > 0) {
            testSummary.forEach(test => {
                if (test.isImaging) {
                    hasImaging = true;
                    resultsHTML += `
            <tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #1f2937;">${test.testName}</td>
              <td colspan="3" style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #0d9488; font-style: italic;">
                Imaging result — download from portal
              </td>
            </tr>`;
                    if (test.findings) {
                        resultsHTML += `
            <tr>
              <td style="padding: 6px 12px 10px; border-bottom: 1px solid #e5e7eb;"></td>
              <td colspan="3" style="padding: 6px 12px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #4b5563;">
                <strong>Findings:</strong> ${test.findings.length > 150 ? test.findings.substring(0, 150) + '...' : test.findings}
              </td>
            </tr>`;
                    }
                } else if (Array.isArray(test.values)) {
                    test.values.forEach((v, vi) => {
                        const isAbn = v.isAbnormal;
                        const rowBg = isAbn ? 'background-color: #fef2f2;' : (vi % 2 === 0 ? 'background-color: #f9fafb;' : '');
                        const valColor = isAbn ? 'color: #dc2626; font-weight: 700;' : 'color: #1f2937;';
                        const flagHTML = isAbn ? `<span style="background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">${v.flag || '!'}</span>` : '<span style="color: #22c55e; font-size: 12px;">✓</span>';

                        resultsHTML += `
            <tr style="${rowBg}">
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${vi === 0 ? `<strong>${test.testName}</strong>` : ''}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${v.label || '-'}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; ${valColor}">${v.value ?? '-'} ${v.unit || ''} ${flagHTML}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${v.referenceRange || '-'}</td>
            </tr>`;
                    });
                }
            });
        }

        const shortId = String(bookingId).slice(-8).toUpperCase();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lab Results Ready - LabMate360</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background: white; padding: 0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
            
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #153760, #1e40af); padding: 30px; text-align: center;">
                <div style="color: white; font-size: 24px; font-weight: bold; margin-bottom: 5px;">LabMate360</div>
                <div style="color: #93c5fd; font-size: 13px;">AI-Powered Smart Clinical Laboratory</div>
            </div>

            <!-- Accent Bar -->
            <div style="height: 4px; background: linear-gradient(to right, #0d9488, #14b8a6);"></div>

            <div style="padding: 30px 35px;">
                <!-- Status Badge -->
                <div style="text-align: center; margin-bottom: 25px;">
                    <span style="background: #d1fae5; color: #065f46; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 14px; display: inline-block;">
                        ✓ Your Results Are Ready
                    </span>
                </div>

                <p style="margin: 0 0 15px;">Hello <strong>${firstName}</strong>,</p>
                
                <p style="margin: 0 0 20px;">Your laboratory test results from <strong>${labName || 'our laboratory'}</strong> have been reviewed, verified, and published. You can now view and download your detailed report.</p>

                <!-- Report Info Box -->
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
                    <div style="display: flex; font-size: 13px; color: #1e40af;">
                        <span><strong>Report ID:</strong> ${shortId}</span>
                    </div>
                </div>

                ${resultsHTML ? `
                <!-- Results Summary Table -->
                <h3 style="color: #153760; font-size: 16px; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">Test Results Summary</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #1e3a5f; color: white;">
                            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600;">TEST</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600;">PARAMETER</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600;">RESULT</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600;">REF. RANGE</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resultsHTML}
                    </tbody>
                </table>
                ` : ''}

                ${hasImaging ? `
                <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 12px 15px; margin-bottom: 20px; font-size: 13px; color: #0f766e;">
                    <strong>📎 Imaging Results:</strong> Some test results include imaging files (X-ray, ECG, etc.) that can be downloaded from the report details page after logging in.
                </div>
                ` : ''}

                <!-- CTA Button -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${frontendUrl}/user/dashboard/reports" style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 14px 35px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 2px 8px rgba(59,130,246,0.3);">
                        View Full Report →
                    </a>
                </div>

                <p style="font-size: 13px; color: #6b7280; text-align: center;">Log in to your LabMate360 account to view, download, and get AI-powered analysis of your results.</p>

                <!-- Disclaimer -->
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; margin: 20px 0; border-radius: 4px; font-size: 12px; color: #92400e;">
                    <strong>Disclaimer:</strong> This email contains a summary of your test results. For complete details, please download the full report from the portal. Consult a healthcare professional for proper interpretation.
                </div>
            </div>

            <!-- Footer -->
            <div style="text-align: center; padding: 20px 30px; background: #f8fafc; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
                <p style="margin: 0 0 5px;">This email was sent from LabMate360 — AI-Powered Smart Clinical Laboratory Software</p>
                <p style="margin: 0;">© 2024 LabMate360. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
    }

    // Send appointment reminder email
    async sendAppointmentReminder(email, firstName, labName, appointmentDate, appointmentTime, tests, reminderType) {
        if (!this.transporter) {
            console.error('Email service not initialized');
            return { success: false, error: 'Email service not available' };
        }

        const isUrgent = reminderType === '1h';
        const subject = isUrgent
            ? `⏰ Appointment in 1 Hour - ${labName || 'LabMate360'}`
            : `📅 Appointment Tomorrow - ${labName || 'LabMate360'}`;

        const mailOptions = {
            from: { name: 'LabMate360', address: process.env.EMAIL_USER || 'noreply@labmate360.com' },
            to: email,
            subject,
            html: this.getAppointmentReminderTemplate(firstName, labName, appointmentDate, appointmentTime, tests, reminderType),
            text: `Hello ${firstName}, this is a reminder that your appointment at ${labName} is scheduled for ${appointmentDate} at ${appointmentTime}. Tests: ${tests}. Please arrive 15 minutes early.`
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`Appointment reminder (${reminderType}) sent:`, result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending appointment reminder:', error);
            return { success: false, error: error.message };
        }
    }

    getAppointmentReminderTemplate(firstName, labName, appointmentDate, appointmentTime, tests, reminderType) {
        const isUrgent = reminderType === '1h';
        const headerColor = isUrgent ? '#dc2626' : '#1e40af';
        const badgeColor = isUrgent ? '#fef2f2' : '#eff6ff';
        const badgeText = isUrgent ? '#dc2626' : '#1e40af';
        const urgentLabel = isUrgent ? '⏰ In 1 Hour' : '📅 Tomorrow';

        return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
            <div style="background: linear-gradient(135deg, ${headerColor}, #3b82f6); padding: 30px; text-align: center;">
                <div style="color: white; font-size: 24px; font-weight: bold; margin-bottom: 5px;">LabMate360</div>
                <div style="color: #93c5fd; font-size: 13px;">Appointment Reminder</div>
            </div>
            <div style="height: 4px; background: linear-gradient(to right, #f59e0b, #ef4444);"></div>
            <div style="padding: 30px 35px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="background: ${badgeColor}; color: ${badgeText}; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 14px; display: inline-block;">
                        ${urgentLabel}
                    </span>
                </div>
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>This is a friendly reminder about your upcoming appointment:</p>
                <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <table style="width: 100%; font-size: 14px;">
                        <tr><td style="padding: 6px 0; color: #6b7280; width: 120px;"><strong>🏥 Lab:</strong></td><td style="color: #1f2937; font-weight: 600;">${labName}</td></tr>
                        <tr><td style="padding: 6px 0; color: #6b7280;"><strong>📅 Date:</strong></td><td style="color: #1f2937; font-weight: 600;">${appointmentDate}</td></tr>
                        <tr><td style="padding: 6px 0; color: #6b7280;"><strong>🕐 Time:</strong></td><td style="color: #1f2937; font-weight: 600;">${appointmentTime}</td></tr>
                        <tr><td style="padding: 6px 0; color: #6b7280;"><strong>🧪 Tests:</strong></td><td style="color: #1f2937;">${tests}</td></tr>
                    </table>
                </div>
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 20px 0;">
                    <strong>Preparation Tips:</strong><br>
                    • Please arrive 15 minutes early<br>
                    • Carry a valid ID and your booking confirmation<br>
                    • Follow any fasting instructions if applicable
                </div>
            </div>
            <div style="text-align: center; padding: 20px; background: #f8fafc; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                <p style="margin: 0;">© 2024 LabMate360. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>`;
    }
}

module.exports = new EmailService();
