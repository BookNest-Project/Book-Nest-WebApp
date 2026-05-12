import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const downloadController = {
  async downloadBook(req, res, next) {
    try {
      const userId = req.user.id;
      const { bookFormatId } = req.params;

      console.log('=== DOWNLOAD REQUEST ===');
      console.log('User ID:', userId);
      console.log('Book Format ID:', bookFormatId);

      // Verify user has purchased this book
      const { data: purchase, error: purchaseError } = await supabaseAdmin
        .from('user_purchases')
        .select('id')
        .eq('user_id', userId)
        .eq('book_format_id', bookFormatId)
        .single();

      console.log('Purchase check:', { purchase, error: purchaseError?.message });

      if (purchaseError || !purchase) {
        return res.status(403).json({
          success: false,
          error: { message: 'You have not purchased this book' },
        });
      }

      // Get the file path
      const { data: bookFormat, error: formatError } = await supabaseAdmin
        .from('book_formats')
        .select('storage_path, format_type')
        .eq('id', bookFormatId)
        .single();

      console.log('Book format:', { storage_path: bookFormat?.storage_path, error: formatError?.message });

      if (formatError || !bookFormat || !bookFormat.storage_path) {
        return res.status(404).json({
          success: false,
          error: { message: 'File not found' },
        });
      }

      // Get signed URL from Supabase
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from('booknest')
        .createSignedUrl(bookFormat.storage_path, 60);

      console.log('Signed URL:', signedUrlData?.signedUrl, 'Error:', signedUrlError?.message);

      if (signedUrlError || !signedUrlData) {
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to generate download link' },
        });
      }

      // Fetch the file from Supabase
      const response = await fetch(signedUrlData.signedUrl);
      
      if (!response.ok) {
        console.log('Supabase fetch error:', response.status);
        throw new Error(`Supabase returned ${response.status}`);
      }

      const fileBuffer = await response.arrayBuffer();

      const contentType = bookFormat.format_type === 'PDF' ? 'application/pdf' : 'audio/mpeg';
      const fileExt = bookFormat.format_type === 'PDF' ? 'pdf' : 'mp3';
      const fileName = `${bookFormatId}.${fileExt}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', fileBuffer.byteLength);
      
      res.send(Buffer.from(fileBuffer));
    } catch (error) {
      console.error('Download error:', error);
      logger.error('Download error', { error: error.message });
      next(error);
    }
  },
};