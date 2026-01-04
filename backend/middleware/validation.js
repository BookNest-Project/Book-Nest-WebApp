import Joi from 'joi';

// Schema for user registration
export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  display_name: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid('reader', 'author', 'publisher').default('reader')
});

// Schema for book creation
export const bookSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(1000),
  category_id: Joi.string().guid().required(),
  language: Joi.string().valid('amharic', 'english', 'both'),
  cover_image_url: Joi.string().uri()
});

// Schema for book format
export const bookFormatSchema = Joi.object({
  format_type: Joi.string().valid('PDF', 'Audio').required(),
  file_url: Joi.string().uri().required(),
  price: Joi.number().min(50).required(),  // Minimum 50 ETB
  page_count: Joi.number().when('format_type', {
    is: 'PDF',
    then: Joi.number().min(1).required(),
    otherwise: Joi.forbidden()
  }),
  duration_sec: Joi.number().when('format_type', {
    is: 'Audio',
    then: Joi.number().min(1).required(),
    otherwise: Joi.forbidden()
  })
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