import { Router } from 'express'
import { heldOrderController } from '../controllers/heldOrderController'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Create a new held order
 * POST /api/v1/held-orders
 */
router.post('/', requirePermission('kasir'), heldOrderController.createHeldOrder)

/**
 * Get all held orders for current cashier
 * GET /api/v1/held-orders
 */
router.get('/', requirePermission('kasir'), heldOrderController.getHeldOrders)

/**
 * Get held order detail
 * GET /api/v1/held-orders/:id
 */
router.get('/:id', requirePermission('kasir'), heldOrderController.getHeldOrderDetail)

/**
 * Update held order (modify items, discount, etc)
 * PUT /api/v1/held-orders/:id
 */
router.put('/:id', requirePermission('kasir'), heldOrderController.updateHeldOrder)

/**
 * Delete held order (cancel)
 * DELETE /api/v1/held-orders/:id
 */
router.delete('/:id', requirePermission('kasir'), heldOrderController.deleteHeldOrder)

export default router
