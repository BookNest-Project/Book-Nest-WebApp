import Joi from 'joi';

// Schema for user registration
export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  display_name: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid('reader', 'author', 'publisher').default('reader')
});
 

/**
 * Generic validation middleware
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));
      return res.status(400).json({ errors });
    }
    
    next();
  };
}; 
 
// Book creation schema
export const bookSchema = Joi.object({
  title: Joi.string().min(1).max(200).required()
    .messages({
      'string.empty': 'Title is required',
      'string.max': 'Title cannot exceed 200 characters'
    }),
  
  description: Joi.string().max(1000)
    .messages({
      'string.max': 'Description cannot exceed 1000 characters'
    }),
  
  author_name: Joi.string().min(2).max(100).required()
    .messages({
      'string.empty': 'Author name is required',
      'string.min': 'Author name must be at least 2 characters'
    }),
  
  publisher_name: Joi.string().max(100)
    .messages({
      'string.max': 'Publisher name cannot exceed 100 characters'
    }),
  
  category_id: Joi.string().guid({ version: 'uuidv4' }).required()
    .messages({
      'string.guid': 'Category ID must be a valid UUID',
      'any.required': 'Category is required'
    }),
  
  language: Joi.string().valid('amharic', 'english', 'both').default('english'),
  
  cover_image_url: Joi.string().uri()
    .messages({
      'string.uri': 'Cover image must be a valid URL'
    }),
  
  genre: Joi.string().max(50)
    .messages({
      'string.max': 'Genre cannot exceed 50 characters'
    }),
  
  page_count: Joi.number().integer().min(1).max(5000)
    .messages({
      'number.min': 'Page count must be at least 1',
      'number.max': 'Page count cannot exceed 5000'
    })
});

// Book format schema
export const bookFormatSchema = Joi.object({
  format_type: Joi.string().valid('PDF', 'Audio').required()
    .messages({
      'any.only': 'Format type must be either PDF or Audio'
    }),
  
  file_url: Joi.string().uri().required()
    .messages({
      'string.uri': 'File URL must be a valid URL',
      'any.required': 'File URL is required'
    }),
  
  price: Joi.number().min(50).required()
    .messages({
      'number.min': 'Price must be at least 50 ETB',
      'any.required': 'Price is required'
    }),
  
  page_count: Joi.number().integer().min(1).when('format_type', {
    is: 'PDF',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  
  duration_sec: Joi.number().integer().min(1).when('format_type', {
    is: 'Audio',
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

// Schema for partial book updates (allow any subset of fields)
export const bookUpdateSchema = Joi.object({
  title: Joi.string().min(1).max(200).messages({ 'string.max': 'Title cannot exceed 200 characters' }).optional(),
  description: Joi.string().max(1000).optional(),
  author_name: Joi.string().min(2).max(100).optional(),
  publisher_name: Joi.string().max(100).optional(),
  category_id: Joi.string().guid({ version: 'uuidv4' }).optional(),
  language: Joi.string().valid('amharic', 'english', 'both').optional(),
  cover_image_url: Joi.string().uri().optional(),
  genre: Joi.string().max(50).optional(),
  page_count: Joi.number().integer().min(1).max(5000).optional()
  // Optional formats array to allow upsert/delete of book formats in update endpoint
  ,
  formats: Joi.array().items(
    Joi.object({
      id: Joi.string().guid({ version: 'uuidv4' }).optional(),
      action: Joi.string().valid('upsert', 'delete').optional(),
      format_type: Joi.string().valid('PDF', 'Audio').optional(),
      file_url: Joi.string().uri().optional(),
      price: Joi.number().min(50).optional(),
      page_count: Joi.number().integer().min(1).optional(),
      duration_sec: Joi.number().integer().min(1).optional()
    }).messages({ 'string.guid': 'Format id must be a valid UUID' })
  ).optional()
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });



//Payment
export const validatePaymentRequest = (req, res, next) => {
  const { book_format_id, format_type } = req.body;
  
  const errors = [];
  
  if (!book_format_id) {
    errors.push('book_format_id is required');
  }
  
  if (!format_type || !['PDF', 'Audio'].includes(format_type)) {
    errors.push('format_type must be either "PDF" or "Audio"');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false, 
      errors 
    });
  }
  
  next();
};

export const validateWebhookSignature = (req, res, next) => {
  const chapaSignature = req.headers['chapa-signature'];
  
  if (!chapaSignature) {
    return res.status(401).json({ 
      success: false, 
      message: 'No signature provided' 
    });
  }
  
  // In production, you'd verify the signature
  // For now, we'll accept it in test mode
  // TODO: Implement proper signature verification
  
  next();
};