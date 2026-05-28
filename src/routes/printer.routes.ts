import { Router } from 'express'
import * as printerController from '../controllers/printerController'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * ========== PRINTER TEMPLATES (MUST BE BEFORE /:id CATCH-ALL) ==========
 */

/**
 * Get all printer templates
 * GET /printers/templates
 */
router.get(
  '/templates',
  requirePermission('printer:read'),
  printerController.getAllTemplates
)

/**
 * Get template by ID
 * GET /printers/templates/:id
 */
router.get(
  '/templates/:id',
  requirePermission('printer:read'),
  printerController.getTemplateById
)

/**
 * Create printer template
 * POST /printers/templates
 */
router.post(
  '/templates',
  requirePermission('printer:manage_templates'),
  printerController.createTemplate
)

/**
 * Update printer template
 * PUT /printers/templates/:id
 */
router.put(
  '/templates/:id',
  requirePermission('printer:manage_templates'),
  printerController.updateTemplate
)

/**
 * Delete printer template
 * DELETE /printers/templates/:id
 */
router.delete(
  '/templates/:id',
  requirePermission('printer:manage_templates'),
  printerController.deleteTemplate
)

/**
 * ========== PRINTER JOBS (MUST BE BEFORE /:id CATCH-ALL) ==========
 */

/**
 * Get print jobs history
 * GET /printers/jobs
 */
router.get(
  '/jobs',
  requirePermission('printer:view_history'),
  printerController.getPrintJobs
)

/**
 * Create print job (test print)
 * POST /printers/jobs
 */
router.post(
  '/jobs',
  requirePermission('printer:test_print'),
  printerController.createPrintJob
)

/**
 * ========== PRINTER ROUTING (MUST BE BEFORE /:id CATCH-ALL) ==========
 */

/**
 * Get printer routing configuration
 * GET /printers/routing
 */
router.get(
  '/routing',
  requirePermission('printer:read'),
  printerController.getPrinterRouting
)

/**
 * Update printer routing
 * PUT /printers/routing/:print_type
 */
router.put(
  '/routing/:print_type',
  requirePermission('printer:update'),
  printerController.updatePrinterRouting
)

/**
 * ========== PRINTER MANAGEMENT ==========
 */

/**
 * Get all printers
 * GET /printers
 */
router.get('/', requirePermission('printer:read'), printerController.getAllPrinters)

/**
 * Get printer by ID
 * GET /printers/:id
 */
router.get('/:id', requirePermission('printer:read'), printerController.getPrinterById)

/**
 * Get printer status
 * GET /printers/:id/status
 */
router.get('/:id/status', requirePermission('printer:read'), printerController.getPrinterStatus)

/**
 * Get template for specific printer (per-printer customization)
 * GET /printers/:id/template
 */
router.get('/:id/template', requirePermission('printer:read'), printerController.getPrinterTemplate)

/**
 * Update template for specific printer (per-printer customization)
 * PUT /printers/:id/template
 */
router.put('/:id/template', requirePermission('printer:manage_templates'), printerController.updatePrinterTemplate)

/**
 * Create new printer
 * POST /printers
 */
router.post('/', requirePermission('printer:create'), printerController.createPrinter)

/**
 * Update printer
 * PUT /printers/:id
 */
router.put('/:id', requirePermission('printer:update'), printerController.updatePrinter)

/**
 * Delete printer
 * DELETE /printers/:id
 */
router.delete(
  '/:id',
  requirePermission('printer:delete'),
  printerController.deletePrinter
)

export default router
