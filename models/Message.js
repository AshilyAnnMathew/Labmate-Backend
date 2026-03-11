const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new', index: true }
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

