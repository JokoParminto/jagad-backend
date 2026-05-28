import { Router } from 'express'
import * as shiftController from '../controllers/shiftController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Open a new shift
 * POST /shifts/open
 */
router.post('/open', shiftController.openShift)

/**
 * Get current active shift
 * GET /shifts/current
 */
router.get('/current', shiftController.getCurrentShift)

/**
 * Close shift
 * POST /shifts/:id/close
 */
router.post('/:id/close', shiftController.closeShift)

/**
 * Get shift summary
 * GET /shifts/:id/summary
 */
router.get('/:id/summary', shiftController.getShiftSummary)

/**
 * Get shift income calculation
 * GET /shifts/:id/income
 */
router.get('/:id/income', shiftController.getShiftIncome)

/**
 * Add expense to shift
 * POST /shifts/:id/expenses
 */
router.post('/:id/expenses', shiftController.addExpense)

/**
 * Get total expenses
 * GET /shifts/expenses/total
 */
router.get('/expenses/total', shiftController.getTotalExpenses)

/**
 * Get shift expenses
 * GET /shifts/:id/expenses
 */
router.get('/:id/expenses', shiftController.getExpenses)

/**
 * Update expense
 * PUT /shifts/:id/expenses/:expenseId
 */
router.put('/:id/expenses/:expenseId', shiftController.updateExpense)

/**
 * Delete expense
 * DELETE /shifts/:id/expenses/:expenseId
 */
router.delete('/:id/expenses/:expenseId', shiftController.deleteExpense)

export default router
