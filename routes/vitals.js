const express = require('express');
const router = express.Router();
const axios = require('axios');

const { authenticateToken: auth } = require('../middleware/auth');
const Vital = require('../models/Vital');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function movingAverage(arr, windowSize) {
  const out = new Array(arr.length);
  const w = Math.max(1, Math.floor(windowSize));
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= w) sum -= arr[i - w];
    const denom = i + 1 < w ? i + 1 : w;
    out[i] = sum / denom;
  }
  return out;
}

function findPeaksSimple(signal, minDistance, prominence) {
  const peaks = [];
  if (signal.length < 3) return peaks;
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (peaks.length && i - peaks[peaks.length - 1] < minDistance) {
        // If too close, keep the higher peak
        if (signal[i] > signal[peaks[peaks.length - 1]]) {
          peaks.pop();
          peaks.push(i);
        }
      } else {
        // Prominence: compare to local mean
        const start = Math.max(0, i - minDistance);
        const end = Math.min(signal.length, i + minDistance);
        const local = signal.slice(start, end);
        const localMean = mean(local);
        if (signal[i] > localMean + prominence) peaks.push(i);
      }
    }
  }
  return peaks;
}

function processPPGLocal(redSignal, fs) {
  try {
    const sig = redSignal.map(Number).filter(n => Number.isFinite(n));
    if (sig.length < fs * 2) {
      return { success: false, message: 'Insufficient data length (< 2s)' };
    }

    // Basic pre-processing: remove slow trend using moving average
    const ma = movingAverage(sig, Math.max(3, Math.floor(fs * 0.75)));
    const detrended = sig.map((v, i) => v - ma[i]);

    // Light smoothing
    const smooth = movingAverage(detrended, Math.max(3, Math.floor(fs * 0.15)));

    // Peak detection
    const minDistance = Math.max(1, Math.floor(0.35 * fs)); // allow up to ~171 BPM
    const range = Math.max(...smooth) - Math.min(...smooth);
    let prominence = range * 0.05;
    let peaks = findPeaksSimple(smooth, minDistance, prominence);

    // Retry with lower threshold if too few peaks
    if (peaks.length < 4) {
      prominence = range * 0.01;
      peaks = findPeaksSimple(smooth, minDistance, prominence);
    }

    if (peaks.length < 2) {
      return { success: false, message: `Not enough peaks detected (${peaks.length})` };
    }

    const intervalsSec = [];
    for (let i = 1; i < peaks.length; i++) {
      intervalsSec.push((peaks[i] - peaks[i - 1]) / fs);
    }
    const avgInterval = mean(intervalsSec);
    if (!avgInterval || avgInterval <= 0) return { success: false, message: 'Invalid peak interval' };

    const bpm = 60 / avgInterval;
    if (bpm < 30 || bpm > 220) return { success: false, message: `BPM out of range (${bpm.toFixed(1)})` };

    // Confidence based on regularity (std dev of intervals)
    const avg = avgInterval;
    const variance =
      intervalsSec.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / Math.max(1, intervalsSec.length);
    const std = Math.sqrt(variance);
    const confidence = clamp(Math.round(100 - std * 200), 0, 100);

    // Rough SpO2 proxy (same idea as your Flask mock)
    const dc = mean(sig);
    const ac = range;
    const ratio = dc ? ac / dc : 0;
    let spo2 = 110 - 25 * ratio;
    spo2 = clamp(Number(spo2.toFixed(1)), 85, 100);

    return {
      success: true,
      heartRate: Number(bpm.toFixed(1)),
      spo2,
      confidence
    };
  } catch (e) {
    return { success: false, message: 'Processing error' };
  }
}

// POST /api/vitals/process
// Expects { red_signal: number[], fs: number }
router.post('/process', auth, async (req, res) => {
  try {
    const { red_signal, fs } = req.body || {};
    if (!Array.isArray(red_signal) || red_signal.length < 10) {
      return res.status(400).json({ success: false, message: 'red_signal must be a non-empty array' });
    }

    const samplingRate = Number(fs) || 30;

    // Call ML service (Flask) with local fallback
    let ppgResult = null;
    try {
      const mlResp = await axios.post(
        `${ML_SERVICE_URL}/process-ppg`,
        { red_signal, fs: samplingRate },
        { timeout: 15000 }
      );
      ppgResult = mlResp.data;
    } catch (e) {
      // Fallback: process locally so the feature still works without Flask service running
      console.warn('PPG ML service unavailable, falling back to local processing:', e?.message || e);
      ppgResult = processPPGLocal(red_signal, samplingRate);
    }

    if (!ppgResult?.success) {
      return res.status(200).json({
        success: false,
        message: ppgResult?.message || 'Signal quality too low or insufficient data'
      });
    }

    const heartRate = Number(ppgResult.heartRate);
    const spo2 = Number(ppgResult.spo2);
    const confidence = Number(ppgResult.confidence);

    const saved = await Vital.create({
      userId: req.user.id,
      heartRate: Number.isFinite(heartRate) ? heartRate : undefined,
      spo2: Number.isFinite(spo2) ? spo2 : undefined,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      source: 'ppg'
    });

    res.json({
      success: true,
      data: {
        heartRate: saved.heartRate,
        spo2: saved.spo2,
        confidence: saved.confidence,
        createdAt: saved.createdAt
      }
    });
  } catch (error) {
    console.error('Vitals process error:', error);
    res.status(500).json({ success: false, message: 'Failed to process vitals' });
  }
});

// GET /api/vitals/history
router.get('/history', auth, async (req, res) => {
  try {
    const vitals = await Vital.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, data: vitals });
  } catch (error) {
    console.error('Vitals history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vitals history' });
  }
});

// GET /api/vitals/latest
router.get('/latest', auth, async (req, res) => {
  try {
    const latest = await Vital.findOne({ userId: req.user.id, source: 'ppg' }).sort({ createdAt: -1 });
    if (!latest) {
      return res.status(404).json({ success: false, message: 'No vitals found' });
    }
    res.json({ success: true, data: latest });
  } catch (error) {
    console.error('Vitals latest error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch latest vitals' });
  }
});

// GET /api/vitals/user/:userId (Staff/Admin)
router.get('/user/:userId', auth, async (req, res) => {
  try {
    if (!['staff', 'lab_technician', 'xray_technician', 'local_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const vitals = await Vital.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, data: vitals });
  } catch (error) {
    console.error('Vitals user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient vitals' });
  }
});

module.exports = router;

