import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
 

// Import routes
import userRoutes from './routes/userRoutes.js';
// import bookRoutes from './routes/bookRoutes.js';
// import adminRoutes from './routes/adminRoutes.js';
// import paymentRoutes from './routes/paymentRoutes.js'; // Add this

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Logging middleware
app.use(morgan('dev'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'BookNest API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      books: '/api/books',
      admin: '/api/admin',
      payments: '/api/payments'
    }
  });
});

// Mount routes
app.use('/api/auth', userRoutes);
// app.use('/api/books', bookRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/payments', paymentRoutes); // Add this

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler - UPDATED
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  // Use error status code if available
  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Internal server error';
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  
  // Map common errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    errorMessage = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    errorMessage = 'Token expired';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    errorCode = 'CONFLICT';
  }
  
  res.status(statusCode).json({ 
    success: false,
    error: {
      message: errorMessage,
      code: errorCode,
      ...(err.errors && { details: err.errors }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  🚀 BookNest Backend Started!
  📍 Port: ${PORT}
  📁 Environment: ${process.env.NODE_ENV || 'development'}
  🌐 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
  🗄️  Supabase: Connected
  💳 Chapa: Test Mode
  📚 Available endpoints:
      http://localhost:${PORT}/api/health
      http://localhost:${PORT}/api/auth
      http://localhost:${PORT}/api/books
      http://localhost:${PORT}/api/admin
      http://localhost:${PORT}/api/payments
  `);
});
