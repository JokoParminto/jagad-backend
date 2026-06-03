import { Router } from 'express'
import * as transactionController from '../controllers/transactionController'
import * as transactionPaymentController from '../controllers/transactionPaymentController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Get draft transactions (must be before /:id)
 * GET /transactions/draft
 */
router.get('/draft', transactionController.getDraftTransactions)

/**
 * Create draft transaction
 * POST /transactions/draft
 */
router.post('/draft', transactionController.createDraftTransaction)

/**
 * Get reports grouped by shift (must be before /:id)
 * GET /transactions/reports/by-shift
 */
router.get('/reports/by-shift', transactionController.getReportsByShift)

/**
 * Get top selling products (must be before /:id)
 * GET /transactions/stats/top-products?shift_id=&limit=5
 */
router.get('/stats/top-products', transactionController.getTopProducts)

/**
 * Checkout - Create and complete transaction in one step
 * POST /transactions/checkout
 */
router.post('/checkout', transactionController.checkout)

/**
 * Get all transactions with filters
 * GET /transactions
 */
router.get('/', transactionController.getTransactions)

/**
 * Get transaction by ID
 * GET /transactions/:id
 */
router.get('/:id', transactionController.getTransactionById)

/**
 * Update completed transaction (only in active shift)
 * PUT /transactions/:id
 */
router.put('/:id', transactionController.updateTransaction)

/**
 * Apply global discount to transaction
 * PATCH /transactions/:id/discount
 */
router.patch('/:id/discount', transactionController.applyGlobalDiscount)

/**
 * Complete transaction (process payment)
 * POST /transactions/:id/complete
 */
router.post('/:id/complete', transactionController.completeTransaction)

/**
 * Cancel transaction
 * POST /transactions/:id/cancel
 */
router.post('/:id/cancel', transactionController.cancelTransaction)

/**
 * Add item to transaction
 * POST /transactions/:id/items
 */
router.post('/:id/items', transactionController.addTransactionItem)

/**
 * Update transaction item
 * PUT /transactions/:id/items/:itemId
 */
router.put('/:id/items/:itemId', transactionController.updateTransactionItem)

/**
 * Delete transaction item
 * DELETE /transactions/:id/items/:itemId
 */
router.delete('/:id/items/:itemId', transactionController.deleteTransactionItem)

/**
 * SPLIT BILL ENDPOINTS
 * ===================================
 */

/**
 * Record a split bill payment
 * POST /transactions/:id/payments
 */
router.post('/:id/payments', transactionPaymentController.recordSplitBillPayment)

/**
 * Get payment history for transaction
 * GET /transactions/:id/payments
 */
router.get('/:id/payments', transactionPaymentController.getTransactionPayments)

/**
 * Get total paid amount for transaction
 * GET /transactions/:id/total-paid
 */
router.get('/:id/total-paid', transactionPaymentController.getTransactionTotalPaid)

/**
 * Refund a payment
 * POST /transactions/:transactionId/payments/:paymentId/refund
 */
router.post('/:transactionId/payments/:paymentId/refund', transactionPaymentController.refundPayment)

export default router
