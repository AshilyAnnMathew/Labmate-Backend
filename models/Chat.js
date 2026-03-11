const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    read: {
        type: Boolean,
        default: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const chatSchema = new mongoose.Schema({
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    messages: [chatMessageSchema],
    lastMessage: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

chatSchema.index({ bookingId: 1 });
chatSchema.index({ participants: 1, lastMessage: -1 });

module.exports = mongoose.model('Chat', chatSchema);
