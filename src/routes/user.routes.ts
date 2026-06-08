import { Router } from 'express'
import * as userController from '../controllers/userController'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Update current user profile (must be before /:id)
 * PATCH /users/me
 */
router.patch('/me', userController.updateMyProfile)
router.patch('/me/password', userController.changeMyPassword)

/**
 * Get all users with filters
 * GET /users
 * Admin/Manager only
 */
router.get('/', requireRole('admin', 'manager'), userController.getUsers)

/**
 * Get all available permissions
 * GET /users/permissions/all
 * Admin only
 */
router.get('/permissions/all', requireRole('admin'), userController.getAllPermissions)

/**
 * Get user by ID
 * GET /users/:id
 * Admin/Manager only
 */
router.get('/:id', requireRole('admin', 'manager'), userController.getUserById)

/**
 * Create user
 * POST /users
 * Admin only
 */
router.post('/', requireRole('admin'), userController.createUser)

/**
 * Update user
 * PUT /users/:id
 * Admin only (or Manager for limited fields)
 */
router.put('/:id', requireRole('admin'), userController.updateUser)

/**
 * Delete user
 * DELETE /users/:id
 * Admin only
 */
router.delete('/:id', requireRole('admin'), userController.deleteUser)

/**
 * Reset user password
 * PATCH /users/:id/password
 * Admin only
 */
router.patch('/:id/password', requireRole('admin'), userController.resetUserPassword)

/**
 * Update user status
 * PATCH /users/:id/status
 * Admin only
 */
router.patch('/:id/status', requireRole('admin'), userController.updateUserStatus)

/**
 * Get user permissions
 * GET /users/:id/permissions
 * Admin only
 */
router.get('/:id/permissions', requireRole('admin'), userController.getUserPermissions)

/**
 * Update user permissions
 * PATCH /users/:id/permissions
 * Admin only
 */
router.patch('/:id/permissions', requireRole('admin'), userController.updateUserPermissions)

export default router
