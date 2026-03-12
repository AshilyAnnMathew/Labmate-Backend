// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/database');
const passport = require('./config/passport');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'https://labmatemainfrontend.vercel.app'
];

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.userId}`);

  // Join a chat room for a booking
  socket.on('join-chat', (bookingId) => {
    socket.join(`chat-${bookingId}`);
    console.log(`User ${socket.userId} joined chat-${bookingId}`);
  });

  // Leave a chat room
  socket.on('leave-chat', (bookingId) => {
    socket.leave(`chat-${bookingId}`);
  });

  // Typing indicator
  socket.on('typing', ({ bookingId, isTyping }) => {
    socket.to(`chat-${bookingId}`).emit('user-typing', {
      userId: socket.userId,
      isTyping
    });
  });

  // Join a notification room for push-like real-time updates
  socket.on('join-notifications', () => {
    socket.join(`user-${socket.userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.userId}`);
  });
});

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize passport
app.use(passport.initialize());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/googleAuth'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/labs', require('./routes/labs'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/respiratory', require('./routes/respiratory'));
app.use('/api/mental-wellness', require('./routes/mentalWellness'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/samples', require('./routes/samples'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/push', require('./routes/push'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'LabMate360 Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// 404 handler - catch all routes that don't match above
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

const PORT = process.env.PORT || 5000;

// Use server.listen instead of app.listen for Socket.IO
server.listen(PORT, () => {
  console.log(`
🚀 LabMate360 Backend Server Started!
📡 Server running on port ${PORT}
🌍 Environment: ${process.env.NODE_ENV}
🔗 MongoDB: Connected
📱 Frontend URL: ${process.env.FRONTEND_URL}
💬 Socket.IO: Enabled
⏰ Started at: ${new Date().toISOString()}
  `);

  // Start the appointment reminder scheduler
  try {
    const reminderScheduler = require('./services/reminderScheduler');
    reminderScheduler.start();
  } catch (err) {
    console.error('Failed to start reminder scheduler:', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});
