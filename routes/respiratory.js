const express = require('express');
const router = express.Router();

const { authenticateToken: auth } = require('../middleware/auth');
const RespiratoryAssessment = require('../models/RespiratoryAssessment');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeRespiratoryRisk({ maxBreathHold = 0, symptoms = {} }) {
  const symptomCount = Object.values(symptoms || {}).filter(Boolean).length;

  // Higher score = higher risk
  let score = 0;

  // Breath hold impact (seconds)
  if (maxBreathHold < 10) score += 55;
  else if (maxBreathHold < 20) score += 40;
  else if (maxBreathHold < 30) score += 25;
  else if (maxBreathHold < 40) score += 10;

  // Symptoms impact
  score += symptomCount * 12;
  if (symptoms?.smokingHistory) score += 10;
  if (symptoms?.historyOfAsthma) score += 10;

  score = clamp(Math.round(score), 0, 100);

  let riskLevel = 'Normal';
  if (score >= 70) riskLevel = 'High Risk';
  else if (score >= 40) riskLevel = 'Mild Risk';

  return { riskScore: score, riskLevel };
}

// POST /api/respiratory/assess
router.post('/assess', auth, async (req, res) => {
  try {
    const {
      breathHoldDuration = 0,
      maxBreathHold = 0,
      attempts = 0,
      symptoms = {}
    } = req.body || {};

    const { riskScore, riskLevel } = computeRespiratoryRisk({ maxBreathHold, symptoms });

    const assessment = await RespiratoryAssessment.create({
      userId: req.user.id,
      breathHoldDuration: Number(breathHoldDuration) || 0,
      maxBreathHold: Number(maxBreathHold) || 0,
      attempts: Number(attempts) || 0,
      symptoms: {
        breathlessness: !!symptoms.breathlessness,
        cough: !!symptoms.cough,
        chestTightness: !!symptoms.chestTightness,
        smokingHistory: !!symptoms.smokingHistory,
        historyOfAsthma: !!symptoms.historyOfAsthma
      },
      riskScore,
      riskLevel
    });

    res.json({ success: true, data: assessment });
  } catch (error) {
    console.error('Respiratory assess error:', error);
    res.status(500).json({ success: false, message: 'Failed to save respiratory assessment' });
  }
});

// GET /api/respiratory/history
router.get('/history', auth, async (req, res) => {
  try {
    const history = await RespiratoryAssessment.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Respiratory history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch respiratory history' });
  }
});

module.exports = router;

