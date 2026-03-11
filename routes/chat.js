const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { authenticateToken: auth } = require('../middleware/auth');

// GET /api/chat/:bookingId - Fetch chat history for a booking
router.get('/:bookingId', auth, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Only allow participants (patient or staff assigned to the lab)
        const isPatient = booking.userId.toString() === req.user.id;
        const isStaff = ['staff', 'lab_technician', 'xray_technician', 'local_admin', 'admin'].includes(req.user.role);
        if (!isPatient && !isStaff) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        let chat = await Chat.findOne({ bookingId: req.params.bookingId })
            .populate('messages.sender', 'firstName lastName role profileImage')
            .populate('participants', 'firstName lastName role profileImage');

        if (!chat) {
            // Create a new chat for this booking
            chat = await Chat.create({
                bookingId: req.params.bookingId,
                participants: [booking.userId],
                messages: []
            });
        }

        res.json({ success: true, data: chat });
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch chat' });
    }
});

// POST /api/chat/:bookingId - Send a message
router.post('/:bookingId', auth, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Message text is required' });
        }

        const booking = await Booking.findById(req.params.bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        let chat = await Chat.findOne({ bookingId: req.params.bookingId });
        if (!chat) {
            chat = new Chat({
                bookingId: req.params.bookingId,
                participants: [booking.userId],
                messages: []
            });
        }

        // Add staff to participants if not already there
        if (!chat.participants.includes(req.user.id)) {
            chat.participants.push(req.user.id);
        }

        const newMessage = {
            sender: req.user.id,
            text: text.trim(),
            read: false,
            timestamp: new Date()
        };

        chat.messages.push(newMessage);
        chat.lastMessage = new Date();
        await chat.save();

        // Populate the sender for the response
        const populatedChat = await Chat.findById(chat._id)
            .populate('messages.sender', 'firstName lastName role profileImage');

        const savedMessage = populatedChat.messages[populatedChat.messages.length - 1];

        // Emit via Socket.IO if available
        const io = req.app.get('io');
        if (io) {
            io.to(`chat-${req.params.bookingId}`).emit('new-message', savedMessage);
        }

        res.status(201).json({ success: true, data: savedMessage });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// PUT /api/chat/:bookingId/read - Mark messages as read
router.put('/:bookingId/read', auth, async (req, res) => {
    try {
        const chat = await Chat.findOne({ bookingId: req.params.bookingId });
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        // Mark all messages not sent by current user as read
        let updated = 0;
        chat.messages.forEach(msg => {
            if (msg.sender.toString() !== req.user.id && !msg.read) {
                msg.read = true;
                updated++;
            }
        });

        if (updated > 0) await chat.save();

        res.json({ success: true, markedRead: updated });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
    }
});

// GET /api/chat/unread/count - Get unread message count for current user
router.get('/unread/count', auth, async (req, res) => {
    try {
        const chats = await Chat.find({ participants: req.user.id });
        let unreadCount = 0;
        chats.forEach(chat => {
            chat.messages.forEach(msg => {
                if (msg.sender.toString() !== req.user.id && !msg.read) {
                    unreadCount++;
                }
            });
        });

        res.json({ success: true, unreadCount });
    } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({ success: false, message: 'Failed to get unread count' });
    }
});

module.exports = router;
