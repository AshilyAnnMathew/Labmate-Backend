const webpush = require('web-push');

class PushService {
    constructor() {
        // Generate VAPID keys if not set: npx web-push generate-vapid-keys
        const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';

        if (vapidPublic && vapidPrivate) {
            webpush.setVapidDetails(
                'mailto:labmate360@example.com',
                vapidPublic,
                vapidPrivate
            );
            this.enabled = true;
            console.log('🔔 Push notification service initialized');
        } else {
            this.enabled = false;
            console.log('⚠️ Push notifications disabled (VAPID keys not configured)');
        }
    }

    async sendNotification(subscription, title, body, url = '/') {
        if (!this.enabled || !subscription) return { success: false, error: 'Push not configured' };

        const payload = JSON.stringify({
            title,
            body,
            icon: '/labmate-icon.png',
            badge: '/labmate-badge.png',
            url,
            timestamp: Date.now()
        });

        try {
            await webpush.sendNotification(subscription, payload);
            return { success: true };
        } catch (error) {
            console.error('Push notification error:', error);
            // Remove invalid subscriptions (410 Gone)
            if (error.statusCode === 410) {
                return { success: false, error: 'subscription_expired', remove: true };
            }
            return { success: false, error: error.message };
        }
    }

    async notifyUser(user, title, body, url = '/') {
        if (!user?.pushSubscription?.endpoint) return;
        return this.sendNotification(user.pushSubscription, title, body, url);
    }
}

module.exports = new PushService();
