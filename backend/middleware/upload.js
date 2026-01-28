import multer from 'multer';
import path from 'path';

// Store files in memory (we'll upload to Supabase immediately)
const storage = multer.memoryStorage();

// File filter - what files are allowed
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'cover': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    'pdf_file': ['application/pdf'],
    'audio_file': ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a']
  };

  const fieldname = file.fieldname;
  const mimetype = file.mimetype;

  if (allowedTypes[fieldname] && allowedTypes[fieldname].includes(mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(new Error(`Invalid file type for ${fieldname}. Allowed: ${allowedTypes[fieldname]?.join(', ')}`), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file
    files: 3 // Max 3 files: cover + pdf + audio
  }
});

// Export middleware for book upload
export const uploadBookFiles = upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'pdf_file', maxCount: 1 },
  { name: 'audio_file', maxCount: 1 }
]);

// Error handler for upload errors
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large', 
        message: 'Maximum file size is 100MB per file' 
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files', 
        message: 'Maximum 3 files allowed (cover + pdf + audio)' 
      });
    }
  }
  
  if (err) {
    return res.status(400).json({ 
      error: 'File upload error', 
      message: err.message 
    });
  }
  
  next();
};