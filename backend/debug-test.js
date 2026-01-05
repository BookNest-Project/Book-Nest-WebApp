import { supabaseAdmin } from './config/supabase.js';

async function testDatabase() {
  console.log('🔍 Testing database connection...');
  
  try {
    // Test 1: List tables
    const { data: tables, error: tablesError } = await supabaseAdmin
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');
    
    if (tablesError) {
      console.error('❌ Cannot list tables:', tablesError);
    } else {
      console.log('✅ Tables in database:', tables.map(t => t.tablename));
    }
    
    // Test 2: Check users table structure
    const { data: columns, error: columnsError } = await supabaseAdmin
      .rpc('get_table_columns', { table_name: 'users' });
    
    if (columnsError) {
      console.log('ℹ️  Using alternative method...');
      // Try a simple query
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .limit(1);
      
      if (error) {
        console.error('❌ Cannot query users table:', error);
      } else {
        console.log('✅ Can query users table');
      }
    } else {
      console.log('✅ Users table columns:', columns);
    }
    
    // Test 3: Try to insert a test record
    const testId = '00000000-0000-0000-0000-000000000001';
    const { error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: testId,
        email: 'test@test.com',
        display_name: 'Test User',
        role: 'reader'
      });
    
    if (insertError) {
      console.error('❌ Insert test failed:', insertError);
    } else {
      console.log('✅ Insert test successful');
      
      // Clean up
      await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', testId);
    }
    
  } catch (error) {
    console.error('🔥 Unexpected error:', error);
  }
}

testDatabase();