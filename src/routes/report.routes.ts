import { Router } from 'express'
import * as reportController from '../controllers/reportController'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Get dashboard statistics
 * GET /reports/dashboard
 */
router.get('/dashboard', reportController.getDashboardStats)

/**
 * Get daily sales report
 * GET /reports/daily-sales
 */
router.get('/daily-sales', reportController.getDailySales)

/**
 * Get monthly sales report
 * GET /reports/monthly-sales
 */
router.get('/monthly-sales', reportController.getMonthlySales)

/**
 * Get best selling products
 * GET /reports/best-products
 */
router.get('/best-products', reportController.getBestProducts)

/**
 * Get top customers
 * GET /reports/top-customers
 */
router.get('/top-customers', reportController.getTopCustomers)

/**
 * Get sales by category
 * GET /reports/sales-by-category
 */
router.get('/sales-by-category', reportController.getSalesByCategory)

/**
 * Get cashier performance
 * GET /reports/cashier-performance
 * Admin/Manager only
 */
router.get('/cashier-performance', requireRole('admin', 'manager'), reportController.getCashierPerformance)

export default router
