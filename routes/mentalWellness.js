const express = require('express');
const router = express.Router();

const { authenticateToken: auth } = require('../middleware/auth');
const MentalWellnessAssessment = require('../models/MentalWellnessAssessment');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toInt(val, fallback) {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

function computeWellness({ stressLevel, sleepQuality, mood, anxiety, focus }) {
  // UI uses 1..10 where higher is "better" for all sliders.
  const values = [stressLevel, sleepQuality, mood, anxiety, focus].map(v => clamp(v, 1, 10));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const wellnessScore = clamp(Math.round(avg * 10), 0, 100);

  let riskLevel = 'Healthy';
  if (wellnessScore < 40) riskLevel = 'High Stress Risk';
  else if (wellnessScore < 65) riskLevel = 'Moderate Stress';

  const recommendations = [];
  if (sleepQuality <= 4) recommendations.push('Improve sleep hygiene: consistent bedtime, limit screens 1 hour before sleep, and reduce caffeine after noon.');
  if (stressLevel <= 4) recommendations.push('Try a short daily breathing/meditation practice (5–10 minutes) and schedule small breaks during work.');
  if (mood <= 4) recommendations.push('Stay socially connected and consider journaling or a short walk outdoors to boost mood.');
  if (anxiety <= 4) recommendations.push('Use grounding techniques (5-4-3-2-1) and limit doomscrolling/news intake.');
  if (focus <= 4) recommendations.push('Use a focus routine: 25 minutes work + 5 minutes break (Pomodoro), and reduce multitasking.');
  if (recommendations.length === 0) recommendations.push('Keep up the good routine—maintain balanced sleep, hydration, and regular physical activity.');

  return { wellnessScore, riskLevel, recommendations };
}

// POST /api/mental-wellness/assess
router.post('/assess', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const responses = {
      stressLevel: toInt(body.stressLevel, 5),
      sleepQuality: toInt(body.sleepQuality, 5),
      mood: toInt(body.mood, 5),
      anxiety: toInt(body.anxiety, 5),
      focus: toInt(body.focus, 5)
    };

    const { wellnessScore, riskLevel, recommendations } = computeWellness(responses);

    const assessment = await MentalWellnessAssessment.create({
      userId: req.user.id,
      responses,
      wellnessScore,
      riskLevel,
      recommendations
    });

    res.json({ success: true, data: assessment });
  } catch (error) {
    console.error('Mental wellness assess error:', error);
    res.status(500).json({ success: false, message: 'Failed to save mental wellness assessment' });
  }
});

// GET /api/mental-wellness/history
router.get('/history', auth, async (req, res) => {
  try {
    const history = await MentalWellnessAssessment.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Mental wellness history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch mental wellness history' });
  }
});

module.exports = router;

