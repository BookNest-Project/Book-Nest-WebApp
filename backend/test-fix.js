import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

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

async function testRegistration() {
  try {
    console.log('Testing registration fix...');
    
    // Test 1: Try to insert a user directly
    const testUser = { 
      email: 'test' + Date.now() + '@test.com',
      display_name: 'Test User',
      role: 'reader'
    };
    
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert(testUser)
      .select();
    
    if (error) {
      console.error('❌ Direct insert error:', error.message);
    } else {
      console.log('✅ Direct insert success:', data);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRegistration();