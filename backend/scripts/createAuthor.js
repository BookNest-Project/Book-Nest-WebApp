import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the backend root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAuthor(email, password, penName, fullName = null, bio = null) {
  try {
    console.log('📝 Creating author...');
    
    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: penName,
      },
      app_metadata: {
        role: 'author',
      },
    });

    if (authError) {
      console.error('❌ Auth user creation failed:', authError.message);
      return;
    }

    console.log('✅ Auth user created:', authData.user.id);

    // 2. Update the public.users record - change role from 'reader' to 'author'
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        role: 'author',
        updated_at: new Date().toISOString()
      })
      .eq('id', authData.user.id);

    if (updateError) {
      console.error('❌ Failed to update user role:', updateError.message);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return;
    }

    console.log('✅ User role updated to: author');

    // 3. Verify the role was updated before creating profile
    const { data: verifyUser, error: verifyError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (verifyError) {
      console.error('❌ Failed to verify role:', verifyError.message);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return;
    }

    console.log('✅ Verified user role:', verifyUser.role);

    // 4. Create author profile (this should now pass the role check)
    const { error: profileError } = await supabaseAdmin
      .from('author_profiles')
      .insert({
        user_id: authData.user.id,
        pen_name: penName,
        full_name: fullName,
        bio: bio,
      });

    if (profileError) {
      console.error('❌ Profile creation failed:', profileError.message);
      console.error('Details:', profileError.details);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return;
    }

    console.log('✅ Author profile created');
    console.log('\n📋 Author Details:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   Pen Name:', penName);
    console.log('   Full Name:', fullName || 'Not provided');
    console.log('   Bio:', bio || 'Not provided');
    console.log('   User ID:', authData.user.id);
    console.log('\n🔐 Author can now login at http://localhost:3000/login');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Parse command line arguments
const email = process.argv[2];
const password = process.argv[3];
const penName = process.argv[4];
const fullName = process.argv[5];
const bio = process.argv.slice(6).join(' ') || null;

if (!email || !password || !penName) {
  console.log(`
📚 BookNest - Author Creation Tool

Usage:
  node scripts/createAuthor.js <email> <password> <penName> [fullName] [bio]

Example:
  node scripts/createAuthor.js john@example.com password123 "John Doe" "Johnathan Doe" "Award-winning author"
  `);
  process.exit(1);
}

if (password.length < 6) {
  console.error('❌ Password must be at least 6 characters');
  process.exit(1);
}

createAuthor(email, password, penName, fullName, bio);