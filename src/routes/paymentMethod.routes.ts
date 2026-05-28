import { Router } from "express";
import * as paymentMethodController from "../controllers/paymentMethodController";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Get all payment methods
 * GET /payment-methods
 */
router.get("/", paymentMethodController.getPaymentMethods);

/**
 * Get payment method by ID
 * GET /payment-methods/:id
 */
router.get("/:id", paymentMethodController.getPaymentMethodById);

/**
 * Create payment method
 * POST /payment-methods
 * Admin only
 */
router.post(
  "/",
  requireRole("admin"),
  paymentMethodController.createPaymentMethod,
);

/**
 * Update payment method
 * PUT /payment-methods/:id
 * Admin only
 */
router.put(
  "/:id",
  requireRole("admin"),
  paymentMethodController.updatePaymentMethod,
);

/**
 * Delete payment method
 * DELETE /payment-methods/:id
 * Admin only
 */
router.delete(
  "/:id",
  requireRole("admin"),
  paymentMethodController.deletePaymentMethod,
);

export default router;
