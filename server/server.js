const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const balanceRoutes = require('./routes/balance');

// Initialize Express
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(morgan('combined')); // Logging

// CORS Configuration - FIXED FOR VERCEL DEPLOYMENT
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://casino-sujal-83nlz4jtr-sujalbistaas-projects.vercel.app',
        'https://casino-sujal.vercel.app',
        'https://*.vercel.app',
        /https:\/\/casino-sujal-.*\.vercel\.app$/
      ]
    : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);
app.use('/api/balance', balanceRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`💰 Balance API: http://localhost:${PORT}/api/balance`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔒 CORS enabled for production origins`);
});