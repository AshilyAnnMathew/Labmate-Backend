const express = require('express');
const router = express.Router();
const axios = require('axios');

const { authenticateToken: auth } = require('../middleware/auth');
const Vital = require('../models/Vital');
const User = require('../models/User');
const Booking = require('../models/Booking');


const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function localRiskModel(input) {
  const {
    age = 0,
    heartRate = 70,
    systolicBP = 120,
    diastolicBP = 80,
    bloodSugar = 90,
    cholesterol = 180,
    spo2 = 98
  } = input;

  let risk_score = 0;
  const riskFactors = [];

  if (age > 50) {
    risk_score += 10;
    riskFactors.push('Age > 50');
  }
  if (systolicBP > 140 || diastolicBP > 90) {
    risk_score += 30;
    riskFactors.push('High Blood Pressure');
  } else if (systolicBP > 130 || diastolicBP > 85) {
    risk_score += 15;
    riskFactors.push('Elevated Blood Pressure');
  }
  if (heartRate > 100) {
    risk_score += 15;
    riskFactors.push('Tachycardia (High Heart Rate)');
  } else if (heartRate < 60) {
    risk_score += 10;
    riskFactors.push('Bradycardia (Low Heart Rate)');
  }
  if (bloodSugar > 126) {
    risk_score += 40;
    riskFactors.push('High Blood Sugar (Diabetes Risk)');
  } else if (bloodSugar > 100) {
    risk_score += 20;
    riskFactors.push('Elevated Blood Sugar (Pre-diabetes)');
  }
  if (spo2 < 95) {
    risk_score += 25;
    riskFactors.push('Low Oxygen Saturation');
  }
  if (cholesterol > 240) {
    risk_score += 25;
    riskFactors.push('High Cholesterol');
  } else if (cholesterol > 200) {
    risk_score += 10;
    riskFactors.push('Borderline High Cholesterol');
  }

  const riskScore = clamp(risk_score, 0, 100);
  const riskLevel = riskScore >= 60 ? 'High' : riskScore >= 30 ? 'Medium' : 'Low';

  return { riskLevel, riskScore, riskFactors };
}

async function buildInputData(userId) {
  const user = await User.findById(userId).select('age gender');

  const latestPPG = await Vital.findOne({ userId, source: 'ppg' }).sort({ createdAt: -1 });

  // Look for any manual/imported Vital with BP / sugar / cholesterol
  const latestManual = await Vital.findOne({
    userId,
    $or: [
      { systolicBP: { $exists: true } },
      { bloodPressure: { $ne: null } },
      { bloodSugar: { $ne: null } },
      { cholesterol: { $exists: true } }
    ]
  }).sort({ createdAt: -1 });

  // Parse BP: prefer numeric fields, fall back to "X/Y" string
  let systolicBP = latestManual?.systolicBP;
  let diastolicBP = latestManual?.diastolicBP;

  if ((!systolicBP || !diastolicBP) && latestManual?.bloodPressure?.value) {
    const parts = String(latestManual.bloodPressure.value).split('/');
    if (parts.length === 2) {
      const s = parseInt(parts[0], 10);
      const d = parseInt(parts[1], 10);
      if (!isNaN(s)) systolicBP = s;
      if (!isNaN(d)) diastolicBP = d;
    }
  }

  let bloodSugar = latestManual?.bloodSugar?.value;
  const cholesterol = latestManual?.cholesterol;

  // Final fallback: scan booking lab results for BP/sugar just like the dashboard does
  if (!systolicBP || !diastolicBP || !bloodSugar) {
    const bpPattern = /^\d{2,3}\/\d{2,3}$/;
    const recentBookings = await Booking.find({
      userId,
      status: { $in: ['result_published', 'completed'] },
      testResults: { $exists: true, $ne: [] }
    }).sort({ appointmentDate: -1 }).limit(10).populate('selectedTests.testId', 'name');

    for (const booking of recentBookings) {
      if (systolicBP && diastolicBP && bloodSugar) break;
      const testMap = {};
      (booking.selectedTests || []).forEach(t => {
        if (t.testId) testMap[t.testId._id.toString()] = (t.testName || t.testId.name || '').toLowerCase();
      });

      for (const result of (booking.testResults || [])) {
        const testName = testMap[result.testId?.toString()] || '';

        // Try to extract blood pressure
        if (!systolicBP || !diastolicBP) {
          // From systolic/diastolic labels
          const sys = result.values?.find(v => v.label?.toLowerCase().includes('systolic'));
          const dia = result.values?.find(v => v.label?.toLowerCase().includes('diastolic'));
          if (sys && dia) {
            const s = parseInt(sys.value, 10);
            const d = parseInt(dia.value, 10);
            if (!isNaN(s)) systolicBP = s;
            if (!isNaN(d)) diastolicBP = d;
          }
          // From a "X/Y" formatted value
          if (!systolicBP || !diastolicBP) {
            const bpVal = result.values?.find(v => v.value && bpPattern.test(String(v.value)));
            if (bpVal) {
              const [s, d] = String(bpVal.value).split('/').map(n => parseInt(n, 10));
              if (!isNaN(s)) systolicBP = s;
              if (!isNaN(d)) diastolicBP = d;
            }
          }
        }

        // Try to extract blood sugar
        if (!bloodSugar && (testName.includes('sugar') || testName.includes('glucose') || testName.includes('diabetic'))) {
          const sugarVal = result.values?.find(v => v.value && !isNaN(parseFloat(v.value)));
          if (sugarVal) bloodSugar = parseFloat(sugarVal.value);
        }
      }
    }
  }

  return {
    age: user?.age ?? 0,
    gender: user?.gender ?? 'male',
    heartRate: latestPPG?.heartRate ?? 70,
    systolicBP: systolicBP ?? 120,
    diastolicBP: diastolicBP ?? 80,
    bloodSugar: bloodSugar ?? 90,
    cholesterol: cholesterol ?? 180,
    spo2: latestPPG?.spo2 ?? 98
  };
}

// GET /api/predictions/risk
router.get('/risk', auth, async (req, res) => {
  try {
    const inputData = await buildInputData(req.user.id);

    // Try ML service first (optional)
    let modelOut = null;
    try {
      const mlResp = await axios.post(`${ML_SERVICE_URL}/predict-risk`, inputData, { timeout: 12000 });
      if (mlResp.data?.success) {
        modelOut = {
          riskLevel: mlResp.data.riskLevel,
          riskScore: mlResp.data.riskScore,
          riskFactors: mlResp.data.riskFactors,
          timestamp: mlResp.data.timestamp
        };
      }
    } catch (e) {
      // Fall back to local rules silently
      modelOut = null;
    }

    if (!modelOut) {
      const local = localRiskModel(inputData);
      modelOut = {
        ...local,
        timestamp: new Date().toISOString()
      };
    }

    res.json({
      success: true,
      data: {
        ...modelOut,
        inputData
      }
    });
  } catch (error) {
    console.error('Risk prediction error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate risk prediction' });
  }
});

module.exports = router;

