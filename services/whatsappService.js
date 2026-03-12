const twilio = require('twilio');

class WhatsAppService {
    constructor() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

        if (accountSid && authToken && accountSid !== 'your_twilio_account_sid') {
            try {
                this.client = twilio(accountSid, authToken);
                console.log('WhatsApp service (Twilio) initialized successfully');
            } catch (error) {
                console.error('Error initializing Twilio WhatsApp service:', error.message);
                this.client = null;
            }
        } else {
            console.warn('Twilio credentials not configured — WhatsApp notifications disabled');
            this.client = null;
        }
    }

    /**
     * Format phone number to WhatsApp format
     * Ensures the number starts with 'whatsapp:' and has country code
     */
    formatWhatsAppNumber(phone) {
        if (!phone) return null;
        let cleaned = phone.replace(/[\s\-\(\)]/g, '');
        // Add +91 if no country code
        if (!cleaned.startsWith('+')) {
            cleaned = '+91' + cleaned;
        }
        return `whatsapp:${cleaned}`;
    }

    /**
     * Send result published notification via WhatsApp
     */
    async sendResultPublishedMessage(phone, firstName, labName, testNames, bookingId) {
        if (!this.client) {
            console.warn('WhatsApp service not available — skipping WhatsApp notification');
            return { success: false, error: 'WhatsApp service not configured' };
        }

        const toNumber = this.formatWhatsAppNumber(phone);
        if (!toNumber) {
            return { success: false, error: 'No valid phone number provided' };
        }

        const shortId = String(bookingId).slice(-8).toUpperCase();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const testsText = Array.isArray(testNames) && testNames.length > 0
            ? testNames.join(', ')
            : 'your booked tests';

        const message = [
            `🧪 *Lab Results Ready — ${labName || 'LabMate360'}*`,
            ``,
            `Hello *${firstName}*,`,
            ``,
            `Your laboratory test results have been verified and published.`,
            ``,
            `📋 *Report ID:* ${shortId}`,
            `🏥 *Lab:* ${labName || 'LabMate360'}`,
            `🔬 *Tests:* ${testsText}`,
            ``,
            `📥 View & download your full report:`,
            `${frontendUrl}/user/dashboard/reports`,
            ``,
            `⚠️ _Please consult a healthcare professional for proper interpretation of your results._`,
            ``,
            `— LabMate360 Clinical Platform`
        ].join('\n');

        try {
            const result = await this.client.messages.create({
                from: this.fromNumber,
                to: toNumber,
                body: message
            });
            console.log('WhatsApp message sent:', result.sid);
            return { success: true, messageSid: result.sid };
        } catch (error) {
            console.error('WhatsApp message failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new WhatsAppService();
