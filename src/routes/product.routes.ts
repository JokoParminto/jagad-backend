import { Router } from "express";
import * as productController from "../controllers/productController";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Get low stock products (must be before /:id)
 * GET /products/low-stock
 */
router.get("/low-stock", productController.getLowStockProducts);

/**
 * Get all products with filters
 * GET /products
 */
router.get("/", productController.getProducts);

/**
 * Get product by ID
 * GET /products/:id
 */
router.get("/:id", productController.getProductById);

/**
 * Create product
 * POST /products
 * Admin/Manager/Kasir
 */
router.post(
  "/",
  requireRole("admin", "manager", "kasir"),
  productController.createProduct,
);

/**
 * Update product
 * PUT /products/:id
 * Admin/Manager/Kasir
 */
router.put(
  "/:id",
  requireRole("admin", "manager", "kasir"),
  productController.updateProduct,
);

/**
 * Delete product
 * DELETE /products/:id
 * Admin/Manager only
 */
router.delete(
  "/:id",
  requireRole("admin", "manager", "kasir"),
  productController.deleteProduct,
);

/**
 * Update product status
 * PATCH /products/:id/status
 * Admin/Manager/Kasir
 */
router.patch(
  "/:id/status",
  requireRole("admin", "manager", "kasir"),
  productController.updateProductStatus,
);

/**
 * Update product stock
 * PATCH /products/:id/stock
 * Admin/Manager/Kasir
 */
router.patch(
  "/:id/stock",
  requireRole("admin", "manager", "kasir"),
  productController.updateProductStock,
);

export default router;
