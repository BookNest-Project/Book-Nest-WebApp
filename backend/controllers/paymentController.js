import { supabaseAdmin } from '../config/supabase.js';
import chapa from '../config/chapa.js';
import chapaFixed from '../config/chapa-fixed.js'; // Use fixed version

export const initiatePayment = async (req, res, next) => {
  try {
    const { bookFormatIds } = req.body;
    const userId = req.user.id;

console.log('Starting payment for user:', userId);

     if (!bookFormatIds || !Array.isArray(bookFormatIds) || bookFormatIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Please select at least one book format' 
      });
    }

    // Remove duplicates
    const uniqueFormatIds = [...new Set(bookFormatIds)];

    // Check and lock formats (PREVENTS DOUBLE PURCHASE)
    try {
      await checkAndLockFormats(userId, uniqueFormatIds);
    } catch (lockError) {
      return res.status(400).json({
        success: false,
        error: lockError.message
      });
    }


       // 3. Fetch book formats
    const { data: bookFormats, error: formatsError } = await supabaseAdmin
      .from('book_formats')
      .select(`
        *,
        books (
          id,
          title,
          author_id,
          publisher_id,
          author_name,
          publisher_name
        )
      `)
      .in('id', uniqueFormatIds);

    if (formatsError) throw formatsError;
    if (!bookFormats || bookFormats.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Selected book formats not found' 
      });
    }

    // 4. Calculate total
    const totalAmount = bookFormats.reduce((sum, format) => {
      return sum + parseFloat(format.price || 0);
    }, 0);

    if (totalAmount <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid total amount' 
      });
    }

    // 5. Create payment record
    const txRef = `booknest-${Date.now()}`;
    
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert([
        {
          user_id: userId,
          amount: totalAmount,
          tx_ref: txRef,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (paymentError) throw paymentError;

    // 6. Create payment items (THIS LOCKS THE FORMATS)
    const paymentItems = bookFormats.map(format => ({
      payment_id: payment.id,
      book_format_id: format.id,
      price: format.price
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('payment_items')
      .insert(paymentItems);

    if (itemsError) throw itemsError;

    console.log(`✅ Payment ${payment.id} created and formats locked`);

    // 6. Prepare Chapa data - FIXED VERSION
   
    // Prepare Chapa data
    const displayName = req.user.display_name || 'Book Reader';
    const nameParts = displayName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';

    const bookTitles = availableFormats.map(f => f.books?.title).filter(Boolean);
    const description =  bookTitles.length > 0 
  ? bookTitles[0].replace(/[^a-zA-Z0-9.\-_ ]/g, ' ').trim().substring(0, 30)
  : 'Book purchase';
    const chapaData = {
      amount: totalAmount.toString(),
      currency: 'ETB',
      tx_ref: txRef,
       return_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/callback?tx_ref=${txRef}`,
       cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
        customer: {
        email: req.user.email,
        first_name: firstName,
        last_name: lastName,
        phone_number: '0912345678'
      },
      customization: {
        title: 'BookNest',
        description: description
      }
    };

    console.log('Sending to Chapa:', JSON.stringify(chapaData, null, 2));

    // Use fixed Chapa client
    const response = await chapaFixed.initialize(chapaData);
    
    console.log('Chapa Response:', response);

    if (response.status !== 'success') {
      throw new Error(`Chapa error: ${response.message || 'Payment failed'}`);
    }

    // Return success
    res.json({
      success: true,
      checkoutUrl: response.data.checkout_url,
      paymentId: payment.id,
      txRef: txRef,
      totalAmount: totalAmount
    });

  } catch (error) {
    console.error('Payment error:', error);
    
    // Send appropriate error response
    const errorMessage = error.response?.data?.message || error.message;
    
    res.status(500).json({
      success: false,
      error: 'Payment initiation failed',
      details: errorMessage
    });
  }
}
   
export const verifyPaymentWebhook = async (req, res, next) => {
  try {
    const { tx_ref, status } = req.body;

    if (!tx_ref) {
      console.warn('Webhook received without tx_ref:', req.body);
      return res.status(400).json({ error: 'Missing transaction reference' });
    }

    console.log(`Processing webhook for tx_ref: ${tx_ref}, status: ${status}`);

    // 1. Find payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('tx_ref', tx_ref)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', tx_ref);
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Prevent processing already completed/failed payments
    if (payment.status !== 'pending') {
      console.log(`Payment ${payment.id} already has status: ${payment.status}`);
      return res.status(200).json({ message: 'Payment already processed' });
    }

    // 2. Update payment status
const newStatus = status === 'success' ? 'success' : 'failed';  

    
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    if (updateError) throw updateError;

    // 3. If payment successful, create ownership and sales records
    if (status === 'success') {
      try {
        await processSuccessfulPayment(payment.id, payment.user_id);
        console.log(`Successfully processed payment ${payment.id}`);
      } catch (processError) {
        console.error('Failed to process successful payment:', processError);
        // Mark payment as failed if processing fails
        await supabaseAdmin
          .from('payments')
          .update({ 
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', payment.id);
        throw processError;
      }
    }

    // 4. Return success to Chapa
    res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(200).json({ error: 'Webhook processing failed but acknowledged' });
  }
};

// Helper function to process successful payment
async function processSuccessfulPayment(paymentId, buyerId) {
     const { data: existingItems, error: checkError } = await supabaseAdmin
    .from('payment_items')
    .select('book_format_id')
    .eq('payment_id', paymentId);

  if (checkError) throw checkError;

  // Check if any of these formats are already owned by this user
  if (existingItems && existingItems.length > 0) {
    const formatIds = existingItems.map(item => item.book_format_id);
    
    const { data: existingOwnership, error: ownershipError } = await supabaseAdmin
      .from('user_book_formats')
      .select('book_format_id')
      .eq('user_id', buyerId)
      .in('book_format_id', formatIds);

    if (ownershipError) throw ownershipError;
    
    if (existingOwnership && existingOwnership.length > 0) {
      console.log(`⚠️ User already owns some formats, skipping duplicates`);
      // Continue processing but skip already owned items
    }
  }
  // Start a database transaction
  const { error: beginError } = await supabaseAdmin.rpc('begin');
  if (beginError) throw beginError;

  try {
    // 1. Get payment items with book format details
    const { data: paymentItems, error: itemsError } = await supabaseAdmin
      .from('payment_items')
      .select(`
        *,
        book_formats (
          *,
          books (
            id,
            author_id,
            publisher_id,
            title
          )
        )
      `)
      .eq('payment_id', paymentId);

    if (itemsError) throw itemsError;
    if (!paymentItems || paymentItems.length === 0) {
      throw new Error('No payment items found');
    }

    // 2. Create ownership records for each purchased format
    const ownershipRecords = paymentItems.map(item => ({
      user_id: buyerId,
      book_format_id: item.book_format_id,
      purchased_at: new Date().toISOString()
    }));

    const { error: ownershipError } = await supabaseAdmin
      .from('user_book_formats')
      .insert(ownershipRecords);

    if (ownershipError) throw ownershipError;

    // 3. Process each sale
    for (const item of paymentItems) {
      const bookFormat = item.book_formats;
      const book = bookFormat.books;
      
      // Determine seller (author or publisher)
      let sellerId = book.author_id;
      let isPublisherSale = false;
      
      // Check if publisher should get the sale
      if (book.publisher_id) {
        if (bookFormat.format_type === 'pdf') {
          sellerId = book.publisher_id;
          isPublisherSale = true;
        }
        // For audio formats, author gets the sale
      }

      // Calculate earnings (platform takes 20% commission)
      const salePrice = parseFloat(item.price);
      const platformCommission = salePrice * 0.20;
      const sellerEarnings = salePrice - platformCommission;

      // Create sale record
      const saleRecord = {
        book_id: book.id,
        book_format_id: item.book_format_id,
        format_type: bookFormat.format_type,
        buyer_id: buyerId,
        seller_id: sellerId,
        sale_price: salePrice,
        platform_commission: platformCommission,
        seller_earnings: sellerEarnings,
        payment_id: paymentId,
        sale_date: new Date().toISOString()
      };

      // Insert sale
      const { error: saleError } = await supabaseAdmin
        .from('book_sales')
        .insert([saleRecord]);

      if (saleError) throw saleError;

      // Update seller financial profile
      const { data: existingProfile, error: profileFetchError } = await supabaseAdmin
        .from('seller_financial_profiles')
        .select('*')
        .eq('seller_id', sellerId)
        .single();

      if (profileFetchError && profileFetchError.code !== 'PGRST116') {
        throw profileFetchError;
      }

      if (existingProfile) {
        // Update existing profile
        const { error: updateProfileError } = await supabaseAdmin
          .from('seller_financial_profiles')
          .update({
            total_gross_earnings: (parseFloat(existingProfile.total_gross_earnings) + salePrice).toString(),
            total_platform_commission: (parseFloat(existingProfile.total_platform_commission) + platformCommission).toString(),
            total_net_earnings: (parseFloat(existingProfile.total_net_earnings) + sellerEarnings).toString(),
            available_balance: (parseFloat(existingProfile.available_balance) + sellerEarnings).toString(),
            total_books_sold: existingProfile.total_books_sold + 1,
            total_pdf_sold: bookFormat.format_type === 'pdf' 
              ? (existingProfile.total_pdf_sold || 0) + 1 
              : existingProfile.total_pdf_sold,
            total_audio_sold: bookFormat.format_type === 'audio'
              ? (existingProfile.total_audio_sold || 0) + 1
              : existingProfile.total_audio_sold,
            last_sale_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('seller_id', sellerId);

        if (updateProfileError) throw updateProfileError;
      } else {
        // Create new profile
        const { error: createProfileError } = await supabaseAdmin
          .from('seller_financial_profiles')
          .insert({
            seller_id: sellerId,
            total_gross_earnings: salePrice,
            total_platform_commission: platformCommission,
            total_net_earnings: sellerEarnings,
            available_balance: sellerEarnings,
            total_books_sold: 1,
            total_pdf_sold: bookFormat.format_type === 'pdf' ? 1 : 0,
            total_audio_sold: bookFormat.format_type === 'audio' ? 1 : 0,
            last_sale_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (createProfileError) throw createProfileError;
      }
    }

    // Commit transaction
    const { error: commitError } = await supabaseAdmin.rpc('commit');
    if (commitError) throw commitError;

    console.log(`✅ Successfully processed payment ${paymentId} for ${paymentItems.length} items`);

  } catch (error) {
    // Rollback on error
    await supabaseAdmin.rpc('rollback');
    console.error('❌ Error processing payment, rolled back:', error);
    throw error;
  }
}

// Manual verification endpoint for testing
export const verifyPaymentManually = async (req, res, next) => {
  try {
    const { txRef } = req.body;
    const userId = req.user.id;

    if (!txRef) {
      return res.status(400).json({ error: 'Transaction reference required' });
    }

    console.log(`Manual verification for txRef: ${txRef}`);

    // 1. Verify with Chapa API
    const verificationResponse = await chapa.verify(txRef);

    if (verificationResponse.status !== 'success') {
      return res.status(400).json({ 
        error: 'Payment verification failed', 
        details: verificationResponse.message 
      });
    }

    // 2. Find payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('tx_ref', txRef)
      .eq('user_id', userId)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', txRef);
      return res.status(404).json({ error: 'Payment not found' });
    }

    // 3. If already processed, return current status
    if (payment.status !== 'pending') {
      return res.status(200).json({
        success: true,
        message: 'Payment already processed',
        status: payment.status,
        paymentId: payment.id
      });
    }

    // 4. Update payment status
    const { error: updateError } = await supabaseAdmin
  .from('payments')
  .update({ 
    status: 'success',  
    updated_at: new Date().toISOString()
  })
  .eq('id', payment.id);

    if (updateError) throw updateError;

    // 5. Process successful payment
    await processSuccessfulPayment(payment.id, userId);

    res.status(200).json({
      success: true,
      message: 'Payment verified and processed successfully',
      paymentId: payment.id,
      txRef: txRef
    });

  } catch (error) {
    console.error('Manual verification error:', error);
    next(error);
  }
};

// Check if user owns specific book formats
export const checkOwnership = async (req, res, next) => {
  try {
    const { bookFormatIds } = req.body;
    const userId = req.user.id;

    if (!bookFormatIds || !Array.isArray(bookFormatIds)) {
      return res.status(400).json({ error: 'Please provide book format IDs' });
    }

    const { data: ownedFormats, error } = await supabaseAdmin
      .from('user_book_formats')
      .select('book_format_id')
      .eq('user_id', userId)
      .in('book_format_id', bookFormatIds);

    if (error) throw error;

    const ownedIds = ownedFormats.map(item => item.book_format_id);
    const notOwnedIds = bookFormatIds.filter(id => !ownedIds.includes(id));

    res.status(200).json({
      owned: ownedIds,
      notOwned: notOwnedIds,
      allOwned: notOwnedIds.length === 0
    });

  } catch (error) {
    next(error);
  }
};

// Get user's purchased books
export const getPurchasedBooks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const { data: ownedFormats, error, count } = await supabaseAdmin
      .from('user_book_formats')
      .select(`
        *,
        book_formats (
          *,
          books (
            id,
            title,
            author_name,
            publisher_name,
            cover_image_url,
            description
          )
        )
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('purchased_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Transform data
    const purchasedItems = (ownedFormats || []).map(item => ({
      ownershipId: item.id,
      purchasedAt: item.purchased_at,
      format: {
        id: item.book_formats?.id,
        type: item.book_formats?.format_type,
        price: item.book_formats?.price,
        fileUrl: item.book_formats?.file_url,
        pageCount: item.book_formats?.page_count,
        durationSec: item.book_formats?.duration_sec
      },
      book: item.book_formats?.books
    }));

    res.status(200).json({
      success: true,
      data: {
        items: purchasedItems,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

export const initiateMockPayment = async (req, res, next) => {
  try {
    const { bookFormatIds } = req.body;
    const userId = req.user.id;

    if (!bookFormatIds || !Array.isArray(bookFormatIds) || bookFormatIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one book format' });
    }

    const uniqueFormatIds = [...new Set(bookFormatIds)];

    const { data: bookFormats, error: formatsError } = await supabaseAdmin
      .from('book_formats')
      .select(`
        *,
        books (
          id,
          title,
          author_id,
          publisher_id,
          author_name,
          publisher_name
        )
      `)
      .in('id', uniqueFormatIds);

    if (formatsError) throw formatsError;
    if (!bookFormats || bookFormats.length === 0) {
      return res.status(400).json({ error: 'Selected book formats not found' });
    }

    const { data: existingOwnership, error: ownershipError } = await supabaseAdmin
      .from('user_book_formats')
      .select('book_format_id')
      .eq('user_id', userId)
      .in('book_format_id', uniqueFormatIds);

    if (ownershipError) throw ownershipError;
    
    let availableFormats = [...bookFormats];
    if (existingOwnership && existingOwnership.length > 0) {
      const ownedIds = existingOwnership.map(o => o.book_format_id);
      availableFormats = bookFormats.filter(format => !ownedIds.includes(format.id));
      
      if (availableFormats.length === 0) {
        return res.status(400).json({ 
          error: 'You already own all selected formats',
          ownedFormats: ownedIds 
        });
      }
    }

    const totalAmount = availableFormats.reduce((sum, format) => {
      return sum + parseFloat(format.price || 0);
    }, 0);

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    const txRef = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert([
        {
          user_id: userId,
          amount: totalAmount,
          tx_ref: txRef,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (paymentError) throw paymentError;

    const paymentItems = availableFormats.map(format => ({
      payment_id: payment.id,
      book_format_id: format.id,
      price: format.price
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('payment_items')
      .insert(paymentItems);

    if (itemsError) throw itemsError;

    // For mock payment, we simulate success immediately
    setTimeout(async () => {
      try {
        // Update payment to success
        await supabaseAdmin
          .from('payments')
          .update({ 
            status: 'success',
            updated_at: new Date().toISOString()
          })
          .eq('id', payment.id);

        // Process the payment
        await processSuccessfulPayment(payment.id, userId);
        
        console.log(`✅ Mock payment ${txRef} processed successfully`);
      } catch (error) {
        console.error('Mock payment processing error:', error);
      }
    }, 2000); // Process after 2 seconds

    res.status(200).json({
      success: true,
      message: 'Mock payment initiated - Book will be added to your library in a few seconds',
      paymentId: payment.id,
      txRef: txRef,
      totalAmount: totalAmount,
      isMock: true,
      items: availableFormats.map(format => ({
        formatId: format.id,
        formatType: format.format_type,
        bookTitle: format.books.title,
        price: format.price
      })),
      instructions: 'This is a mock payment. In production, this would redirect to Chapa checkout.'
    });

  } catch (error) {
    console.error('Mock payment initiation error:', error);
    next(error);
  }
};

// Handle Chapa redirect (when user returns from Chapa)
export const handlePaymentCallback = async (req, res, next) => {
  try {
    const { tx_ref, status } = req.query; // From Chapa redirect URL
    
    console.log('🔄 Payment callback received:');
    console.log('Transaction Ref:', tx_ref);
    console.log('Status:', status);

    if (!tx_ref) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing transaction reference' 
      });
    }

    // 1. Find payment in database
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('tx_ref', tx_ref)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', tx_ref);
      return res.status(404).json({ 
        success: false,
        error: 'Payment not found' 
      });
    }

    // 2. If already processed, just return status
    if (payment.status !== 'pending') {
      console.log(`Payment ${payment.id} already has status: ${payment.status}`);
      
      // Redirect to frontend with status
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/result?` +
        `tx_ref=${tx_ref}&status=${payment.status}&already_processed=true`
      );
    }

    // 3. Verify with Chapa API
    let chapaStatus = 'failed';
    try {
      const verification = await chapa.verify(tx_ref);
      console.log('Chapa verification response:', verification);
      
      if (verification.status === 'success' && verification.data.status === 'success') {
        chapaStatus = 'success';
      }
    } catch (verifyError) {
      console.error('Chapa verification failed:', verifyError);
      chapaStatus = 'failed';
    }

    // 4. Update payment status
    const newStatus = chapaStatus === 'success' ? 'success' : 'failed';
    
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    if (updateError) throw updateError;

    // 5. If successful, process the payment (create ownership, sales records)
    if (newStatus === 'success') {
      try {
        await processSuccessfulPayment(payment.id, payment.user_id);
        console.log(`✅ Payment ${payment.id} processed successfully`);
      } catch (processError) {
        console.error('Failed to process payment:', processError);
        // Even if processing fails, payment is still marked as success
        // (Chapa confirmed payment, we just had internal error)
      }
    }

    // 6. Redirect to frontend with result
    const redirectUrl = `${process.env.FRONTEND_URL}/payment/result?` +
      `tx_ref=${tx_ref}&status=${newStatus}&payment_id=${payment.id}`;
    
    console.log(`Redirecting to: ${redirectUrl}`);
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Payment callback error:', error);
    
    // Redirect to frontend with error
    const errorUrl = `${process.env.FRONTEND_URL}/payment/result?` +
      `error=${encodeURIComponent(error.message)}`;
    
    res.redirect(errorUrl);
  }
};

// Manual verification endpoint (for testing or if redirect fails)
export const verifyPayment = async (req, res, next) => {
  try {
    const { tx_ref } = req.body;
    const userId = req.user?.id; // Optional: user can verify their own payments

    if (!tx_ref) {
      return res.status(400).json({ 
        success: false,
        error: 'Transaction reference required' 
      });
    }

    console.log(`🔍 Verifying payment: ${tx_ref}`);

    // 1. Find payment
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('tx_ref', tx_ref)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({ 
        success: false,
        error: 'Payment not found' 
      });
    }

    // 2. Check if user is authorized (if userId provided)
    if (userId && payment.user_id !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to verify this payment' 
      });
    }

    // 3. If already processed, return current status
    if (payment.status !== 'pending') {
      return res.status(200).json({
        success: true,
        message: 'Payment already processed',
        data: {
          status: payment.status,
          paymentId: payment.id,
          amount: payment.amount,
          createdAt: payment.created_at,
          updatedAt: payment.updated_at
        }
      });
    }

    // 4. Verify with Chapa
    let chapaStatus = 'failed';
    let chapaData = null;
    
    try {
      const verification = await chapa.verify(tx_ref);
      console.log('Chapa verification:', verification);
      
      chapaData = verification.data;
      if (verification.status === 'success' && verification.data?.status === 'success') {
        chapaStatus = 'success';
      }
    } catch (verifyError) {
      console.error('Chapa verification error:', verifyError);
      chapaStatus = 'failed';
    }

    // 5. Update payment status
    const newStatus = chapaStatus === 'success' ? 'success' : 'failed';
    
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    if (updateError) throw updateError;

    // 6. If successful, process payment
    let processed = false;
    if (newStatus === 'success') {
      try {
        await processSuccessfulPayment(payment.id, payment.user_id);
        processed = true;
        console.log(`✅ Payment ${payment.id} processed`);
      } catch (processError) {
        console.error('Payment processing failed:', processError);
        processed = false;
      }
    }

    // 7. Return result
    res.status(200).json({
      success: true,
      message: `Payment verification ${chapaStatus}`,
      data: {
        status: newStatus,
        paymentId: payment.id,
        amount: payment.amount,
        processed: processed,
        chapaData: chapaData,
        verifiedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    next(error);
  }
};

 // Helper function to check and lock formats for purchase 
async function checkAndLockFormats(userId, formatIds) {
  try {
    // 1. Check if user already owns any of these formats
    const { data: ownedFormats, error: ownershipError } = await supabaseAdmin
      .from('user_book_formats')
      .select('book_format_id')
      .eq('user_id', userId)
      .in('book_format_id', formatIds);

    if (ownershipError) throw ownershipError;
    
    if (ownedFormats && ownedFormats.length > 0) {
      const ownedIds = ownedFormats.map(o => o.book_format_id);
      throw new Error(`Already owns formats: ${ownedIds.join(', ')}`);
    }

    // 2. Check if there are any pending payments for these formats
    const { data: pendingPayments, error: pendingError } = await supabaseAdmin
      .from('payment_items')
      .select(`
        payment_id,
        payments!inner (
          status,
          user_id
        )
      `)
      .in('book_format_id', formatIds)
      .eq('payments.status', 'pending');

    if (pendingError) throw pendingError;

    // Check if THIS user has pending payments for these formats
    const userPending = pendingPayments?.filter(item => 
      item.payments?.user_id === userId
    ) || [];

    if (userPending.length > 0) {
      throw new Error('You already have a pending payment for these formats');
    }

    // 3. Check if OTHER users have pending payments for these formats
    const otherPending = pendingPayments?.filter(item => 
      item.payments?.user_id !== userId
    ) || [];

    if (otherPending.length > 0) {
      console.warn('⚠️ Formats locked by other users:', formatIds);
      // For now, we'll allow it but log a warning
    }

    return { success: true, message: 'Formats available for purchase' };

  } catch (error) {
    throw error;
  }
}

// Cleanup old pending payments (run as cron job)
export const cleanupStuckPayments = async (req, res) => {
  try {
    console.log('🧹 Cleaning up stuck payments...');
    
    // Find payments pending for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: stuckPayments, error: findError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', thirtyMinutesAgo);

    if (findError) throw findError;

    console.log(`Found ${stuckPayments?.length || 0} stuck payments`);

    // Mark them as failed
    for (const payment of stuckPayments || []) {
      const { error: updateError } = await supabaseAdmin
        .from('payments')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
          notes: 'Auto-failed: Payment timed out'
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error(`Failed to cleanup payment ${payment.id}:`, updateError);
      } else {
        console.log(`✅ Cleaned up payment ${payment.id}`);
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${stuckPayments?.length || 0} stuck payments`
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Check purchase status for specific formats
export const getPurchaseStatus = async (req, res) => {
  try {
    const { formatIds } = req.query;
    const userId = req.user.id;

    if (!formatIds) {
      return res.status(400).json({ error: 'Format IDs required' });
    }

    const ids = Array.isArray(formatIds) ? formatIds : [formatIds];

    // 1. Check ownership
    const { data: owned, error: ownedError } = await supabaseAdmin
      .from('user_book_formats')
      .select('book_format_id')
      .eq('user_id', userId)
      .in('book_format_id', ids);

    if (ownedError) throw ownedError;

    // 2. Check pending payments
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from('payment_items')
      .select(`
        book_format_id,
        payments!inner (
          status,
          created_at
        )
      `)
      .in('book_format_id', ids)
      .eq('payments.user_id', userId)
      .eq('payments.status', 'pending');

    if (pendingError) throw pendingError;

    // Format response
    const status = ids.map(formatId => {
      const isOwned = owned?.some(item => item.book_format_id === formatId);
      const isPending = pending?.some(item => 
        item.book_format_id === formatId && 
        item.payments?.status === 'pending'
      );

      return {
        formatId,
        owned: isOwned,
        pending: isPending,
        canPurchase: !isOwned && !isPending,
        status: isOwned ? 'owned' : isPending ? 'pending' : 'available'
      };
    });

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Get purchase status error:', error);
    res.status(500).json({ error: error.message });
  }
};