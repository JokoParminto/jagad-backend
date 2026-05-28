import { Router } from 'express'
import * as promoController from '../controllers/promoController'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Get active promos (must be before /:id)
 * GET /promos/active
 */
router.get('/active', promoController.getActivePromos)

/**
 * Get all promos with filters
 * GET /promos
 */
router.get('/', promoController.getPromos)

/**
 * Get promo by ID
 * GET /promos/:id
 */
router.get('/:id', promoController.getPromoById)

/**
 * Create promo
 * POST /promos
 * Admin/Manager only
 */
router.post('/', requireRole('admin', 'manager'), promoController.createPromo)

/**
 * Update promo
 * PUT /promos/:id
 * Admin/Manager only
 */
router.put('/:id', requireRole('admin', 'manager'), promoController.updatePromo)

/**
 * Delete promo
 * DELETE /promos/:id
 * Admin/Manager only
 */
router.delete('/:id', requireRole('admin', 'manager'), promoController.deletePromo)

/**
 * Update promo status
 * PATCH /promos/:id/status
 * Admin/Manager only
 */
router.patch('/:id/status', requireRole('admin', 'manager'), promoController.updatePromoStatus)

export default router
