const express = require('express');
const router = express.Router();
const axios = require('axios');

const { authenticateToken: auth } = require('../middleware/auth');
const Vital = require('../models/Vital');
const User = require('../models/User');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

async function buildInputData(userId) {
  const user = await User.findById(userId).select('age gender');

  const latestPPG = await Vital.findOne({ userId, source: 'ppg' }).sort({ createdAt: -1 });
  const latestManual = await Vital.findOne({
    userId,
    $or: [{ systolicBP: { $exists: true } }, { bloodSugar: { $ne: null } }, { cholesterol: { $exists: true } }]
  }).sort({ createdAt: -1 });

  return {
    age: user?.age ?? 0,
    gender: user?.gender ?? 'male',
    heartRate: latestPPG?.heartRate ?? 70,
    systolicBP: latestManual?.systolicBP ?? 120,
    diastolicBP: latestManual?.diastolicBP ?? 80,
    bloodSugar: latestManual?.bloodSugar?.value ?? 90,
    cholesterol: latestManual?.cholesterol ?? 180,
    spo2: latestPPG?.spo2 ?? 98
  };
}

function localRecommend(input) {
  const recs = [];

  const heart_rate = input.heartRate ?? 70;
  const systolic_bp = input.systolicBP ?? 120;
  const diastolic_bp = input.diastolicBP ?? 80;
  const blood_sugar = input.bloodSugar ?? 90;
  const cholesterol = input.cholesterol ?? 180;
  const spo2 = input.spo2 ?? 98;

  if (spo2 < 95) {
    recs.push({
      testName: 'Pulmonary Function Test',
      reason: `Low Oxygen Saturation (${spo2}%) indicates potential respiratory issues.`,
      priority: 'High'
    });
    recs.push({
      testName: 'Chest X-Ray',
      reason: 'To check for underlying lung conditions affecting oxygen levels.',
      priority: 'Medium'
    });
  }

  if (heart_rate > 100) {
    recs.push({
      testName: 'ECG (Electrocardiogram)',
      reason: `High Heart Rate (Tachycardia: ${heart_rate} BPM) detected.`,
      priority: 'High'
    });
    recs.push({
      testName: 'Thyroid Profile',
      reason: 'Thyroid overactivity can cause high heart rate.',
      priority: 'Medium'
    });
  } else if (heart_rate < 50) {
    recs.push({
      testName: 'ECG (Electrocardiogram)',
      reason: `Low Heart Rate (Bradycardia: ${heart_rate} BPM) detected.`,
      priority: 'High'
    });
  }

  if (systolic_bp > 140 || diastolic_bp > 90) {
    recs.push({
      testName: 'Kidney Function Test',
      reason: 'High Blood Pressure can strain kidneys.',
      priority: 'Medium'
    });
    recs.push({
      testName: 'Lipid Profile',
      reason: 'Hypertension is often linked with high cholesterol.',
      priority: 'High'
    });
  }

  if (blood_sugar > 126) {
    recs.push({
      testName: 'HbA1c',
      reason: `High fasting blood sugar (${blood_sugar} mg/dL) suggests diabetes risk.`,
      priority: 'High'
    });
    recs.push({
      testName: 'Urine Analysis',
      reason: 'To check for glucose or ketones in urine.',
      priority: 'Medium'
    });
  } else if (blood_sugar > 100) {
    recs.push({
      testName: 'HbA1c',
      reason: 'Pre-diabetic blood sugar levels detected.',
      priority: 'Medium'
    });
  }

  if (cholesterol > 240) {
    recs.push({
      testName: 'Lipid Profile',
      reason: `High Total Cholesterol (${cholesterol} mg/dL). Detailed breakdown needed.`,
      priority: 'High'
    });
    recs.push({
      testName: 'Liver Function Test',
      reason: 'Liver plays a key role in cholesterol metabolism.',
      priority: 'Medium'
    });
  }

  if ((systolic_bp > 130 || diastolic_bp > 85) && cholesterol > 200) {
    recs.push({
      testName: 'Cardiac Risk Markers',
      reason: 'Combined high BP and cholesterol increases cardiovascular risk.',
      priority: 'High'
    });
  }

  return recs;
}

// GET /api/recommendations
router.get('/', auth, async (req, res) => {
  try {
    const inputData = await buildInputData(req.user.id);

    // Try ML service first
    try {
      const mlResp = await axios.post(`${ML_SERVICE_URL}/recommend-tests`, inputData, { timeout: 12000 });
      if (mlResp.data?.success) {
        return res.json({
          success: true,
          recommendations: mlResp.data.recommendations || [],
          source: mlResp.data.source || 'ml_model',
          timestamp: mlResp.data.timestamp || new Date().toISOString()
        });
      }
    } catch (e) {
      // fall back
    }

    const recommendations = localRecommend(inputData);
    return res.json({ success: true, recommendations, source: 'rule_based', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
  }
});

module.exports = router;

