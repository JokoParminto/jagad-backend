import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { successResponse } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { isCustomerMember } from "../utils/transactionHelpers";
import { enqueueHoldOrder, dequeueByRefId, syncHoldOrderQueue } from "./queueController";
export const heldOrderController = {
  /**
   * Create a held order (transaction with status='open')
   * POST /api/v1/held-orders
   * Now redirects to create a regular transaction with status='open'
   */
  async createHeldOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        customer_id,
        subtotal,
        discount_items,
        discount_global,
        discount_global_type,
        total,
        items,
      } = req.body;

      // Validate required fields
      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError("VALIDATION_ERROR", "Items cannot be empty", 400);
      }

      const cashierId = (req as any).user?.id;
      if (!cashierId) {
        throw new AppError("AUTH_ERROR", "Cashier ID not found", 401);
      }

      // Start transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let shiftId = null;

        if (cashierId) {
          const shiftResult = await client.query(
            `SELECT id FROM shifts
              WHERE cashier_id = $1
              AND status = 'active'`,
            [cashierId],
          );

          console.log(shiftResult);

          shiftId = shiftResult.rows.length > 0 ? shiftResult.rows[0].id : null;
        }

        let customerIsMember = false;
        if (customer_id) {
          customerIsMember = await isCustomerMember(client, customer_id);
        }

        // ✅ Generate transaction number
        const transaction_number = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        // ✅ Create transaction with status='open' (not temporary!)
        const transactionResult = await client.query(
          `INSERT INTO transactions
           (transaction_number, customer_id, cashier_id, customer_is_member, subtotal, discount_items, discount_global, discount_global_type, total, amount_paid, remaining_amount, status, shift_id, payment_method)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            transaction_number,
            customer_id || null,
            cashierId,
            customerIsMember,
            subtotal,
            discount_items || 0,
            discount_global || 0,
            discount_global_type || "amount",
            total,
            0, // amount_paid = 0 (not paid yet)
            total, // remaining_amount = total (full amount remaining)
            "open", // ✅ status = 'open' (held order)
            shiftId,
            "Cash",
          ],
        );

        const transactionId = transactionResult.rows[0].id;

        // Add items
        const itemsData = [];
        for (const item of items) {
          if (item.total === undefined || item.total === null) {
            throw new AppError(
              "VALIDATION_ERROR",
              `Item ${item.product_name}: total is required`,
              400,
            );
          }
          const itemResult = await client.query(
            `INSERT INTO transaction_items
             (transaction_id, product_id, product_name, quantity, product_price, original_price, member_price, is_member_price, member_savings, discount_amount, discount_type, subtotal, total, payment_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [
              transactionId,
              item.product_id || null,
              item.product_name,
              item.quantity,
              item.product_price, // The actual price to charge
              item.original_price, // Regular/base price
              item.member_price || null, // Member price if available
              item.is_member_price || false, // If member price is being used
              item.member_savings ?? item.member_saving ?? 0, // Savings from member pricing
              item.discount_amount || 0,
              item.discount_type || "amount",
              item.subtotal,
              item.total, // total from payload (required)
              "unpaid", // payment_status = 'unpaid' initially
            ],
          );
          const itemData = itemResult.rows[0];
          itemsData.push(itemData);

          // Add add-ons if provided
          if (Array.isArray(item.addOns) && item.addOns.length > 0) {
            for (const addOn of item.addOns) {
              await client.query(
                `INSERT INTO transaction_item_add_ons
                 (transaction_item_id, add_on_id, quantity, price, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                  itemData.id,
                  addOn.addOnId,
                  addOn.quantity || 1,
                  addOn.price || 0,
                  addOn.subtotal || 0,
                ],
              );
            }
          }
        }

        await client.query("COMMIT");

        // Masukkan ke antrian barista setelah transaksi berhasil
        const txRow = transactionResult.rows[0]
        let customerName = 'Tanpa Nama'
        if (customer_id) {
          const custResult = await pool.query(
            'SELECT name FROM customers WHERE id = $1', [customer_id]
          )
          if (custResult.rows.length > 0) customerName = custResult.rows[0].name
        }
        try {
          await enqueueHoldOrder(
            pool,
            txRow.id,
            txRow.transaction_number,
            customerName,
            items,
          )
        } catch (queueErr) {
          console.error('[createHeldOrder] Failed to enqueue:', queueErr)
        }

        const response = {
          ...txRow,
          items: itemsData,
        };

        res.json(successResponse(response, "Held order created successfully"));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all held orders (transactions with status='open')
   * GET /api/v1/held-orders
   */
  async getHeldOrders(_req: Request, res: Response, next: NextFunction) {
    try {
      // ✅ Get transactions with status='open' only
      const result = await pool.query(
        `SELECT t.id,
                t.transaction_number,
                t.customer_id,
                t.customer_is_member,
                t.subtotal,
                t.discount_items,
                t.discount_global,
                t.discount_global_type,
                t.total,
                t.amount_paid,
                t.remaining_amount,
                t.status,
                t.created_at,
                t.updated_at,
                c.name AS customer_name,
                json_agg(
                  json_build_object(
                    'id', ti.id,
                    'product_id', ti.product_id,
                    'product_name', ti.product_name,
                    'product_price', ti.product_price,
                    'original_price', ti.original_price,
                    'member_price', ti.member_price,
                    'is_member_price', ti.is_member_price,
                    'quantity', ti.quantity,
                    'notes', ti.notes,
                    'discount_amount', ti.discount_amount,
                    'discount_type', ti.discount_type,
                    'subtotal', ti.subtotal,
                    'total', ti.total,
                    'payment_status', ti.payment_status
                  ) ORDER BY ti.created_at
                ) FILTER (WHERE ti.id IS NOT NULL) AS items
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
         WHERE t.status = 'open'
         GROUP BY t.id, t.transaction_number, t.customer_id, t.customer_is_member, t.subtotal, t.discount_items, t.discount_global,
                  t.discount_global_type, t.total, t.amount_paid, t.remaining_amount, t.status,
                  t.created_at, t.updated_at, c.name
         ORDER BY t.created_at DESC`,
      );

      // Get add-ons separately for each item
      const heldOrdersWithAddOns = await Promise.all(
        result.rows.map(async (row: any) => {
          const items = row.items.filter((item: any) => item.id !== null);

          // Get add-ons for each item
          const itemsWithAddOns = await Promise.all(
            items.map(async (item: any) => {
              const addOnsResult = await pool.query(
                `SELECT tioa.id, tioa.add_on_id, ao.name as add_on_name, tioa.quantity, tioa.price, tioa.subtotal
                 FROM transaction_item_add_ons tioa
                 LEFT JOIN add_ons ao ON tioa.add_on_id = ao.id
                 WHERE tioa.transaction_item_id = $1
                 ORDER BY tioa.created_at`,
                [item.id],
              );
              return {
                ...item,
                addOns: addOnsResult.rows.map((addOn: any) => ({
                  id: addOn.id,
                  addOnId: addOn.add_on_id,
                  addOnName: addOn.add_on_name,
                  quantity: addOn.quantity,
                  price: parseFloat(addOn.price),
                  subtotal: parseFloat(addOn.subtotal),
                })),
              };
            }),
          );

          return {
            ...row,
            items: itemsWithAddOns,
          };
        }),
      );

      res.json(
        successResponse(
          { data: heldOrdersWithAddOns },
          "Held orders fetched successfully",
        ),
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get held order detail (transaction with status='open')
   * GET /api/v1/held-orders/:id
   */
  async getHeldOrderDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT t.id,
                t.transaction_number,
                t.customer_id,
                t.customer_is_member,
                t.subtotal,
                t.discount_items,
                t.discount_global,
                t.discount_global_type,
                t.total,
                t.amount_paid,
                t.remaining_amount,
                t.status,
                t.created_at,
                t.updated_at,
                c.name AS customer_name,
                json_agg(
                  json_build_object(
                    'id', ti.id,
                    'product_id', ti.product_id,
                    'product_name', ti.product_name,
                    'product_price', ti.product_price,
                    'quantity', ti.quantity,
                    'notes', ti.notes,
                    'discount_amount', ti.discount_amount,
                    'discount_type', ti.discount_type,
                    'subtotal', ti.subtotal,
                    'payment_status', ti.payment_status
                  ) ORDER BY ti.created_at
                ) FILTER (WHERE ti.id IS NOT NULL) AS items
         FROM transactions t
         LEFT JOIN customers c ON t.customer_id = c.id
         LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
         WHERE t.id = $1 AND t.status = 'open'
         GROUP BY t.id, t.transaction_number, t.customer_id, t.customer_is_member, t.subtotal, t.discount_items, t.discount_global,
                  t.discount_global_type, t.total, t.amount_paid, t.remaining_amount, t.status,
                  t.created_at, t.updated_at, c.name`,
        [id],
      );

      if (result.rows.length === 0) {
        throw new AppError("NOT_FOUND", "Held order not found", 404);
      }

      // Get items with add-ons
      const row = result.rows[0];
      const items = row.items.filter((item: any) => item.id !== null);

      const itemsWithAddOns = await Promise.all(
        items.map(async (item: any) => {
          const addOnsResult = await pool.query(
            `SELECT tioa.id, tioa.add_on_id, ao.name as add_on_name, tioa.quantity, tioa.price, tioa.subtotal
             FROM transaction_item_add_ons tioa
             LEFT JOIN add_ons ao ON tioa.add_on_id = ao.id
             WHERE tioa.transaction_item_id = $1
             ORDER BY tioa.created_at`,
            [item.id],
          );
          return {
            ...item,
            addOns: addOnsResult.rows.map((addOn: any) => ({
              id: addOn.id,
              addOnId: addOn.add_on_id,
              addOnName: addOn.add_on_name,
              quantity: addOn.quantity,
              price: parseFloat(addOn.price),
              subtotal: parseFloat(addOn.subtotal),
            })),
          };
        }),
      );

      const heldOrder = {
        ...row,
        items: itemsWithAddOns,
      };

      res.json(successResponse(heldOrder, "Held order detail fetched"));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete held order (cancel) - sets status to 'cancelled'
   * DELETE /api/v1/held-orders/:id
   */
  async deleteHeldOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Check if held order exists and is in 'open' status
      const checkResult = await pool.query(
        "SELECT id FROM transactions WHERE id = $1 AND status = $2",
        [id, "open"],
      );

      if (checkResult.rows.length === 0) {
        throw new AppError(
          "NOT_FOUND",
          "Held order not found or already completed",
          404,
        );
      }

      // Update status to 'cancelled' instead of deleting
      await pool.query(
        "UPDATE transactions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        ["cancelled", id],
      );

      // Hapus dari antrian barista (jika ada)
      try {
        await dequeueByRefId(id)
      } catch (queueErr) {
        console.error('[deleteHeldOrder] Failed to dequeue:', queueErr)
      }

      res.json(successResponse(null, "Held order cancelled successfully"));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update held order (modify items, discount, etc)
   * PUT /api/v1/held-orders/:id
   */
  async updateHeldOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        customer_id,
        subtotal,
        discount_items,
        discount_global,
        discount_global_type,
        total,
        version,
        items,
      } = req.body;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Update main transaction (only if not partially paid)
        const txnCheck = await client.query(
          "SELECT status, updated_at FROM transactions WHERE id = $1",
          [id],
        );

        if (txnCheck.rows.length === 0) {
          throw new AppError("NOT_FOUND", "Held order not found", 404);
        }

        if (txnCheck.rows[0].status !== "open") {
          throw new AppError(
            "INVALID_STATUS",
            "Cannot update held order that has been partially paid",
            400,
          );
        }

        // Optimistic locking: reject if another session modified the order
        if (version) {
          const dbUpdatedAt = new Date(txnCheck.rows[0].updated_at).getTime();
          const clientVersion = new Date(version).getTime();
          // Only reject if clientVersion is a valid date AND timestamps differ
          if (!isNaN(clientVersion) && dbUpdatedAt !== clientVersion) {
            throw new AppError(
              "CONFLICT",
              "Order ini sudah diubah oleh kasir lain. Silakan muat ulang.",
              409,
            );
          }
        }

        let customerIsMember = false;
        if (customer_id) {
          const customerResult = await client.query(
            "SELECT is_member FROM customers WHERE id = $1",
            [customer_id],
          );
          if (customerResult.rows.length > 0) {
            customerIsMember = Boolean(customerResult.rows[0].is_member);
          }
        }

        await client.query(
          `UPDATE transactions
           SET customer_id = $1, customer_is_member = $2, subtotal = $3, discount_items = $4, discount_global = $5,
               discount_global_type = $6, total = $7, remaining_amount = $7, updated_at = CURRENT_TIMESTAMP
           WHERE id = $8`,
          [
            customer_id || null,
            customerIsMember,
            subtotal,
            discount_items || 0,
            discount_global || 0,
            discount_global_type || "amount",
            total,
            id,
          ],
        );

        // Delete old items and add new ones
        await client.query(
          "DELETE FROM transaction_items WHERE transaction_id = $1",
          [id],
        );

        for (const item of items) {
          if (item.total === undefined || item.total === null) {
            throw new AppError(
              "VALIDATION_ERROR",
              `Item ${item.product_name}: total is required`,
              400,
            );
          }
          const itemResult = await client.query(
            `INSERT INTO transaction_items
             (transaction_id, product_id, product_name, quantity, product_price, original_price, member_price, is_member_price, member_savings, discount_amount, discount_type, subtotal, total, payment_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [
              id,
              item.product_id || null,
              item.product_name,
              item.quantity,
              item.product_price, // The actual price to charge
              item.original_price, // Regular/base price
              item.member_price || null, // Member price if available
              item.is_member_price || false, // If member price is being used
              item.member_savings ?? item.member_saving ?? 0, // Savings from member pricing
              item.discount_amount || 0,
              item.discount_type || "amount",
              item.subtotal,
              item.total, // total from payload (required)
              "unpaid", // payment_status
            ],
          );
          const itemId = itemResult.rows[0].id;

          // Add add-ons if provided
          if (Array.isArray(item.addOns) && item.addOns.length > 0) {
            for (const addOn of item.addOns) {
              await client.query(
                `INSERT INTO transaction_item_add_ons
                 (transaction_item_id, add_on_id, quantity, price, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                  itemId,
                  addOn.addOnId,
                  addOn.quantity || 1,
                  addOn.price || 0,
                  addOn.subtotal || 0,
                ],
              );
            }
          }
        }

        await client.query("COMMIT");

        // Sync antrian barista — merge item statuses (item baru → pending, lama → pertahankan)
        try {
          let customerNameForQueue = 'Tanpa Nama'
          if (customer_id) {
            const custRes = await pool.query('SELECT name FROM customers WHERE id = $1', [customer_id])
            if (custRes.rows.length > 0) customerNameForQueue = custRes.rows[0].name
          }

          // Need transaction_number for queue sync
          const txNumRes = await pool.query('SELECT transaction_number FROM transactions WHERE id = $1', [id])
          const txNumber = txNumRes.rows[0]?.transaction_number || ''

          await syncHoldOrderQueue(pool, id, txNumber, customerNameForQueue, items)
        } catch (queueErr) {
          console.error('[updateHeldOrder] Failed to sync queue:', queueErr)
        }

        // Fetch updated order
        const result = await pool.query(
          `SELECT t.id, t.customer_id, t.customer_is_member, t.subtotal, t.discount_items,
                  t.discount_global, t.discount_global_type, t.total, t.amount_paid, t.remaining_amount, t.status,
                  t.created_at, t.updated_at, c.name AS customer_name,
                  json_agg(
                    json_build_object(
                      'id', ti.id,
                      'product_id', ti.product_id,
                      'product_name', ti.product_name,
                      'product_price', ti.product_price,
                      'quantity', ti.quantity,
                      'discount_amount', ti.discount_amount,
                      'discount_type', ti.discount_type,
                      'subtotal', ti.subtotal,
                      'payment_status', ti.payment_status
                    ) ORDER BY ti.created_at
                  ) FILTER (WHERE ti.id IS NOT NULL) AS items
           FROM transactions t
           LEFT JOIN customers c ON t.customer_id = c.id
           LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
           WHERE t.id = $1
           GROUP BY t.id, t.customer_id, t.customer_is_member, t.subtotal, t.discount_items, t.discount_global, t.discount_global_type,
                    t.total, t.amount_paid, t.remaining_amount, t.status, t.created_at, t.updated_at, c.name`,
          [id],
        );

        // Get items with add-ons
        const row = result.rows[0];
        const itemRows = row.items.filter((item: any) => item.id !== null);

        const itemsWithAddOns = await Promise.all(
          itemRows.map(async (item: any) => {
            const addOnsResult = await pool.query(
              `SELECT tioa.id, tioa.add_on_id, ao.name as add_on_name, tioa.quantity, tioa.price, tioa.subtotal
               FROM transaction_item_add_ons tioa
               LEFT JOIN add_ons ao ON tioa.add_on_id = ao.id
               WHERE tioa.transaction_item_id = $1
               ORDER BY tioa.created_at`,
              [item.id],
            );
            return {
              ...item,
              addOns: addOnsResult.rows.map((addOn: any) => ({
                id: addOn.id,
                addOnId: addOn.add_on_id,
                addOnName: addOn.add_on_name,
                quantity: addOn.quantity,
                price: parseFloat(addOn.price),
                subtotal: parseFloat(addOn.subtotal),
              })),
            };
          }),
        );

        const heldOrder = {
          ...row,
          items: itemsWithAddOns,
        };

        res.json(successResponse(heldOrder, "Held order updated successfully"));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  },
};
