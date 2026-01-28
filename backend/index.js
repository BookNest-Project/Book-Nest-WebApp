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

app.get('/api/categories', async (req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, description')
      .order('name');
    
    if (error) throw error;
    
    res.json({ categories: categories || [] });
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});
// Debug endpoint to check setup
app.get('/api/debug/setup', async (req, res) => {
  try {
    const checks = [];
    
    // 1. Check database connection
    const { data: categories, error: catError } = await supabaseAdmin
      .from('categories')
      .select('count(*)', { count: 'exact', head: true });
    
    checks.push({
      name: 'Database Connection',
      status: !catError ? '✅ OK' : '❌ Failed',
      details: catError ? catError.message : `${categories} categories found`
    });
    
    // 2. Check storage bucket
    const { data: buckets, error: bucketError } = await supabaseAdmin
      .storage
      .listBuckets();
    
    const hasBooknestBucket = buckets?.some(b => b.name === 'booknest');
    
    checks.push({
      name: 'Storage Bucket',
      status: hasBooknestBucket ? '✅ OK' : '❌ Missing',
      details: hasBooknestBucket ? 'booknest bucket exists' : 'Create bucket: booknest'
    });
    
    // 3. Check if storage is public
    checks.push({
      name: 'Storage Public Access',
      status: '⚠️ Check manually',
      details: 'Go to Supabase → Storage → booknest → Policies → Should have public policy'
    });
    
    res.json({
      status: 'Debug Info',
      checks: checks,
      instructions: [
        '1. Ensure booknest bucket exists and is public',
        '2. Create at least one category in categories table',
        '3. Register author/publisher users for testing'
      ]
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});






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
 
