const mongoose = require('mongoose');

const mentalWellnessAssessmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Raw 1-10 responses coming from the UI
    responses: {
      stressLevel: { type: Number, min: 1, max: 10, required: true },
      sleepQuality: { type: Number, min: 1, max: 10, required: true },
      mood: { type: Number, min: 1, max: 10, required: true },
      anxiety: { type: Number, min: 1, max: 10, required: true },
      focus: { type: Number, min: 1, max: 10, required: true }
    },

    wellnessScore: { type: Number, min: 0, max: 100, required: true },
    riskLevel: { type: String, enum: ['Healthy', 'Moderate Stress', 'High Stress Risk'], required: true },
    recommendations: [{ type: String, trim: true }]
  },
  { timestamps: true }
);

mentalWellnessAssessmentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('MentalWellnessAssessment', mentalWellnessAssessmentSchema);

