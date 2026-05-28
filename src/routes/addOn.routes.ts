import { Router } from "express";
import * as addOnController from "../controllers/addOnController";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();

/**
 * Get active add-ons
 * GET /add-ons
 * Public endpoint - no authentication required
 */
router.get("/", addOnController.getAddOns);

/**
 * Get all add-ons (including inactive)
 * GET /add-ons/all
 * Admin only
 * MUST come before /:id route to match correctly
 */
router.get(
  "/all",
  authenticate,
  requireRole("admin", "manager", "kasir"),
  addOnController.getAllAddOns,
);

/**
 * Get add-on by ID
 * GET /add-ons/:id
 * Public endpoint - no authentication required
 */
router.get("/:id", addOnController.getAddOnById);

// All write operations require authentication
router.use(authenticate);

/**
 * Create add-on
 * POST /add-ons
 * Admin only
 */
router.post(
  "/",
  requireRole("admin", "manager", "kasir"),
  addOnController.createAddOn,
);

/**
 * Update add-on
 * PUT /add-ons/:id
 * Admin only
 */
router.put(
  "/:id",
  requireRole("admin", "manager", "kasir"),
  addOnController.updateAddOn,
);

/**
 * Update add-on status
 * PATCH /add-ons/:id/status
 * Admin only
 */
router.patch(
  "/:id/status",
  requireRole("admin", "manager", "kasir"),
  addOnController.updateAddOnStatus,
);

/**
 * Delete add-on
 * DELETE /add-ons/:id
 * Admin only
 */
router.delete(
  "/:id",
  requireRole("admin", "manager", "kasir"),
  addOnController.deleteAddOn,
);

export default router;
