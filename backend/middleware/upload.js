import multer from 'multer';

// Configure multer for memory storage (we'll upload to Supabase directly)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
    'application/pdf',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB max
  },
});