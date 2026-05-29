import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please check your .env file');
  process.exit(1);
}

console.log('✅ Supabase URL:', process.env.SUPABASE_URL);
console.log('✅ Anon Key present:', process.env.SUPABASE_ANON_KEY ? 'Yes' : 'No');
console.log('✅ Service Role Key present:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Yes' : 'No');

try {
  const payload = JSON.parse(
    Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64url').toString()
  );
  if (payload.role !== 'service_role') {
    console.error(
      '❌ SUPABASE_SERVICE_ROLE_KEY is not the service_role key (got role:',
      payload.role,
      '). Checkout will fail with "permission denied". Use Settings → API → service_role secret on Railway.'
    );
  }
} catch {
  console.warn('⚠️ Could not verify SUPABASE_SERVICE_ROLE_KEY JWT payload');
}

// Create two clients:
// 1. Service Role client (server-side, bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// 2. Regular client (for public operations)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export { supabase, supabaseAdmin };