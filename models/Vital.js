const mongoose = require('mongoose');

const bloodPressureSchema = new mongoose.Schema(
  {
    value: { type: String, trim: true }, // e.g. "120/80"
    unit: { type: String, trim: true, default: 'mmHg' },
    date: { type: Date, default: Date.now }
  },
  { _id: false }
);

const bloodSugarSchema = new mongoose.Schema(
  {
    value: { type: Number }, // mg/dL
    unit: { type: String, trim: true, default: 'mg/dL' },
    type: { type: String, trim: true, default: '' }, // fasting / random / etc (optional)
    date: { type: Date, default: Date.now }
  },
  { _id: false }
);

const vitalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // PPG (camera) vitals
    heartRate: { type: Number }, // BPM
    spo2: { type: Number }, // %
    confidence: { type: Number }, // 0-100

    // Optional additional vitals (used for risk prediction)
    systolicBP: { type: Number },
    diastolicBP: { type: Number },
    cholesterol: { type: Number }, // mg/dL

    // Dashboard cards (manual-like vitals)
    bloodPressure: { type: bloodPressureSchema, default: null },
    bloodSugar: { type: bloodSugarSchema, default: null },

    source: { type: String, enum: ['ppg', 'manual', 'imported'], default: 'manual' }
  },
  { timestamps: true }
);

vitalSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Vital', vitalSchema);

