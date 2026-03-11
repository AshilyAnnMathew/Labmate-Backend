const mongoose = require('mongoose');

const respiratoryAssessmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    breathHoldDuration: { type: Number, default: 0 }, // avg hold (seconds)
    maxBreathHold: { type: Number, default: 0 }, // max hold (seconds)
    attempts: { type: Number, default: 0 },

    symptoms: {
      breathlessness: { type: Boolean, default: false },
      cough: { type: Boolean, default: false },
      chestTightness: { type: Boolean, default: false },
      smokingHistory: { type: Boolean, default: false },
      historyOfAsthma: { type: Boolean, default: false }
    },

    riskScore: { type: Number, min: 0, max: 100, required: true },
    riskLevel: { type: String, enum: ['Normal', 'Mild Risk', 'High Risk'], required: true }
  },
  { timestamps: true }
);

respiratoryAssessmentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('RespiratoryAssessment', respiratoryAssessmentSchema);

