import { Router } from 'express'
import * as customerController from '../controllers/customerController'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Get top customers (must be before /:id)
 * GET /customers/top
 */
router.get('/top', customerController.getTopCustomers)

/**
 * Get all customers with search
 * GET /customers
 */
router.get('/', customerController.getCustomers)

/**
 * Get customer by ID
 * GET /customers/:id
 */
router.get('/:id', customerController.getCustomerById)

/**
 * Create customer
 * POST /customers
 */
router.post('/', customerController.createCustomer)

/**
 * Update customer
 * PUT /customers/:id
 */
router.put('/:id', customerController.updateCustomer)

/**
 * Delete customer
 * DELETE /customers/:id
 * Admin/Manager only
 */
router.delete('/:id', requireRole('admin', 'manager'), customerController.deleteCustomer)

export default router
