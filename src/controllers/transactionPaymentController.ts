import { Response, NextFunction } from "express";
import crypto from "crypto";
import { pool } from "../config/database";
import { successResponse } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../middleware/auth";
import type { SplitBillPaymentRequest, TransactionPayment } from "../types";

/**
 * Record a payment for split bill transaction
 * POST /api/v1/transactions/:id/payments
 */
export const recordSplitBillPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id: transactionId } = req.params;
    const { payment_method, payment_method_id, paid_items } =
      req.body as SplitBillPaymentRequest;
    // const normalizedPaymentMethod = String(payment_method || '').toLowerCase()

    // Validate required fields
    if (
      !transactionId ||
      !payment_method ||
      !paid_items ||
      paid_items.length === 0
    ) {
      throw new AppError(
        "INVALID_REQUEST",
        "Missing required fields: payment_method and paid_items",
        400,
      );
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        // 1. Get transaction
        const txnResult = await client.query(
          "SELECT id, total, status, version_number FROM transactions WHERE id = $1",
          [transactionId],
        );

        if (txnResult.rows.length === 0) {
          throw new AppError(
            "TRANSACTION_NOT_FOUND",
            "Transaction not found",
            404,
          );
        }

        const txn = txnResult.rows[0];
        const txnTotal = Number(txn.total);

        if (txn.status === "cancelled") {
          throw new AppError(
            "INVALID_STATUS",
            "Cannot pay for cancelled transaction",
            400,
          );
        }

        if (txn.status === "paid") {
          throw new AppError(
            "ALREADY_PAID",
            "Transaction already fully paid",
            400,
          );
        }

        // 2. Validate and fetch paid items - CALCULATE AMOUNT FROM ITEMS
        let calculatedPaymentAmount = 0;
        const validatedItems = [];

        for (const item of paid_items) {
          const itemCheck = await client.query(
            "SELECT id, subtotal, total, quantity, payment_status FROM transaction_items WHERE id = $1 AND transaction_id = $2",
            [item.item_id, transactionId],
          );

          if (itemCheck.rows.length === 0) {
            throw new AppError(
              "ITEM_NOT_FOUND",
              `Item ${item.item_id} not found in transaction`,
              404,
            );
          }

          const dbItem = itemCheck.rows[0];

          // Validate item is not already paid
          if (dbItem.payment_status === "paid") {
            throw new AppError(
              "ITEM_ALREADY_PAID",
              `Item ${item.item_id} is already paid`,
              400,
            );
          }

          // Validate price hasn't changed — compare against total (base + addons - discount)
          // held orders store total = base + addons, subtotal = base only
          const expectedAmount = Number(dbItem.total)
          if (Math.round(item.item_subtotal) !== Math.round(expectedAmount)) {
            throw new AppError(
              "PRICE_CHANGED",
              `Item ${item.item_id} price has changed. Cannot pay. Original: ${dbItem.total}, Provided: ${item.item_subtotal}`,
              400,
            );
          }

          // Validate quantity
          if (item.quantity !== Number(dbItem.quantity)) {
            throw new AppError(
              "QUANTITY_MISMATCH",
              `Item ${item.item_id} quantity mismatch. DB: ${dbItem.quantity}, Provided: ${item.quantity}`,
              400,
            );
          }

          // Add to calculated payment
          calculatedPaymentAmount += item.item_subtotal;
          validatedItems.push({
            item_id: item.item_id,
            item_subtotal: item.item_subtotal,
            quantity: item.quantity,
          });
        }

        // Validate calculated amount
        if (calculatedPaymentAmount <= 0) {
          throw new AppError(
            "INVALID_AMOUNT",
            "Calculated payment amount must be greater than 0",
            400,
          );
        }

        // 3. Calculate total paid so far
        const paidResult = await client.query(
          "SELECT COALESCE(SUM(amount_paid), 0) as total_paid FROM transaction_payments WHERE transaction_id = $1",
          [transactionId],
        );
        const totalPaidSoFar = Number(paidResult.rows[0].total_paid);
        const newTotalPaid = totalPaidSoFar + calculatedPaymentAmount;

        // Validate calculated amount doesn't exceed remaining
        const remaining = txnTotal - totalPaidSoFar;
        if (calculatedPaymentAmount > remaining) {
          throw new AppError(
            "INVALID_AMOUNT",
            `Payment amount (${calculatedPaymentAmount}) exceeds remaining balance (${remaining})`,
            400,
          );
        }

        // 4. Insert payment record - use CALCULATED amount, not request amount
        const paymentId = crypto.randomUUID();
        const now = new Date();

        await client.query(
          `INSERT INTO transaction_payments 
         (id, transaction_id, amount_paid, payment_method, payment_method_id, paid_items_json, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            paymentId,
            transactionId,
            String(calculatedPaymentAmount),
            payment_method,
            payment_method_id || null,
            JSON.stringify(validatedItems),
            now,
            now,
          ],
        );

        // 5. Lock paid items with timestamp
        for (const item of validatedItems) {
          await client.query(
            `UPDATE transaction_items 
           SET payment_status = $1, locked_at = $2, locked_by_payment_id = $3
           WHERE id = $4`,
            ["paid", now, paymentId, item.item_id],
          );
        }

        // 6. Update transaction status - determine based on new total
        let newStatus = "open";
        if (newTotalPaid >= txnTotal) {
          newStatus = "paid";
        }
        console.log(newStatus);
        console.log(newTotalPaid);
        console.log(txnTotal);
        const newRemaining = txnTotal - newTotalPaid;

        // Update paid_amount in transactions table
        await client.query(
          `UPDATE transactions 
         SET status = $1, amount_paid = $2, remaining_amount = $3, version_number = version_number + 1, updated_at = $4
         WHERE id = $5`,
          [
            newStatus,
            String(newTotalPaid),
            String(newRemaining),
            now,
            transactionId,
          ],
        );

        await client.query("COMMIT");

        const payment: TransactionPayment = {
          id: paymentId,
          transaction_id: transactionId,
          amount_paid: calculatedPaymentAmount,
          payment_method,
          paid_items_json: validatedItems,
          created_at: now,
          updated_at: now,
        };

        res.status(201).json(
          successResponse(
            {
              payment,
              transaction_status: newStatus,
              remaining_amount: newRemaining,
              total_paid: newTotalPaid,
            },
            "Payment recorded successfully",
          ),
        );
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment history for a transaction
 */
export const getTransactionPayments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id: transactionId } = req.params;

    const result = await pool.query(
      "SELECT id, transaction_id, amount_paid, payment_method, paid_items_json, created_at, updated_at FROM transaction_payments WHERE transaction_id = $1 ORDER BY created_at ASC",
      [transactionId],
    );

    const payments: TransactionPayment[] = result.rows.map((row) => ({
      id: row.id,
      transaction_id: row.transaction_id,
      amount_paid: row.amount_paid,
      payment_method: row.payment_method,
      paid_items_json: row.paid_items_json,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.json(
      successResponse(
        { payments, count: payments.length },
        "Payment history retrieved",
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get total paid amount
 */
export const getTransactionTotalPaid = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id: transactionId } = req.params;

    const result = await pool.query(
      "SELECT COALESCE(SUM(amount_paid), 0) as total_paid, COUNT(*) as payment_count FROM transaction_payments WHERE transaction_id = $1",
      [transactionId],
    );

    const row = result.rows[0];
    res.json(
      successResponse(
        {
          total_paid: Number(row.total_paid),
          payment_count: Number(row.payment_count),
        },
        "Total paid retrieved",
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Refund a payment
 */
export const refundPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { transactionId, paymentId } = req.params;
    const { reason } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const paymentResult = await client.query(
        "SELECT * FROM transaction_payments WHERE id = $1 AND transaction_id = $2",
        [paymentId, transactionId],
      );

      if (paymentResult.rows.length === 0) {
        throw new AppError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      }

      const payment = paymentResult.rows[0];
      const refundId = crypto.randomUUID();
      const now = new Date();
      const refundAmount = Number(payment.amount_paid);

      await client.query(
        "INSERT INTO transaction_payments (id, transaction_id, amount_paid, payment_method, paid_items_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          refundId,
          transactionId,
          String(-refundAmount),
          `${payment.payment_method}_refund`,
          JSON.stringify({ original_payment_id: paymentId, reason }),
          now,
          now,
        ],
      );

      const paidItems = payment.paid_items_json;
      for (const item of paidItems) {
        await client.query(
          "UPDATE transaction_items SET payment_status = $1 WHERE id = $2",
          ["unpaid", item.item_id],
        );
      }

      const totalPaidResult = await client.query(
        "SELECT COALESCE(SUM(amount_paid), 0) as total_paid FROM transaction_payments WHERE transaction_id = $1",
        [transactionId],
      );
      const totalPaid = Number(totalPaidResult.rows[0].total_paid);

      const txnResult = await client.query(
        "SELECT total FROM transactions WHERE id = $1",
        [transactionId],
      );
      const txnTotal = Number(txnResult.rows[0].total);

      let newStatus = "open";
      if (totalPaid > 0 && totalPaid < txnTotal) {
        newStatus = "partial_paid";
      } else if (totalPaid >= txnTotal) {
        newStatus = "paid";
      }

      const newRemaining = txnTotal - totalPaid;

      await client.query(
        "UPDATE transactions SET status = $1, remaining_amount = $2, version_number = version_number + 1 WHERE id = $3",
        [newStatus, String(newRemaining), transactionId],
      );

      await client.query("COMMIT");

      res.json(
        successResponse(
          {
            refund_id: refundId,
            original_payment_id: paymentId,
            refund_amount: refundAmount,
            transaction_status: newStatus,
            remaining_amount: newRemaining,
          },
          "Payment refunded",
        ),
      );
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};
