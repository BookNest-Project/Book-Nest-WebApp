import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 Checking environment variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ SET' : '✗ MISSING');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✓ SET' : '✗ MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ SET' : '✗ MISSING');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);