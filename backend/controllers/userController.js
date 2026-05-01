import { authService } from '../services/authService.js';
import { profileService } from '../services/profileService.js';
import { validateRegister, validateLogin } from '../validators/userValidator.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const userController = {
  async register(req, res, next) {
    try {
      validateRegister(req.body);
      const { email, password, display_name } = req.body;
      
      await authService.register(email, password, display_name);
      
      // Auto-login after registration
      const loginResult = await authService.login(email, password);
      
      res.cookie('token', loginResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      logger.info('Registration successful', { email });
      
      res.status(201).json(
        formatSuccess(loginResult.session, 'Account created and logged in successfully')
      );
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      validateLogin(req.body);
      const { email, password } = req.body;
      
      const result = await authService.login(email, password);
      
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      logger.info('Login successful', { email });
      
      res.status(200).json(formatSuccess(result.session, 'Login successful'));
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      authService.logout();
      
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      res.status(200).json(formatSuccess(null, 'Logout successful'));
    } catch (error) {
      next(error);
    }
  },

  async me(req, res, next) {
    try {
      const session = await authService.getUserSession(req.user.id);
      res.status(200).json(formatSuccess(session));
    } catch (error) {
      next(error);
    }
  },

  async getProfile(req, res, next) {
    try {
      const profile = await profileService.getProfile(req.user.id);
      res.status(200).json(formatSuccess(profile));
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const updatedProfile = await profileService.updateReaderProfile(req.user.id, req.body);
      res.status(200).json(formatSuccess(updatedProfile, 'Profile updated successfully'));
    } catch (error) {
      next(error);
    }
  },
};