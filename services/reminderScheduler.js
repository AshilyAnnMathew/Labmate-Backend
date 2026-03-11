const cron = require('node-cron');
const Booking = require('../models/Booking');
const User = require('../models/User');
const emailService = require('./emailService');

class ReminderScheduler {
    start() {
        console.log('📧 Appointment reminder scheduler started');

        // Run every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            console.log('⏰ Running appointment reminder check...');
            try {
                await this.send24hReminders();
                await this.send1hReminders();
            } catch (error) {
                console.error('Reminder scheduler error:', error);
            }
        });

        // Run immediately on startup too
        setTimeout(async () => {
            try {
                await this.send24hReminders();
                await this.send1hReminders();
            } catch (error) {
                console.error('Initial reminder check error:', error);
            }
        }, 10000); // 10 seconds after startup
    }

    async send24hReminders() {
        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

        // Find bookings with appointments between 23-24 hours from now that haven't received 24h reminder
        const bookings = await Booking.find({
            status: { $in: ['pending', 'confirmed'] },
            appointmentDate: {
                $gte: new Date(in23h.toISOString().split('T')[0]),
                $lte: new Date(in24h.toISOString().split('T')[0] + 'T23:59:59.999Z')
            },
            'remindersSent.reminder24h': { $ne: true },
            isActive: true
        }).populate('userId', 'firstName email').populate('labId', 'name');

        for (const booking of bookings) {
            if (!booking.userId?.email) continue;

            const tests = booking.selectedTests?.map(t => t.testName).join(', ') || 'Scheduled tests';
            const dateStr = new Date(booking.appointmentDate).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            try {
                await emailService.sendAppointmentReminder(
                    booking.userId.email,
                    booking.userId.firstName,
                    booking.labId?.name || 'Lab',
                    dateStr,
                    booking.appointmentTime,
                    tests,
                    '24h'
                );

                booking.remindersSent.reminder24h = true;
                await booking.save();
                console.log(`✅ 24h reminder sent to ${booking.userId.email}`);
            } catch (error) {
                console.error(`❌ Failed 24h reminder for ${booking._id}:`, error.message);
            }
        }
    }

    async send1hReminders() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Find today's bookings that haven't received 1h reminder
        const bookings = await Booking.find({
            status: { $in: ['pending', 'confirmed'] },
            appointmentDate: {
                $gte: new Date(todayStr),
                $lt: new Date(todayStr + 'T23:59:59.999Z')
            },
            'remindersSent.reminder1h': { $ne: true },
            isActive: true
        }).populate('userId', 'firstName email').populate('labId', 'name');

        for (const booking of bookings) {
            if (!booking.userId?.email || !booking.appointmentTime) continue;

            // Parse appointment time (e.g., "09:30", "14:00")
            const [hours, minutes] = booking.appointmentTime.split(':').map(Number);
            if (isNaN(hours)) continue;

            const apptTime = new Date(booking.appointmentDate);
            apptTime.setHours(hours, minutes || 0, 0, 0);

            const diff = apptTime.getTime() - now.getTime();
            const diffMinutes = diff / (1000 * 60);

            // Send if appointment is between 30-90 minutes from now
            if (diffMinutes > 30 && diffMinutes <= 90) {
                const tests = booking.selectedTests?.map(t => t.testName).join(', ') || 'Scheduled tests';
                const dateStr = new Date(booking.appointmentDate).toLocaleDateString('en-IN', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });

                try {
                    await emailService.sendAppointmentReminder(
                        booking.userId.email,
                        booking.userId.firstName,
                        booking.labId?.name || 'Lab',
                        dateStr,
                        booking.appointmentTime,
                        tests,
                        '1h'
                    );

                    booking.remindersSent.reminder1h = true;
                    await booking.save();
                    console.log(`✅ 1h reminder sent to ${booking.userId.email}`);
                } catch (error) {
                    console.error(`❌ Failed 1h reminder for ${booking._id}:`, error.message);
                }
            }
        }
    }
}

module.exports = new ReminderScheduler();
