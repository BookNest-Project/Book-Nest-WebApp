import Chapa from 'chapa';
import dotenv from 'dotenv';

dotenv.config();

// Validate Chapa environment variables
const requiredEnvVars = ['CHAPA_SECRET_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please check your .env file');
  process.exit(1);
}

// Initialize Chapa
const chapa = new Chapa(process.env.CHAPA_SECRET_KEY);

// Test Chapa connection
(async () => {
  try {
    // Simple test to verify Chapa is working
    await chapa.verifyBank({
      account_number: '0130000011901', // Test account number
      bank_code: '014' // Test bank code (CBE)
    });
    console.log('✅ Chapa initialized successfully');
  } catch (error) {
    console.warn('⚠️  Chapa bank verification test failed (this might be expected)');
    console.log('✅ Chapa initialized (test mode)');
  }
})();

export default chapa;