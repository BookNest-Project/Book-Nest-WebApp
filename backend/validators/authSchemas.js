import { z } from 'zod';

/** Shared with frontend @repo/validation — duplicated here for standalone Railway deploys */

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Enter a valid email address (e.g., name@example.com)')
  .max(255, 'Email is too long (max 255 characters)');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password is too long (max 100 characters)')
  .regex(/[A-Z]/, 'Include at least one uppercase letter (A-Z)')
  .regex(/[a-z]/, 'Include at least one lowercase letter (a-z)')
  .regex(/[0-9]/, 'Include at least one number (0-9)')
  .regex(/[^A-Za-z0-9]/, 'Include at least one special character (!@#$%^&*)');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display name must be at least 2 characters')
  .max(80, 'Display name must be less than 80 characters')
  .regex(/^[a-zA-Z]/, 'Display name must start with a letter')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9\s\-'_]*$/,
    'After the first letter, use only letters, numbers, spaces, hyphens, apostrophes, or underscores'
  )
  .refine((val) => !/\s{2,}/.test(val), 'Use single spaces only (no double spaces)');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  remember_me: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  access_token: z.string().min(1, 'Reset link is invalid or expired'),
  password: passwordSchema,
  refresh_token: z.string().optional(),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const confirmEmailSchema = z.object({
  access_token: z.string().min(1, 'Verification link is invalid or expired'),
});
