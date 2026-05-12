import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testChapa() {
  console.log('🔍 Testing Complete Payment Flow');
  console.log('================================');

  const BASE_URL = 'http://localhost:5000/api';
  let token = '';
  let formatId = '';

  try {
    // 1. Login
    console.log('\n2️⃣  Logging in...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email:  "test@example.com",
      password: "password123" 
    });

     

    // 3. Search for books
    console.log('\n3️⃣  Searching for books...');
    const booksRes = await axios.get(`${BASE_URL}/books/search?limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (booksRes.data.data.books.length === 0) {
      console.log('No books found. Creating test book...');
      // You might need to create test book data first
      throw new Error('No books available for testing');
    }

    const firstBook = booksRes.data.data.books[0];
    console.log(`Found book: ${firstBook.title}`);

    // 4. Get book details to find format IDs
    console.log('\n4️⃣  Getting book details...');
    const bookDetailsRes = await axios.get(`${BASE_URL}/books/${firstBook.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const formats = bookDetailsRes.data.data.book_formats;
    if (!formats || formats.length === 0) {
      throw new Error('Book has no formats');
    }

    formatId = formats[0].id;
    console.log(`Using format ID: ${formatId} (${formats[0].format_type}, ETB ${formats[0].price})`);

    // 5. Test payment
    console.log('\n5️⃣  Testing payment initiation...');
    const paymentRes = await axios.post(`${BASE_URL}/payments/initiate`, {
      bookFormatIds: [formatId]
    }, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Payment Response:');
    console.log('Success:', paymentRes.data.success);
    
    if (paymentRes.data.success) {
      console.log('✅ PAYMENT SUCCESSFUL!');
      console.log(`🔗 Checkout URL: ${paymentRes.data.checkoutUrl}`);
      console.log(`💰 Amount: ETB ${paymentRes.data.totalAmount}`);
      console.log(`📝 Transaction Ref: ${paymentRes.data.txRef}`);
      
      console.log('\n💳 Test Card for Chapa Sandbox:');
      console.log('Card: 4242 4242 4242 4242');
      console.log('Expiry: 12/30');
      console.log('CVV: 123');
      console.log('Name: Any name');
    } else {
      console.log('❌ Payment failed:', paymentRes.data);
    }

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    
    if (error.response) {
      console.log('Response Status:', error.response.status);
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
} 
 

testChapa();