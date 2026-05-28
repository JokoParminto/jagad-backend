import { Router } from 'express'
import * as authController from '../controllers/authController'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'

const router = Router()

/**
 * Login user
 * POST /auth/login
 * Public
 */
router.post('/login', authController.login)

/**
 * Logout user
 * POST /auth/logout
 * Protected
 */
router.post('/logout', authenticate, authController.logout)

/**
 * Register new user
 * POST /auth/register
 * Protected - Admin only
 */
router.post('/register', authenticate, requireRole('admin'), authController.register)

/**
 * Refresh access token
 * POST /auth/refresh
 * Public
 */
router.post('/refresh', authController.refresh)

/**
 * Get current user profile
 * GET /auth/me
 * Protected
 */
router.get('/me', authenticate, authController.me)

/**
 * Change password
 * PUT /auth/change-password
 * Protected
 */
router.put('/change-password', authenticate, authController.changePassword)

export default router
