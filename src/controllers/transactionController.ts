import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { successResponse } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../middleware/auth";
import {
  calculateMemberPricing,
  calculatePromoDiscount,
  resolvePaymentMethodId,
  isCustomerMember,
  calculateTotalMemberSavings,
  getPaymentMethodById,
} from "../utils/transactionHelpers";
import { enqueuePaidOrder, updateHoldToPaid } from "./queueController";

/**
 * Generate transaction number (TRX-YYYYMMDD-XXXX)
 */
const generateTransactionNumber = async (): Promise<string> => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const datePrefix = `TRX-${year}${month}${day}`;

  // Get the count of transactions today
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM transactions
     WHERE transaction_number LIKE $1`,
    [`${datePrefix}-%`],
  );

  const count = parseInt(result.rows[0].count) + 1;
  const sequence = String(count).padStart(4, "0");

  return `${datePrefix}-${sequence}`;
};

/**
 * Calculate transaction totals
 */
const calculateTransactionTotals = (
  items: any[],
  discountGlobal: number,
  discountGlobalType: string,
) => {
  // Ensure all values are numbers
  const discountGlobalNum = Number(discountGlobal) || 0;

  // Calculate subtotal (product only) and discount from items
  // Note: add-ons are stored separately in transaction_item_add_ons
  const subtotal = items.reduce((sum, item) => {
    const itemSubtotal = parseFloat(item.subtotal) || 0;
    return sum + itemSubtotal;
  }, 0);

  // Discount items is the sum of (product_price * quantity - item.subtotal)
  // This gives us the item-level discounts only
  const discountItems = items.reduce((sum, item) => {
    const itemSubtotal =
      (parseFloat(item.product_price) || 0) * (parseInt(item.quantity) || 1);
    const itemTotal = parseFloat(item.total) || 0;
    return sum + (itemSubtotal - itemTotal);
  }, 0);

  // Calculate global discount
  let globalDiscountAmount = 0;
  if (discountGlobalType === "percentage") {
    globalDiscountAmount = (subtotal * discountGlobalNum) / 100;
  } else {
    globalDiscountAmount = discountGlobalNum;
  }

  // Ensure all are numbers before calling toFixed
  const subtotalNum = Number(subtotal) || 0;
  const discountItemsNum = Number(discountItems) || 0;
  const globalDiscountAmountNum = Number(globalDiscountAmount) || 0;
  const totalNum = Math.max(
    0,
    subtotalNum - discountItemsNum - globalDiscountAmountNum,
  );

  return {
    subtotal: subtotalNum.toFixed(2),
    discountItems: discountItemsNum.toFixed(2),
    discountGlobal: globalDiscountAmountNum.toFixed(2),
    total: totalNum.toFixed(2),
  };
};

/**
 * Create draft transaction
 * POST /api/v1/transactions/draft
 */
export const createDraftTransaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cashierId = req.user?.id;
    const { customer_id, notes } = req.body;

    console.log(
      "[createDraftTransaction] Creating draft for cashier:",
      cashierId,
    );

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    const transactionNumber = await generateTransactionNumber();
    console.log(
      "[createDraftTransaction] Generated transaction number:",
      transactionNumber,
    );

    // Get current active shift
    const shiftResult = await pool.query(
      `SELECT id FROM shifts
       WHERE cashier_id = $1
       AND status = 'active'
       AND DATE(opened_at) = CURRENT_DATE`,
      [cashierId],
    );

    const shiftId = shiftResult.rows.length > 0 ? shiftResult.rows[0].id : null;
    console.log("[createDraftTransaction] Shift ID:", shiftId);

    const result = await pool.query(
      `INSERT INTO transactions (
        transaction_number, customer_id, cashier_id, subtotal, total, status, notes, shift_id
      ) VALUES ($1, $2, $3, 0, 0, 'draft', $4, $5)
      RETURNING *`,
      [transactionNumber, customer_id || null, cashierId, notes, shiftId],
    );

    const createdId = result.rows[0].id;
    console.log(
      "[createDraftTransaction] Created transaction with ID:",
      createdId,
      "Status:",
      result.rows[0].status,
    );

    res.json(
      successResponse(result.rows[0], "Draft transaksi berhasil dibuat"),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get draft transactions (for current cashier)
 * GET /api/v1/transactions/draft
 */
export const getDraftTransactions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cashierId = req.user?.id;

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    const result = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'payment_status', items_data.payment_status,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.payment_status,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.status = 'draft' AND t.cashier_id = $1
       GROUP BY t.id, c.name, c.phone_number, u.full_name
       ORDER BY t.created_at DESC`,
      [cashierId],
    );

    res.json(successResponse(result.rows));
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaction by ID
 * GET /api/v1/transactions/:id
 */
export const getTransactionById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        c.email as customer_email,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'payment_status', items_data.payment_status,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
            ti.discount_type,
            ti.subtotal,
            ti.total,
            ti.payment_status,
            ti.notes,
            ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.id = $1
       GROUP BY t.id, c.name, c.phone_number, c.email, u.full_name`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Transaksi tidak ditemukan", 404);
    }

    res.json(successResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

/**
 * Add item to transaction
 * POST /api/v1/transactions/:id/items
 */
export const addTransactionItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      product_id,
      quantity,
      discount_amount = 0,
      discount_type = "amount",
      notes,
      addOns = [],
    } = req.body;

    console.log(
      "[addTransactionItem] Adding item to transaction:",
      id,
      "with",
      addOns.length,
      "add-ons",
    );

    // Ensure numeric values are properly typed
    const quantityValue = parseInt(quantity);
    const discountAmountValue = parseFloat(discount_amount);

    if (isNaN(quantityValue) || isNaN(discountAmountValue)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Quantity dan discount_amount harus berupa angka",
        400,
      );
    }

    await client.query("BEGIN");

    // Check if transaction exists and is draft
    const transactionResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND status = $2",
      [id, "draft"],
    );

    console.log(
      "[addTransactionItem] Transaction found:",
      transactionResult.rows.length > 0,
      "Status:",
      transactionResult.rows[0]?.status,
    );

    if (transactionResult.rows.length === 0) {
      console.log(
        "[addTransactionItem] ERROR: Draft transaction not found for id:",
        id,
      );
      throw new AppError("NOT_FOUND", "Draft transaksi tidak ditemukan", 404);
    }

    // Validation
    if (!product_id || quantityValue <= 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Product ID dan quantity harus diisi",
        400,
      );
    }

    // Get product details
    const productResult = await client.query(
      "SELECT * FROM products WHERE id = $1 AND status = $2",
      [product_id, "active"],
    );

    if (productResult.rows.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "Produk tidak ditemukan atau tidak aktif",
        404,
      );
    }

    const product = productResult.rows[0];

    // Calculate member pricing
    const transaction = transactionResult.rows[0];
    const memberPricing = await calculateMemberPricing(
      client,
      product_id,
      transaction.customer_id,
    );
    const productPrice = memberPricing.priceToUse;

    // Check if item already exists in transaction
    const existingItemResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1 AND product_id = $2",
      [id, product_id],
    );

    let transactionItemId: string;

    if (existingItemResult.rows.length > 0) {
      // Update existing item (add quantity) - store product subtotal only
      const existingItem = existingItemResult.rows[0];
      transactionItemId = existingItem.id;
      const newQuantity = existingItem.quantity + quantityValue;
      const newProductSubtotal = productPrice * newQuantity;
      const newMemberSavings = memberPricing.memberSavings * newQuantity;

      let newDiscountAmount = 0;
      if (discount_type === "percentage") {
        newDiscountAmount = (newProductSubtotal * discountAmountValue) / 100;
      } else {
        newDiscountAmount = discountAmountValue;
      }

      const newProductTotal = newProductSubtotal - newDiscountAmount;

      await client.query(
        `UPDATE transaction_items
         SET quantity = $1,
             subtotal = $2,
             total = $3,
             discount_amount = $4,
             discount_type = $5,
             notes = COALESCE($6, notes),
             is_member_price = $7,
             member_savings = $8
         WHERE id = $9
         RETURNING *`,
        [
          newQuantity,
          newProductSubtotal,
          newProductTotal,
          discountAmountValue,
          discount_type,
          notes,
          memberPricing.isMemberPrice,
          newMemberSavings.toFixed(2),
          existingItem.id,
        ],
      );

      // Delete existing add-ons for this item (they will be re-added below)
      await client.query(
        "DELETE FROM transaction_item_add_ons WHERE transaction_item_id = $1",
        [transactionItemId],
      );
    } else {
      // Insert new item (store product subtotal only, add-ons stored separately)
      const productSubtotal = productPrice * quantityValue;
      const itemMemberSavings = memberPricing.memberSavings * quantityValue;
      let productDiscountAmount = 0;
      if (discount_type === "percentage") {
        productDiscountAmount = (productSubtotal * discountAmountValue) / 100;
      } else {
        productDiscountAmount = discountAmountValue;
      }
      const productTotal = productSubtotal - productDiscountAmount;

      const insertResult = await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_price, quantity,
          discount_amount, discount_type, subtotal, total, notes,
          original_price, member_price, is_member_price, member_savings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          id,
          product_id,
          product.name,
          productPrice,
          quantityValue,
          discountAmountValue,
          discount_type,
          productSubtotal,
          productTotal,
          notes,
          memberPricing.originalPrice,
          memberPricing.memberPrice,
          memberPricing.isMemberPrice,
          itemMemberSavings.toFixed(2),
        ],
      );
      transactionItemId = insertResult.rows[0].id;
    }

    // Insert add-ons for this item
    if (addOns && addOns.length > 0) {
      console.log(
        "[addTransactionItem] Inserting",
        addOns.length,
        "add-ons for item:",
        transactionItemId,
      );
      for (const addOn of addOns) {
        const addOnPrice = parseFloat(addOn.price) || 0;
        const addOnQuantity = parseInt(addOn.quantity) || 1;
        const addOnSubtotal =
          parseFloat(addOn.subtotal) || addOnPrice * addOnQuantity;

        await client.query(
          `INSERT INTO transaction_item_add_ons (transaction_item_id, add_on_id, quantity, price, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            transactionItemId,
            addOn.addOnId,
            addOnQuantity,
            addOnPrice,
            addOnSubtotal,
          ],
        );
      }
    }

    // Recalculate transaction totals (including add-ons)
    const itemsResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    // Get add-ons for all items and calculate total add-ons
    let totalAddOnsPrice = 0;
    for (const item of itemsResult.rows) {
      const addOnsResult = await client.query(
        "SELECT COALESCE(SUM(subtotal), 0) as total FROM transaction_item_add_ons WHERE transaction_item_id = $1",
        [item.id],
      );
      const itemAddOnsTotal = parseFloat(addOnsResult.rows[0].total) || 0;
      totalAddOnsPrice += itemAddOnsTotal;
    }

    // Calculate subtotal including add-ons
    const productSubtotal = itemsResult.rows.reduce((sum, item) => {
      return sum + (parseFloat(item.subtotal) || 0);
    }, 0);
    const subtotalWithAddOns = productSubtotal + totalAddOnsPrice;

    // Calculate item discounts
    const discountItems = itemsResult.rows.reduce((sum, item) => {
      const itemSubtotal =
        (parseFloat(item.product_price) || 0) * (parseInt(item.quantity) || 1);
      const itemTotal = parseFloat(item.total) || 0;
      return sum + (itemSubtotal - itemTotal);
    }, 0);

    // Calculate global discount
    const discountGlobalNum = Number(transaction.discount_global) || 0;
    let globalDiscountAmount = 0;
    if (transaction.discount_global_type === "percentage") {
      globalDiscountAmount = (productSubtotal * discountGlobalNum) / 100;
    } else {
      globalDiscountAmount = discountGlobalNum;
    }

    // Calculate totals
    const totalNum = Math.max(
      0,
      subtotalWithAddOns - discountItems - globalDiscountAmount,
    );

    // Calculate total member savings and customer member status
    const totalMemberSavings = calculateTotalMemberSavings(itemsResult.rows);
    const customerIsMember = await isCustomerMember(
      client,
      transaction.customer_id,
    );

    // Update transaction totals
    await client.query(
      `UPDATE transactions
       SET subtotal = $1,
           discount_items = $2,
           discount_global = $3,
           total = $4,
           total_member_savings = $5,
           customer_is_member = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        subtotalWithAddOns.toFixed(2),
        discountItems.toFixed(2),
        globalDiscountAmount.toFixed(2),
        totalNum.toFixed(2),
        totalMemberSavings.toFixed(2),
        customerIsMember,
        id,
      ],
    );

    await client.query("COMMIT");

    // Fetch updated transaction to return complete data (with add-ons)
    const updatedTransactionResult = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.id = $1
       GROUP BY t.id, c.name, c.phone_number, u.full_name`,
      [id],
    );

    console.log(
      "[addTransactionItem] Returning updated transaction:",
      updatedTransactionResult.rows[0]?.id,
    );
    res.json(
      successResponse(
        updatedTransactionResult.rows[0],
        "Item berhasil ditambahkan",
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Update transaction item
 * PUT /api/v1/transactions/:id/items/:itemId
 */
export const updateTransactionItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id, itemId } = req.params;
    const { quantity, discount_amount, discount_type, notes } = req.body;

    await client.query("BEGIN");

    // Check if transaction exists and is draft
    const transactionResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND status = $2",
      [id, "draft"],
    );

    if (transactionResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Draft transaksi tidak ditemukan", 404);
    }

    // Get item
    const itemResult = await client.query(
      "SELECT * FROM transaction_items WHERE id = $1 AND transaction_id = $2",
      [itemId, id],
    );

    if (itemResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Item tidak ditemukan", 404);
    }

    const item = itemResult.rows[0];

    // ✅ Check if item is locked (already paid)
    if (item.payment_status === "paid") {
      throw new AppError(
        "ITEM_LOCKED",
        "Cannot edit paid items. Item is locked.",
        400,
      );
    }

    // Validation
    if (quantity && quantity <= 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Quantity harus lebih dari 0",
        400,
      );
    }

    // Stock tracking disabled - using simple availability flag instead

    // Calculate new totals
    const newQuantity = quantity || item.quantity;
    const newDiscountAmount =
      discount_amount !== undefined ? discount_amount : item.discount_amount;
    const newDiscountType = discount_type || item.discount_type;

    const itemSubtotal = item.product_price * newQuantity;
    let itemDiscountAmountCalculated = 0;

    if (newDiscountType === "percentage") {
      itemDiscountAmountCalculated = (itemSubtotal * newDiscountAmount) / 100;
    } else {
      itemDiscountAmountCalculated = newDiscountAmount;
    }

    const itemTotal = itemSubtotal - itemDiscountAmountCalculated;

    // Update item
    await client.query(
      `UPDATE transaction_items
       SET quantity = $1,
           discount_amount = $2,
           discount_type = $3,
           subtotal = $4,
           total = $5,
           notes = COALESCE($6, notes)
       WHERE id = $7
       RETURNING *`,
      [
        newQuantity,
        newDiscountAmount,
        newDiscountType,
        itemSubtotal,
        itemTotal,
        notes,
        itemId,
      ],
    );

    // Recalculate transaction totals
    const itemsResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    const transaction = transactionResult.rows[0];
    const totals = calculateTransactionTotals(
      itemsResult.rows,
      transaction.discount_global || 0,
      transaction.discount_global_type || "amount",
    );

    // Update transaction totals
    await client.query(
      `UPDATE transactions
       SET subtotal = $1,
           discount_items = $2,
           discount_global = $3,
           total = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        totals.subtotal,
        totals.discountItems,
        totals.discountGlobal,
        totals.total,
        id,
      ],
    );

    await client.query("COMMIT");

    // Fetch updated transaction to return complete data (with add-ons)
    const updatedTransactionResult = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.id = $1
       GROUP BY t.id, c.name, c.phone_number, u.full_name`,
      [id],
    );

    res.json(
      successResponse(
        updatedTransactionResult.rows[0],
        "Item berhasil diupdate",
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Delete transaction item
 * DELETE /api/v1/transactions/:id/items/:itemId
 */
export const deleteTransactionItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id, itemId } = req.params;

    await client.query("BEGIN");

    // Check if transaction exists and is draft
    const transactionResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND status = $2",
      [id, "draft"],
    );

    if (transactionResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Draft transaksi tidak ditemukan", 404);
    }

    // ✅ Check if item is locked (already paid)
    const itemResult = await client.query(
      "SELECT payment_status FROM transaction_items WHERE id = $1 AND transaction_id = $2",
      [itemId, id],
    );

    if (itemResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Item tidak ditemukan", 404);
    }

    if (itemResult.rows[0].payment_status === "paid") {
      throw new AppError(
        "ITEM_LOCKED",
        "Cannot delete paid items. Item is locked.",
        400,
      );
    }

    // Delete item
    await client.query(
      "DELETE FROM transaction_items WHERE id = $1 AND transaction_id = $2",
      [itemId, id],
    );

    // Recalculate transaction totals
    const itemsResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    const transaction = transactionResult.rows[0];

    if (itemsResult.rows.length === 0) {
      // No items left, reset totals
      await client.query(
        `UPDATE transactions
         SET subtotal = 0,
             discount_items = 0,
             discount_global = 0,
             total = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id],
      );
    } else {
      const totals = calculateTransactionTotals(
        itemsResult.rows,
        transaction.discount_global || 0,
        transaction.discount_global_type || "amount",
      );

      await client.query(
        `UPDATE transactions
         SET subtotal = $1,
             discount_items = $2,
             discount_global = $3,
             total = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          totals.subtotal,
          totals.discountItems,
          totals.discountGlobal,
          totals.total,
          id,
        ],
      );
    }

    await client.query("COMMIT");

    // Fetch updated transaction to return complete data (with add-ons)
    const updatedTransactionResult = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.id = $1
       GROUP BY t.id, c.name, c.phone_number, u.full_name`,
      [id],
    );

    res.json(
      successResponse(
        updatedTransactionResult.rows[0],
        "Item berhasil dihapus",
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Apply global discount to transaction
 * PATCH /api/v1/transactions/:id/discount
 */
export const applyGlobalDiscount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { discount_global = 0, discount_global_type = "amount" } = req.body;

    // Ensure discount_global is a number
    const discountGlobalValue = parseFloat(discount_global);
    if (isNaN(discountGlobalValue)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Discount global harus berupa angka",
        400,
      );
    }

    await client.query("BEGIN");

    // Check if transaction exists and is draft
    const transactionResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND status = $2",
      [id, "draft"],
    );

    if (transactionResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Draft transaksi tidak ditemukan", 404);
    }

    // Validation
    if (discountGlobalValue < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Discount tidak boleh negatif",
        400,
      );
    }

    if (discount_global_type === "percentage" && discountGlobalValue > 100) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Discount persentase tidak boleh lebih dari 100%",
        400,
      );
    }

    // Get transaction items
    const itemsResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    // Recalculate transaction totals
    const totals = calculateTransactionTotals(
      itemsResult.rows,
      discountGlobalValue,
      discount_global_type,
    );

    // Update transaction
    const result = await client.query(
      `UPDATE transactions
       SET subtotal = $1,
           discount_items = $2,
           discount_global = $3,
           discount_global_type = $4,
           total = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        totals.subtotal,
        totals.discountItems,
        totals.discountGlobal,
        discount_global_type,
        totals.total,
        id,
      ],
    );

    await client.query("COMMIT");

    res.json(successResponse(result.rows[0], "Discount berhasil diterapkan"));
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Complete transaction (process payment)
 * POST /api/v1/transactions/:id/complete
 */
export const completeTransaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      payment_method = "cash",
      payment_method_id,
      payment_details,
      amount_paid,
      notes,
      promo_id = null,
    } = req.body;

    console.log("[completeTransaction] Request:", {
      id,
      payment_method,
      amount_paid,
    });

    // Ensure amount_paid is a number
    const amountPaidValue = parseFloat(amount_paid);
    if (isNaN(amountPaidValue)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Amount paid harus berupa angka",
        400,
      );
    }

    await client.query("BEGIN");

    // Check if transaction exists - first check ANY status
    console.log("[completeTransaction] Checking for transaction:", id);
    const anyTransactionResult = await client.query(
      "SELECT id, status FROM transactions WHERE id = $1",
      [id],
    );
    console.log(
      "[completeTransaction] Any transaction found:",
      anyTransactionResult.rows,
    );

    // Check if transaction exists and is draft
    const transactionResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND status = $2",
      [id, "draft"],
    );

    console.log(
      "[completeTransaction] Draft transaction found:",
      transactionResult.rows.length > 0,
    );

    if (transactionResult.rows.length === 0) {
      console.log(
        "[completeTransaction] ERROR: Draft transaction not found for id:",
        id,
      );
      throw new AppError("NOT_FOUND", "Draft transaksi tidak ditemukan", 404);
    }

    const transaction = transactionResult.rows[0];
    const transactionTotal = parseFloat(transaction.total) || 0;

    // Validation
    if (!amountPaidValue || amountPaidValue < transactionTotal) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Jumlah pembayaran tidak mencukupi. Total: ${transactionTotal}`,
        400,
      );
    }

    // Get transaction items
    const itemsResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    if (itemsResult.rows.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Transaksi harus memiliki minimal 1 item",
        400,
      );
    }

    // Resolve payment method ID
    const resolvedPaymentMethodId = payment_method_id
      ? payment_method_id
      : await resolvePaymentMethodId(client, payment_method);

    // Get customer member status
    const customerIsMember = await isCustomerMember(
      client,
      transaction.customer_id,
    );

    // Calculate total member savings
    const totalMemberSavings = calculateTotalMemberSavings(itemsResult.rows);

    // Calculate promo if provided
    const promoInfo = await calculatePromoDiscount(
      client,
      promo_id,
      transactionTotal,
    );
    const promoAmount = promoInfo ? promoInfo.promoAmount : 0;

    // Adjust total if promo applied
    const finalTotal = transactionTotal - promoAmount;

    // Stock tracking disabled - using simple availability flag instead

    // Update customer stats if customer is set
    if (transaction.customer_id) {
      await client.query(
        `UPDATE customers
         SET total_spending = total_spending + $1,
             total_transactions = total_transactions + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [finalTotal, transaction.customer_id],
      );
    }

    // Calculate change (use finalTotal with promo applied)
    const changeAmount = amountPaidValue - finalTotal;

    // Complete transaction
    await client.query(
      `UPDATE transactions
       SET status = 'completed',
           payment_method = $1,
           payment_method_id = $2,
           payment_details = $3,
           amount_paid = $4,
           change_amount = $5,
           notes = COALESCE($6, notes),
           total_member_savings = $7,
           customer_is_member = $8,
           promo_id = $9,
           promo_name = $10,
           promo_discount_type = $11,
           promo_discount_value = $12,
           promo_amount = $13,
           total = $14,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15`,
      [
        payment_method,
        resolvedPaymentMethodId,
        payment_details,
        amountPaidValue,
        changeAmount,
        notes,
        totalMemberSavings.toFixed(2),
        customerIsMember,
        promoInfo ? promoInfo.promoId : null,
        promoInfo ? promoInfo.promoName : null,
        promoInfo ? promoInfo.promoDiscountType : null,
        promoInfo ? promoInfo.promoDiscountValue : null,
        promoAmount.toFixed(2),
        finalTotal.toFixed(2),
        id,
      ],
    );

    await client.query("COMMIT");

    // Get complete transaction with items (including add-ons)
    const completeTransaction = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.id = $1
       GROUP BY t.id, c.name, c.phone_number, u.full_name`,
      [id],
    );

    res.json(
      successResponse(
        completeTransaction.rows[0],
        "Transaksi berhasil diselesaikan",
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Cancel transaction
 * POST /api/v1/transactions/:id/cancel
 */
export const cancelTransaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    // Check if transaction exists and is draft
    const transactionResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND status = $2",
      [id, "draft"],
    );

    if (transactionResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Draft transaksi tidak ditemukan", 404);
    }

    // Update status to cancelled
    const result = await client.query(
      `UPDATE transactions
       SET status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id],
    );

    await client.query("COMMIT");

    res.json(successResponse(result.rows[0], "Transaksi berhasil dibatalkan"));
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Get all transactions with filters
 * GET /api/v1/transactions
 */
export const getTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customer_id,
      cashier_id,
      shift_id,
      payment_method,
      start_date,
      end_date,
      search,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query as any;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      const statusList = String(status).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (statusList.length > 1) {
        const placeholders = statusList.map((_: string, i: number) => `$${paramIndex + i}`).join(', ');
        conditions.push(`t.status IN (${placeholders})`);
        params.push(...statusList);
        paramIndex += statusList.length;
      } else {
        conditions.push(`t.status = $${paramIndex++}`);
        params.push(status);
      }
    }

    if (customer_id) {
      conditions.push(`t.customer_id = $${paramIndex++}`);
      params.push(customer_id);
    }

    if (cashier_id) {
      conditions.push(`t.cashier_id = $${paramIndex++}`);
      params.push(cashier_id);
    }

    if (shift_id) {
      conditions.push(`t.shift_id = $${paramIndex++}`);
      params.push(shift_id);
    }

    if (payment_method) {
      conditions.push(`t.payment_method = $${paramIndex++}`);
      params.push(payment_method);
    }

    if (start_date) {
      conditions.push(`DATE(t.created_at) >= $${paramIndex++}`);
      params.push(start_date);
    }

    if (end_date) {
      conditions.push(`DATE(t.created_at) <= $${paramIndex++}`);
      params.push(end_date);
    }

    if (search) {
      conditions.push(
        `(t.transaction_number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.cashier_id = u.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get transactions
    const validSortColumns = [
      "transaction_number",
      "total",
      "created_at",
      "completed_at",
    ];
    const sortColumn = validSortColumns.includes(sortBy as string)
      ? `t.${sortBy}`
      : "t.created_at";
    const sortDirection = sortOrder === "asc" ? "ASC" : "DESC";

    params.push(parseInt(limit), offset);

    const query = `
      SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) as items_count
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.cashier_id = u.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    console.log(`SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) as items_count
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.cashier_id = u.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}`);

    const result = await pool.query(query, params);

    res.json(
      successResponse(
        result.rows,
        'success',
        {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Checkout - Create and complete transaction in one step
 * POST /api/v1/transactions/checkout
 */
export const checkout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const cashierId = req.user?.id;
    let {
      customer_id,
      payment_method = "cash",
      payment_method_id,
      payment_details,
      amount_paid,
      shift_id,
      discount_global = 0,
      discount_global_type = "amount",
      promo_id = null,
      notes,
      items = [],
    } = req.body;

    console.log(
      "[checkout] Starting checkout for cashier:",
      cashierId,
      "items:",
      items.length,
    );

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    const paymentMehtodData = await getPaymentMethodById(
      pool,
      req.body.payment_method_id,
    );

    if (paymentMehtodData) {
      payment_method = paymentMehtodData.name;
      payment_details = {
        [paymentMehtodData.name]: req.body.amount_paid,
      };
    }

    // const normalizedPaymentMethod = String(payment_method || "").toLowerCase();

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Items tidak boleh kosong", 400);
    }

    const amountPaidValue = parseFloat(amount_paid);
    if (isNaN(amountPaidValue)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Amount paid harus berupa angka",
        400,
      );
    }

    await client.query("BEGIN");

    // Step 1: Generate transaction number
    const transactionNumber = await generateTransactionNumber();
    console.log("[checkout] Generated transaction number:", transactionNumber);

    // Step 2: Resolve shift_id (prefer request, fallback to current active shift)
    let shiftId = shift_id || null;
    if (!shiftId) {
      const shiftResult = await client.query(
        `SELECT id FROM shifts
         WHERE cashier_id = $1
         AND status = 'active'`,
        [cashierId],
      );
      shiftId = shiftResult.rows.length > 0 ? shiftResult.rows[0].id : null;
    }

    // Step 2.5: Resolve payment method ID
    const resolvedPaymentMethodId = payment_method_id
      ? payment_method_id
      : await resolvePaymentMethodId(client, payment_method);

    // Step 2.6: Check if customer is member
    const customerIsMember = await isCustomerMember(client, customer_id);

    // Step 3: Calculate totals from items WITH MEMBER PRICING
    let productSubtotal = 0;
    let totalAddOnsPrice = 0;
    let totalItemDiscounts = 0;
    let totalMemberSavings = 0;

    // Validate and sum items
    for (const item of items) {
      const productResult = await client.query(
        "SELECT stock, price FROM products WHERE id = $1 AND status = $2",
        [item.product_id, "active"],
      );

      if (productResult.rows.length === 0) {
        throw new AppError(
          "NOT_FOUND",
          `Produk ${item.product_name} tidak ditemukan atau tidak aktif`,
          404,
        );
      }

      const qty = parseInt(item.quantity) || 1;
      const availableStock = parseInt(productResult.rows[0].stock) || 0;

      if (availableStock < qty) {
        throw new AppError(
          "OUT_OF_STOCK",
          `Stok ${item.product_name} tidak cukup. Stok tersisa: ${availableStock}`,
          400,
        );
      }

      // Calculate member pricing
      const memberPricing = await calculateMemberPricing(
        client,
        item.product_id,
        customer_id,
      );
      const productPrice = memberPricing.priceToUse;

      const itemProductSubtotal = productPrice * qty;
      productSubtotal += itemProductSubtotal;

      // Track member savings
      const itemMemberSavings = memberPricing.memberSavings * qty;
      totalMemberSavings += itemMemberSavings;

      // Store member pricing info in item object for later insertion
      item._memberPricing = memberPricing;
      item._calculatedPrice = productPrice;

      // Calculate item discount
      const discountAmount = parseFloat(item.discount_amount) || 0;
      if (item.discount_type === "percentage") {
        totalItemDiscounts += (itemProductSubtotal * discountAmount) / 100;
      } else {
        totalItemDiscounts += discountAmount;
      }

      // Sum add-ons
      if (Array.isArray(item.addOns) && item.addOns.length > 0) {
        for (const addon of item.addOns) {
          totalAddOnsPrice += parseFloat(addon.subtotal) || 0;
        }
      }
    }

    const subtotalWithAddOns = productSubtotal + totalAddOnsPrice;

    // Calculate global discount
    const discountGlobalNum = parseFloat(discount_global) || 0;
    let globalDiscountAmount = 0;
    if (discount_global_type === "percentage") {
      globalDiscountAmount = (productSubtotal * discountGlobalNum) / 100;
    } else {
      globalDiscountAmount = discountGlobalNum;
    }

    // Step 3.5: Calculate promo discount
    const promoInfo = await calculatePromoDiscount(
      client,
      promo_id,
      productSubtotal,
    );
    const promoAmount = promoInfo ? promoInfo.promoAmount : 0;

    // Calculate final total with promo
    const total = Math.max(
      0,
      subtotalWithAddOns -
        totalItemDiscounts -
        globalDiscountAmount -
        promoAmount,
    );

    if (amountPaidValue < total) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Jumlah pembayaran tidak mencukupi. Total: ${total}`,
        400,
      );
    }

    const changeAmount = amountPaidValue - total;

    // Step 4: Create transaction WITH MEMBER PRICING AND PROMO
    const transactionResult = await client.query(
      `INSERT INTO transactions (
        transaction_number,
        customer_id, cashier_id, subtotal, discount_items,
        discount_global, discount_global_type, total,
        payment_method, payment_method_id, payment_details,
        amount_paid, change_amount, notes, status, shift_id, completed_at,
        total_member_savings, customer_is_member,
        promo_id, promo_name, promo_discount_type, promo_discount_value, promo_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        transactionNumber,
        customer_id || null,
        cashierId,
        subtotalWithAddOns.toFixed(2),
        totalItemDiscounts.toFixed(2),
        globalDiscountAmount.toFixed(2),
        discount_global_type,
        total.toFixed(2),
        payment_method,
        resolvedPaymentMethodId,
        payment_details ? JSON.stringify(payment_details) : null,
        amountPaidValue.toFixed(2),
        changeAmount.toFixed(2),
        notes || null,
        "paid",
        shiftId,
        totalMemberSavings.toFixed(2),
        customerIsMember,
        promoInfo ? promoInfo.promoId : null,
        promoInfo ? promoInfo.promoName : null,
        promoInfo ? promoInfo.promoDiscountType : null,
        promoInfo ? promoInfo.promoDiscountValue : null,
        promoAmount.toFixed(2),
      ],
    );

    const transactionId = transactionResult.rows[0].id;
    console.log("[checkout] Created transaction:", transactionId);

    // Step 5: Insert items with member pricing and add-ons
    for (const item of items) {
      const memberPricing = item._memberPricing;
      const productPrice = item._calculatedPrice;
      const qty = parseInt(item.quantity);

      const itemSubtotal = productPrice * qty;
      const itemMemberSavings = memberPricing.memberSavings * qty;

      let itemDiscountAmount = 0;
      if (item.discount_type === "percentage") {
        itemDiscountAmount =
          (itemSubtotal * parseFloat(item.discount_amount)) / 100;
      } else {
        itemDiscountAmount = parseFloat(item.discount_amount) || 0;
      }
      const itemTotal = itemSubtotal - itemDiscountAmount;

      const itemResult = await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_price, quantity,
          discount_amount, discount_type, subtotal, total, notes,
          original_price, member_price, is_member_price, member_savings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          transactionId,
          item.product_id,
          item.product_name,
          productPrice,
          qty,
          itemDiscountAmount,
          item.discount_type || "amount",
          itemSubtotal,
          itemTotal,
          item.notes || null,
          memberPricing.originalPrice,
          memberPricing.memberPrice,
          memberPricing.isMemberPrice,
          itemMemberSavings.toFixed(2),
        ],
      );

      const itemId = itemResult.rows[0].id;

      // Insert add-ons for this item
      if (Array.isArray(item.addOns) && item.addOns.length > 0) {
        for (const addon of item.addOns) {
          await client.query(
            `INSERT INTO transaction_item_add_ons (transaction_item_id, add_on_id, quantity, price, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              itemId,
              addon.addOnId,
              addon.quantity || 1,
              addon.price || 0,
              addon.subtotal || 0,
            ],
          );
        }
      }

      // Stock tracking disabled - using simple availability flag instead
    }

    // Step 6: Update customer stats if customer is set
    if (customer_id) {
      await client.query(
        `UPDATE customers
         SET total_spending = total_spending + $1,
             total_transactions = total_transactions + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [total, customer_id],
      );
    }

    await client.query("COMMIT");

    // Step 6.5: Masukkan ke antrian barista
    // Jika checkout berasal dari hold order (held_order_id dikirim frontend),
    // update entry yang sudah ada (preserve FIFO ordered_at).
    // Jika checkout langsung (bukan dari hold), insert baru.
    try {
      const held_order_id = req.body.held_order_id
      let customerNameForQueue = 'Tanpa Nama'
      if (customer_id) {
        const custRes = await pool.query('SELECT name FROM customers WHERE id = $1', [customer_id])
        if (custRes.rows.length > 0) customerNameForQueue = custRes.rows[0].name
      }
      if (held_order_id) {
        const updated = await updateHoldToPaid(pool, held_order_id, transactionId, transactionNumber)
        if (!updated) {
          // Hold entry not found, insert as paid (edge case)
          await enqueuePaidOrder(pool, transactionId, transactionNumber, customerNameForQueue, items)
        }
      } else {
        await enqueuePaidOrder(pool, transactionId, transactionNumber, customerNameForQueue, items)
      }
    } catch (queueErr) {
      console.error('[checkout] Failed to update queue:', queueErr)
    }

    // Step 7: Fetch complete transaction with items and add-ons
    const completeTransaction = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON true
       WHERE t.id = $1
       GROUP BY t.id, c.name, c.phone_number, u.full_name`,
      [transactionId],
    );

    console.log("[checkout] Checkout completed successfully:", transactionId);
    res.json(successResponse(completeTransaction.rows[0], "Checkout berhasil"));
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Get reports grouped by shift
 * GET /api/v1/transactions/reports/by-shift
 * Cashiers see only their shifts, admins see all shifts
 */
export const getReportsByShift = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { start_date, end_date, shift_id } = req.query;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    // Build query with role-based filtering
    let query = `
      SELECT
        s.id as shift_id,
        s.cashier_id,
        u.full_name as cashier_name,
        s.modal_awal,
        s.opened_at,
        s.closed_at,
        s.status,
        COUNT(t.id) as transaction_count,
        COALESCE(
          (SELECT SUM(ti.quantity)
           FROM transaction_items ti
           JOIN transactions t2 ON ti.transaction_id = t2.id
           WHERE t2.shift_id = s.id AND t2.status IN ('paid', 'completed')
          ), 0
        )::int as total_items,
        COALESCE(SUM(CASE WHEN t.status IN ('paid', 'completed') THEN t.total ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN t.status IN ('paid', 'completed') THEN COALESCE(t.discount_items, 0) + COALESCE(t.discount_global, 0) ELSE 0 END), 0) as total_discount,
        COALESCE(
          (SELECT SUM(COALESCE(jumlah, 0)) FROM shift_expenses WHERE shift_id = s.id),
          0
        ) as total_expenses,
        COALESCE(SUM(CASE WHEN t.status IN ('paid', 'completed') THEN t.total ELSE 0 END), 0) -
        COALESCE(
          (SELECT SUM(ti.quantity * COALESCE(p.hpp, 0))
           FROM transaction_items ti
           LEFT JOIN products p ON ti.product_id = p.id
           JOIN transactions t2 ON ti.transaction_id = t2.id
           WHERE t2.shift_id = s.id AND t2.status IN ('paid', 'completed')
          ), 0
        ) as total_netto
      FROM shifts s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN transactions t ON s.id = t.shift_id AND t.status IN ('paid', 'completed')
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Role-based filtering - cashiers see only their own shifts
    if (userRole === "kasir") {
      query += ` AND s.cashier_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    // Shift filter
    if (shift_id) {
      query += ` AND s.id = $${paramIndex}`;
      params.push(shift_id);
      paramIndex++;
    }

    // Date filtering
    if (start_date) {
      query += ` AND DATE(s.opened_at) >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND DATE(s.opened_at) <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    query += `
      GROUP BY s.id, s.cashier_id, u.full_name, s.modal_awal, s.opened_at, s.closed_at, s.status
      ORDER BY s.opened_at DESC
    `;

    const result = await pool.query(query, params);

    res.json(
      successResponse(
        result.rows,
        "Laporan berdasarkan shift berhasil diambil",
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/transactions/stats/top-products
 * Top selling products for a given shift or date (today by default)
 */
export const getTopProducts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { shift_id, limit = 5 } = req.query as any
    const userId = req.user?.id
    const userRole = req.user?.role

    if (!userId) throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401)

    let shiftFilter = ''
    const params: any[] = []
    let paramIndex = 1

    if (shift_id) {
      shiftFilter = `AND t.shift_id = $${paramIndex++}`
      params.push(shift_id)
    } else {
      shiftFilter = `AND DATE(t.completed_at) = CURRENT_DATE`
    }

    // Kasir only sees their own shifts
    if (userRole === 'kasir') {
      shiftFilter += ` AND t.cashier_id = $${paramIndex++}`
      params.push(userId)
    }

    params.push(parseInt(limit))

    const result = await pool.query(
      `SELECT
        ti.product_id,
        ti.product_name,
        SUM(ti.quantity)::int AS total_qty,
        SUM(ti.total) AS total_revenue
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE t.status IN ('paid', 'completed')
      ${shiftFilter}
      GROUP BY ti.product_id, ti.product_name
      ORDER BY total_qty DESC
      LIMIT $${paramIndex}`,
      params,
    )

    res.json(successResponse(result.rows, "Top produk berhasil diambil"))
  } catch (error) {
    next(error)
  }
}

/**
 * Update transaction in active shift only
 * PUT /api/v1/transactions/:id
 * Kasir can edit their own completed transactions only if shift is still active
 */
export const updateTransaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    const { items, discount, payment_method, notes } = req.body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Minimal harus ada 1 item", 400);
    }

    await client.query("BEGIN");

    // Get transaction with shift info
    const transactionResult = await client.query(
      `SELECT t.*, s.status as shift_status, s.cashier_id
       FROM transactions t
       LEFT JOIN shifts s ON t.shift_id = s.id
       WHERE t.id = $1`,
      [id],
    );

    if (transactionResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Transaksi tidak ditemukan", 404);
    }

    const transaction = transactionResult.rows[0];

    // Check: Shift must be ACTIVE
    if (transaction.shift_status !== "active") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Shift sudah ditutup. Tidak dapat mengedit transaksi.",
        400,
      );
    }

    // Check: Kasir can only edit their own shift's transactions
    if (userRole === "kasir" && transaction.cashier_id !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Hanya dapat mengedit transaksi shift sendiri",
        403,
      );
    }

    // Validate items
    for (const item of items) {
      if (!item.product_id) {
        throw new AppError("VALIDATION_ERROR", "Product ID harus diisi", 400);
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Quantity harus lebih dari 0",
          400,
        );
      }
      if (!item.price || item.price <= 0) {
        throw new AppError("VALIDATION_ERROR", "Harga harus lebih dari 0", 400);
      }
    }

    // Delete existing items and add-ons
    await client.query(
      "DELETE FROM transaction_item_add_ons WHERE transaction_item_id IN (SELECT id FROM transaction_items WHERE transaction_id = $1)",
      [id],
    );

    await client.query(
      "DELETE FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    // Insert new items
    for (const item of items) {
      const itemSubtotal = item.price * item.quantity;

      let itemDiscountAmount = 0;
      if (item.discount) {
        if (item.discount.type === "percentage") {
          itemDiscountAmount = (itemSubtotal * item.discount.value) / 100;
        } else {
          itemDiscountAmount = item.discount.value;
        }
      }

      const itemTotal = itemSubtotal - itemDiscountAmount;

      const itemResult = await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_price,
          quantity, discount_amount, discount_type, subtotal, total, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          id,
          item.product_id,
          item.product_name || "Unknown",
          item.price,
          item.quantity,
          item.discount?.value || 0,
          item.discount?.type || "nominal",
          itemSubtotal,
          itemTotal,
          item.notes || null,
        ],
      );

      const itemId = itemResult.rows[0].id;

      // Insert add-ons if provided
      if (item.add_ons && Array.isArray(item.add_ons)) {
        for (const addOn of item.add_ons) {
          const addOnSubtotal = addOn.price * addOn.quantity;

          await client.query(
            `INSERT INTO transaction_item_add_ons (
              transaction_item_id, add_on_id, quantity, price, subtotal
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              itemId,
              addOn.add_on_id,
              addOn.quantity,
              addOn.price,
              addOnSubtotal,
            ],
          );
        }
      }
    }

    // Calculate new totals
    const itemsResult = await client.query(
      "SELECT * FROM transaction_items WHERE transaction_id = $1",
      [id],
    );

    const totals = calculateTransactionTotals(
      itemsResult.rows,
      discount?.value || 0,
      discount?.type || "nominal",
    );

    // Update transaction
    await client.query(
      `UPDATE transactions
       SET subtotal = $1,
           discount_items = $2,
           discount_global = $3,
           discount_global_type = $4,
           total = $5,
           payment_method = COALESCE($6, payment_method),
           notes = COALESCE($7, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [
        totals.subtotal,
        totals.discountItems,
        totals.discountGlobal,
        discount?.type || "nominal",
        totals.total,
        payment_method || null,
        notes || null,
        id,
      ],
    );

    await client.query("COMMIT");

    // Fetch complete updated transaction with all details
    const completeTransactionResult = await pool.query(
      `SELECT
        t.*,
        c.name as customer_name,
        c.phone_number as customer_phone,
        u.full_name as cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', items_data.id,
              'product_id', items_data.product_id,
              'product_name', items_data.product_name,
              'product_price', items_data.product_price,
              'quantity', items_data.quantity,
              'discount_amount', items_data.discount_amount,
              'discount_type', items_data.discount_type,
              'subtotal', items_data.subtotal,
              'total', items_data.total,
              'notes', items_data.notes,
              'addOns', items_data.add_ons
            )
            ORDER BY items_data.created_at
          ) FILTER (WHERE items_data.id IS NOT NULL),
          '[]'
        ) as items
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.cashier_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           ti.id,
           ti.product_id,
           ti.product_name,
           ti.product_price,
           ti.quantity,
           ti.discount_amount,
           ti.discount_type,
           ti.subtotal,
           ti.total,
           ti.notes,
           ti.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', tia.id,
                 'addOnId', tia.add_on_id,
                 'addOnName', ao.name,
                 'quantity', tia.quantity,
                 'price', tia.price,
                 'subtotal', tia.subtotal
               )
               ORDER BY tia.created_at
             ) FILTER (WHERE tia.id IS NOT NULL),
             '[]'
           ) as add_ons
         FROM transaction_items ti
         LEFT JOIN transaction_item_add_ons tia ON ti.id = tia.transaction_item_id
         LEFT JOIN add_ons ao ON tia.add_on_id = ao.id
         WHERE ti.transaction_id = t.id
         GROUP BY ti.id
       ) items_data ON items_data.id IS NOT NULL
       WHERE t.id = $1
       GROUP BY t.id, c.id, u.id`,
      [id],
    );

    if (completeTransactionResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Transaksi tidak ditemukan", 404);
    }

    res.json(
      successResponse(
        completeTransactionResult.rows[0],
        "Transaksi berhasil diupdate",
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
