import Joi from 'joi';

export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        errors: error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    req.body = value;
    next();
  };
};

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  display_name: Joi.string().trim().min(2).max(80).required()
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required()
});

export const profileUpdateSchema = Joi.object({
  display_name: Joi.string().trim().min(2).max(80),
  avatar_url: Joi.string().uri().allow(null, ''),
  bio: Joi.string().max(1000).allow(null, ''),
  favorite_genre_ids: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).max(20)
}).min(1);

export const bookUpdateSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  subtitle: Joi.string().trim().max(200).allow(null, ''),
  description: Joi.string().max(4000).allow(null, ''),
  genre_id: Joi.string().guid({ version: 'uuidv4' }),
  author_name: Joi.string().trim().min(2).max(160),
  author_user_id: Joi.string().guid({ version: 'uuidv4' }).allow(null),
  publisher_name: Joi.string().trim().max(160).allow(null, ''),
  publisher_user_id: Joi.string().guid({ version: 'uuidv4' }).allow(null),
  language: Joi.string().trim().min(2).max(40),
  publication_date: Joi.date().iso().allow(null),
  isbn: Joi.string().trim().max(20).allow(null, ''),
  status: Joi.string().valid('draft', 'pending_review', 'approved', 'rejected', 'archived'),
  cover_image_url: Joi.string().uri(),
  cover_image_path: Joi.string().trim()
}).min(1);

export const authorProfileSchema = Joi.object({
  pen_name: Joi.string().trim().min(2).max(120).required(),
  full_name: Joi.string().trim().max(160).allow(null, ''),
  bio: Joi.string().max(2000).allow(null, ''),
  avatar_url: Joi.string().uri().allow(null, ''),
  website_url: Joi.string().uri().allow(null, '')
});

export const publisherProfileSchema = Joi.object({
  company_name: Joi.string().trim().min(2).max(160).required(),
  bio: Joi.string().max(2000).allow(null, ''),
  avatar_url: Joi.string().uri().allow(null, ''),
  website_url: Joi.string().uri().allow(null, ''),
  support_email: Joi.string().email().allow(null, '')
});

export const linkManagedProfileSchema = Joi.object({
  user_id: Joi.string().guid({ version: 'uuidv4' }).required()
});

export const bookReviewStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'pending_review', 'approved', 'rejected', 'archived').required()
});

export const categorySchema = Joi.object({
  slug: Joi.string().trim().min(2).max(80).required(),
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().max(1000).allow(null, '')
});
