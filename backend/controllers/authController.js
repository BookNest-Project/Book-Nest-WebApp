// backend/controllers/authController.js
import { authService } from '../services/authService.js';
import { validateZod } from '../validators/zodValidator.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  confirmEmailSchema,
  refreshTokenSchema,
  inviteTokenSchema,
  completeInviteSchema,
} from '../validators/authValidator.js';
import { getAccessTokenFromRequest } from '../utils/getAccessToken.js';

export const authController = {
  register: [
    validateZod(registerSchema),
    async (req, res, next) => {
      try {
        const { email, password, display_name } = req.body;
        const result = await authService.register(email, password, display_name);
        res.status(201).json({
          success: true,
          message: result.message,
          data: {
            email: result.email,
            resumed: !!result.resumed,
            verificationEmailPending: !!result.verificationEmailPending,
            verificationEmailError: result.verificationEmailError || undefined,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  login: [
    validateZod(loginSchema),
    async (req, res, next) => {
      try {
        const { email, password, remember_me: rememberMe } = req.body;
        const result = await authService.login(email, password, rememberMe);

        const maxAge = Math.max(0, result.expiresAt - Date.now());

        res.cookie('token', result.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          path: '/',
          maxAge,
        });

        res.status(200).json({
          success: true,
          message: 'Login successful',
          data: {
            ...result.session,
            rememberMe: result.rememberMe,
            needsGenreOnboarding: result.needsGenreOnboarding,
            needsProfileSetup: result.needsProfileSetup,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  adminLogin: [
    validateZod(loginSchema),
    async (req, res, next) => {
      try {
        const { email, password, remember_me: rememberMe } = req.body;
        const result = await authService.login(email, password, rememberMe, { adminOnly: true });

        const maxAge = Math.max(0, result.expiresAt - Date.now());

        res.cookie('token', result.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          path: '/',
          maxAge,
        });

        res.status(200).json({
          success: true,
          message: 'Admin login successful',
          data: {
            ...result.session,
            rememberMe: result.rememberMe,
            /** Admin app runs on a separate origin; Bearer auth avoids cross-site cookie issues. */
            accessToken: result.token,
            refreshToken: result.refreshToken,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  refresh: [
    validateZod(refreshTokenSchema),
    async (req, res, next) => {
      try {
        const { refresh_token: refreshToken } = req.body;
        const result = await authService.refreshAccessToken(refreshToken);

        res.status(200).json({
          success: true,
          message: 'Session refreshed',
          data: {
            accessToken: result.token,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  logout: async (req, res, next) => {
    try {
      const token = getAccessTokenFromRequest(req);
      await authService.logout(token);

      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
      });

      res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      next(error);
    }
  },

  forgotPassword: [
    validateZod(forgotPasswordSchema),
    async (req, res, next) => {
      try {
        const { email } = req.body;
        const result = await authService.forgotPassword(email);
        res.status(200).json({
          success: true,
          message: result.message,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  resetPassword: [
    validateZod(resetPasswordSchema),
    async (req, res, next) => {
      try {
        const { access_token, password, refresh_token } = req.body;
        const result = await authService.resetPassword(
          access_token,
          password,
          refresh_token
        );
        res.status(200).json({
          success: true,
          message: result.message,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  invitePreview: [
    validateZod(inviteTokenSchema),
    async (req, res, next) => {
      try {
        const { access_token } = req.body;
        const preview = await authService.getInvitePreview(access_token);
        res.status(200).json({
          success: true,
          data: preview,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  completeInvite: [
    validateZod(completeInviteSchema),
    async (req, res, next) => {
      try {
        const { access_token, refresh_token, password, pen_name, company_name, full_name } =
          req.body;
        const result = await authService.completeInviteRegistration(
          access_token,
          password,
          refresh_token,
          { pen_name, company_name, full_name }
        );

        const maxAge = Math.max(0, result.expiresAt - Date.now());

        res.cookie('token', result.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          path: '/',
          maxAge,
        });

        res.status(200).json({
          success: true,
          message: 'Registration complete',
          data: {
            ...result.session,
            rememberMe: result.rememberMe,
            needsGenreOnboarding: result.needsGenreOnboarding,
            needsProfileSetup: result.needsProfileSetup,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  resendVerification: [
    validateZod(resendVerificationSchema),
    async (req, res, next) => {
      try {
        const { email } = req.body;
        const result = await authService.resendVerification(email);
        res.status(200).json({
          success: true,
          message: result.message,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  confirmEmail: [
    validateZod(confirmEmailSchema),
    async (req, res, next) => {
      try {
        const { access_token } = req.body;
        const result = await authService.confirmEmail(access_token);
        res.status(200).json({
          success: true,
          message: result.message,
          data: { email: result.email },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  me: async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(200).json({
          success: true,
          data: null,
        });
      }

      const session = await authService.getCurrentUser(req.user.id);
      const flags = await authService.getAuthContinuationFlags(req.user.id);
      res.status(200).json({
        success: true,
        data: {
          ...session,
          needsGenreOnboarding: flags.needsGenreOnboarding,
          needsProfileSetup: flags.needsProfileSetup,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
