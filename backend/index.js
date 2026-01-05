import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import bookRoutes from './routes/bookRoutes.js';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/authRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: '*',  // Change to specific frontend URL in production
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'BookNest API',
    version: '1.0.0', 
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
// Book management routes
app.use('/api/books', bookRoutes);

// 404 handler for Express 5 (no '*' parameter)
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      message: err.message
    })
  });
});


app.listen(PORT, () => {
  console.log(`
  🚀 BookNest Backend Started!
  📍 Port: ${PORT}
  📁 Environment: ${process.env.NODE_ENV}
  🗄️  Supabase: Connected
  🚦 Express: 4.18.2
  `);
});
// Book routes (protected)
app.use('/api/books', bookRoutes); 