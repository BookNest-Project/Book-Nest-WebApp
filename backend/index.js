import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger.js';

// Import routes
import userRoutes from './routes/userRoutes.js';
import bookRoutes from './routes/bookRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import sellerRoutes from './routes/sellerRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import gamificationRoutes from './routes/gamificationRoutes.js';
import communityRoutes from './routes/communityRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import checkoutRoutes from './routes/checkoutRoutes.js';
import libraryRoutes from './routes/libraryRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import downloadRoutes from './routes/downloadRoutes.js';
import progressRoutes from './routes/progressRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ FIX 1: Trust proxy (required for Railway)
app.set('trust proxy', 1);

// Health check (MUST be before other middleware)
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    status: "OK",
    service: "BookNest API",
    time: new Date().toISOString()
  });
});

// Security middleware
app.use(helmet());

// ✅ FIX 2: Updated CORS configuration for production
const allowedOrigins = [
  "http://localhost:3000",
  "https://book-nest-frontend-v2-main.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'cookie'],
}));

// Basic API rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    // ✅ FIX 3: Skip rate limiting for webhooks
    skip: (req) => req.path.startsWith('/api/webhooks'),
  })
);

// Logging middleware
app.use(morgan('dev'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ FIX 4: Webhook routes must be BEFORE express.json()
app.use('/api/webhooks', webhookRoutes);

// Debug routes (optional, remove in production)
app.get('/api/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push(`${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
    }
    if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push(`${Object.keys(handler.route.methods)} ${handler.route.path}`);
        }
      });
    }
  });
  res.json({ routes });
});

// ✅ FIX 5: Mount all API routes
app.use('/api/auth', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/progress', progressRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn('Endpoint not found', { path: req.originalUrl, method: req.method });
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// ✅ FIX 6: Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { message: err?.message, name: err?.name, stack: err?.stack });
  
  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Internal server error';
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 BookNest API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;