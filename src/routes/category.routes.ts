import { Router } from "express";
import * as categoryController from "../controllers/categoryController";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Get all categories
 * GET /categories
 */
router.get("/", categoryController.getCategories);

/**
 * Get category by ID
 * GET /categories/:id
 */
router.get("/:id", categoryController.getCategoryById);

/**
 * Create category
 * POST /categories
 * Admin/Manager only
 */
router.post(
  "/",
  requireRole("admin", "manager", "kasir"),
  categoryController.createCategory,
);

/**
 * Update category
 * PUT /categories/:id
 * Admin/Manager only
 */
router.put(
  "/:id",
  requireRole("admin", "manager", "kasir"),
  categoryController.updateCategory,
);

/**
 * Delete category
 * DELETE /categories/:id
 * Admin/Manager only
 */
router.delete(
  "/:id",
  requireRole("admin", "manager", "kasir"),
  categoryController.deleteCategory,
);

export default router;
