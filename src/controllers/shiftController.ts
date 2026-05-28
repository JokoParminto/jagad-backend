import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { successResponse } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../middleware/auth";

/**
 * Open a new shift
 * POST /api/v1/shifts/open
 */
export const openShift = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cashierId = req.user?.id;
    const { modal_awal } = req.body;

    console.log(
      "[openShift] Opening shift for cashier:",
      cashierId,
      "Modal:",
      modal_awal,
    );

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    if (!modal_awal || modal_awal <= 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Modal awal harus lebih dari 0",
        400,
      );
    }

    const modalAwalValue = parseFloat(modal_awal);
    if (isNaN(modalAwalValue)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Modal awal harus berupa angka",
        400,
      );
    }

    // Check if there's already an active shift for today (using Asia/Jakarta timezone)
    const existingShift = await pool.query(
      `SELECT id FROM shifts
       WHERE cashier_id = $1
       AND status = 'active'
       AND opened_at AT TIME ZONE 'Asia/Jakarta' >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'
       AND opened_at AT TIME ZONE 'Asia/Jakarta' < (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta' + INTERVAL '1 day')`,
      [cashierId],
    );

    if (existingShift.rows.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Sudah ada shift aktif hari ini. Silakan tutup shift yang ada terlebih dahulu.",
        400,
      );
    }

    // Create new shift
    const result = await pool.query(
      `INSERT INTO shifts (cashier_id, modal_awal, status)
       VALUES ($1, $2, 'active')
       RETURNING *`,
      [cashierId, modalAwalValue],
    );

    const shift = result.rows[0];
    console.log("[openShift] Shift opened:", shift.id);

    res.json(successResponse(shift, "Shift berhasil dibuka"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get current active shift
 * GET /api/v1/shifts/current
 */
export const getCurrentShift = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cashierId = req.user?.id;

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    console.log(
      "[getCurrentShift] Fetching current shift for cashier:",
      cashierId,
    );

    // Get active shift for cashier
    const shiftResult = await pool.query(
      `SELECT s.*, u.full_name as cashier_name
       FROM shifts s
       LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.cashier_id = $1
       AND s.status = 'active'
       LIMIT 1`,
      [cashierId],
    );

    console.log(
      "[getCurrentShift] Query result - rows found:",
      shiftResult.rows.length,
    );
    if (shiftResult.rows.length > 0) {
      console.log("[getCurrentShift] Shift found:", {
        id: shiftResult.rows[0].id,
        status: shiftResult.rows[0].status,
        modal_awal: shiftResult.rows[0].modal_awal,
        opened_at: shiftResult.rows[0].opened_at,
      });
    } else {
      console.log("[getCurrentShift] No shift found - checking database...");
      // Debug: check if there are any shifts for this cashier at all (with timezone)
      const debugResult = await pool.query(
        `SELECT id, status, opened_at, opened_at AT TIME ZONE 'Asia/Jakarta' as opened_at_jkt, CURRENT_DATE AT TIME ZONE 'Asia/Jakarta' as today FROM shifts WHERE cashier_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [cashierId],
      );
      console.log(
        "[getCurrentShift] Debug - recent shifts for cashier:",
        debugResult.rows,
      );
    }

    if (shiftResult.rows.length === 0) {
      return res.json(successResponse(null, "Tidak ada shift aktif"));
    }

    const shift = shiftResult.rows[0];
    const shiftId = shift.id;

    // Calculate total penjualan (all transactions regardless of payment method)
    const cashInResult = await pool.query(
      `SELECT
        COUNT(DISTINCT id) as transaction_count,
        COALESCE(SUM(total), 0) as total_cash_in
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid'`,
      [shiftId],
    );

    // Calculate cash out separately
    const cashOutResult = await pool.query(
      `SELECT COALESCE(SUM(jumlah), 0) as total_cash_out
       FROM shift_expenses
       WHERE shift_id = $1`,
      [shiftId],
    );

    const result = {
      rows: [
        {
          ...shift,
          transaction_count: cashInResult.rows[0]?.transaction_count || 0,
          total_cash_in: cashInResult.rows[0]?.total_cash_in || 0,
          total_cash_out: cashOutResult.rows[0]?.total_cash_out || 0,
        },
      ],
    };

    const shiftWithCalculations = result.rows[0];

    // Calculate current income
    const totalCashIn = parseFloat(shiftWithCalculations.total_cash_in) || 0;
    const totalCashOut = parseFloat(shiftWithCalculations.total_cash_out) || 0;
    const modalAwal = parseFloat(shiftWithCalculations.modal_awal) || 0;
    const currentIncome = modalAwal + totalCashIn - totalCashOut;

    const shiftData = {
      ...shiftWithCalculations,
      current_income: currentIncome,
    };

    console.log(
      "[getCurrentShift] Current income:",
      currentIncome,
      "Modal:",
      modalAwal,
      "CashIn:",
      totalCashIn,
      "CashOut:",
      totalCashOut,
    );
    return res.json(successResponse(shiftData, "Shift aktif ditemukan"));
  } catch (error) {
    return next(error);
  }
};

/**
 * Close shift
 * POST /api/v1/shifts/:id/close
 */
export const closeShift = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const {
      actual_cash,
      shopee_food_amount = 0,
      shopee_food_discount_percent = 0,
      shopee_food_discount_nominal = 0,
      shopee_food_net = 0,
    } = req.body;
    const cashierId = req.user?.id;

    console.log(
      "[closeShift] Closing shift:",
      id,
      "Actual cash:",
      actual_cash,
      "Shopee food:",
      {
        amount: shopee_food_amount,
        discount_percent: shopee_food_discount_percent,
        discount_nominal: shopee_food_discount_nominal,
        net: shopee_food_net,
      },
    );

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    if (!actual_cash || actual_cash < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Actual cash harus diisi dan positif",
        400,
      );
    }

    const actualCashValue = parseFloat(actual_cash);
    if (isNaN(actualCashValue)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Actual cash harus berupa angka",
        400,
      );
    }

    // Check if shift exists and belongs to cashier
    const shiftResult = await pool.query(
      "SELECT * FROM shifts WHERE id = $1 AND cashier_id = $2 AND status = $3",
      [id, cashierId, "active"],
    );

    if (shiftResult.rows.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "Shift tidak ditemukan atau sudah ditutup",
        404,
      );
    }

    const shift = shiftResult.rows[0];

    // Get shift summary - calculate totals
    const totalSalesResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid'`,
      [id],
    );

    const cashIncomeResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid' AND LOWER(payment_method) LIKE '%cash%'`,
      [id],
    );

    const qrisIncomeResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid' AND LOWER(payment_method) LIKE '%qris%'`,
      [id],
    );

    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(jumlah), 0) as total
       FROM shift_expenses
       WHERE shift_id = $1`,
      [id],
    );

    const totalSalesIncome = parseFloat(totalSalesResult.rows[0]?.total) || 0;
    const cashIncome = parseFloat(cashIncomeResult.rows[0]?.total) || 0;
    const qrisIncome = parseFloat(qrisIncomeResult.rows[0]?.total) || 0;
    const totalExpenses = parseFloat(expensesResult.rows[0]?.total) || 0;
    const modalAwal = parseFloat(shift.modal_awal) || 0;

    // Pendapatan bersih = penjualan - belanja (tidak termasuk modal awal)
    const netIncome = totalSalesIncome - totalExpenses;

    // Total posisi kas = modal awal + penjualan tunai - belanja
    const expectedCash = modalAwal + cashIncome - totalExpenses;
    const selisih = actualCashValue - expectedCash;

    const shopeeFoodAmount = parseFloat(shopee_food_amount) || 0;
    const shopeeFoodDiscountPercent =
      parseFloat(shopee_food_discount_percent) || 0;
    const shopeeFoodDiscountNominal =
      parseFloat(shopee_food_discount_nominal) || 0;
    const shopeeFoodNet = parseFloat(shopee_food_net) || 0;

    // Update shift
    const result = await pool.query(
      `UPDATE shifts
       SET status = 'closed',
           actual_cash = $1,
           closed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [actualCashValue, id],
    );

    const closedShift = result.rows[0];

    await pool.query(
      `INSERT INTO shift_summaries
       (shift_id, modal_awal, total_sales_income, cash_income, qris_income, total_expenses, total_pos_sales,
        shopee_food_amount, shopee_food_discount_percent, shopee_food_discount_nominal, shopee_food_net,
        actual_cash, expected_cash, selisih, net_income)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (shift_id)
       DO UPDATE SET
        modal_awal = EXCLUDED.modal_awal,
        total_sales_income = EXCLUDED.total_sales_income,
        cash_income = EXCLUDED.cash_income,
        qris_income = EXCLUDED.qris_income,
        total_expenses = EXCLUDED.total_expenses,
        total_pos_sales = EXCLUDED.total_pos_sales,
        shopee_food_amount = EXCLUDED.shopee_food_amount,
        shopee_food_discount_percent = EXCLUDED.shopee_food_discount_percent,
        shopee_food_discount_nominal = EXCLUDED.shopee_food_discount_nominal,
        shopee_food_net = EXCLUDED.shopee_food_net,
        actual_cash = EXCLUDED.actual_cash,
        expected_cash = EXCLUDED.expected_cash,
        selisih = EXCLUDED.selisih,
        net_income = EXCLUDED.net_income`,
      [
        id,
        modalAwal,
        totalSalesIncome,
        cashIncome,
        qrisIncome,
        totalExpenses,
        modalAwal + totalSalesIncome,  // total_pos_sales = modal + penjualan (posisi kas sebelum belanja)
        shopeeFoodAmount,
        shopeeFoodDiscountPercent,
        shopeeFoodDiscountNominal,
        shopeeFoodNet,
        actualCashValue,
        expectedCash,
        selisih,
        netIncome,
      ],
    );

    // Return shift summary
    const summary = {
      shift: closedShift,
      modal_awal: modalAwal,
      total_sales_income: totalSalesIncome,
      cash_income: cashIncome,
      qris_income: qrisIncome,
      total_expenses: totalExpenses,
      pendapatan_shift: netIncome,          // penjualan - belanja
      total_kas: expectedCash,              // modal + cash_income - belanja (expected cash in drawer)
      net_income: netIncome,
      shopee_food_amount: shopeeFoodAmount,
      shopee_food_discount_percent: shopeeFoodDiscountPercent,
      shopee_food_discount_nominal: shopeeFoodDiscountNominal,
      shopee_food_net: shopeeFoodNet,
      expected_cash: expectedCash,
      actual_cash: actualCashValue,
      selisih: selisih,
    };

    console.log(
      "[closeShift] Shift closed:",
      id,
      "Shopee food data:",
      {
        amount: shopee_food_amount,
        discount_percent: shopee_food_discount_percent,
        discount_nominal: shopee_food_discount_nominal,
        net: shopee_food_net,
      },
      "Selisih:",
      selisih,
    );
    res.json(successResponse(summary, "Shift berhasil ditutup"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get shift detail & summary
 * GET /api/v1/shifts/:id/summary
 */
export const getShiftSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    console.log("[getShiftSummary] Getting shift summary:", id);

    // Get shift data
    const { rows } = await pool.query(
      "SELECT * FROM shifts WHERE id = $1 LIMIT 1",
      [id],
    );
    const shift = rows[0] ?? null;

    if (!shift) {
      throw new AppError("NOT_FOUND", "Shift tidak ditemukan", 404);
    }

    const totalSalesResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid'`,
      [id],
    );

    const cashIncomeResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid' AND LOWER(payment_method) LIKE '%cash%'`,
      [id],
    );

    const qrisIncomeResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid' AND LOWER(payment_method) LIKE '%qris%'`,
      [id],
    );

    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(jumlah), 0) as total
       FROM shift_expenses
       WHERE shift_id = $1`,
      [id],
    );

    const modal = parseFloat(shift.modal_awal) || 0;
    const totalSalesIncome = parseFloat(totalSalesResult.rows[0]?.total) || 0;
    const cashIncome = parseFloat(cashIncomeResult.rows[0]?.total) || 0;
    const qrisIncome = parseFloat(qrisIncomeResult.rows[0]?.total) || 0;
    const totalExpenses = parseFloat(expensesResult.rows[0]?.total) || 0;

    // Pendapatan bersih = penjualan - belanja (tidak termasuk modal awal)
    const netIncome = totalSalesIncome - totalExpenses;
    // Total kas yang seharusnya ada = modal + penjualan cash - belanja
    const expectedCash = modal + cashIncome - totalExpenses;

    const summary = {
      shift,
      modal_awal: modal,
      total_sales_income: totalSalesIncome,
      cash_income: cashIncome,
      qris_income: qrisIncome,
      total_expenses: totalExpenses,
      pendapatan_shift: netIncome,
      total_kas: expectedCash,
      net_income: netIncome,
    };

    res.json(successResponse(summary, "Shift summary"));
  } catch (error) {
    next(error);
  }
};

/**
 * Add expense to shift
 * POST /api/v1/shifts/:id/expenses
 */
export const addExpense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { deskripsi, jumlah } = req.body;

    console.log("[addExpense] Adding expense to shift:", id);

    if (!deskripsi || !deskripsi.trim()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Deskripsi tidak boleh kosong",
        400,
      );
    }

    if (!jumlah || jumlah <= 0) {
      throw new AppError("VALIDATION_ERROR", "Jumlah harus lebih dari 0", 400);
    }

    const jumlahValue = parseFloat(jumlah);
    if (isNaN(jumlahValue)) {
      throw new AppError("VALIDATION_ERROR", "Jumlah harus berupa angka", 400);
    }

    // Check if shift exists and is active
    const shiftResult = await pool.query(
      "SELECT id FROM shifts WHERE id = $1 AND status = $2",
      [id, "active"],
    );

    if (shiftResult.rows.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "Shift tidak ditemukan atau sudah ditutup",
        404,
      );
    }

    // Add expense
    const result = await pool.query(
      `INSERT INTO shift_expenses (shift_id, deskripsi, jumlah)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, deskripsi.trim(), jumlahValue],
    );

    const expense = result.rows[0];
    console.log("[addExpense] Expense added:", expense.id);

    res.json(successResponse(expense, "Belanja berhasil dicatat"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get shift expenses
 * GET /api/v1/shifts/:id/expenses
 */
export const getExpenses = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    console.log("[getExpenses] Getting expenses for shift:", id);

    const result = await pool.query(
      `SELECT *
       FROM shift_expenses
       WHERE shift_id = $1
       ORDER BY created_at DESC`,
      [id],
    );

    const totalExpenses = result.rows.reduce(
      (sum: number, e: any) => sum + parseFloat(e.jumlah),
      0,
    );

    res.json(
      successResponse(
        { expenses: result.rows, total: totalExpenses },
        "Expenses retrieved",
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Update expense
 * PUT /api/v1/shifts/:id/expenses/:expenseId
 */
export const updateExpense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id, expenseId } = req.params;
    const { deskripsi, jumlah } = req.body;

    console.log("[updateExpense] Updating expense:", expenseId);

    if (!deskripsi || !deskripsi.trim()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Deskripsi tidak boleh kosong",
        400,
      );
    }

    if (!jumlah || jumlah <= 0) {
      throw new AppError("VALIDATION_ERROR", "Jumlah harus lebih dari 0", 400);
    }

    const jumlahValue = parseFloat(jumlah);
    if (isNaN(jumlahValue)) {
      throw new AppError("VALIDATION_ERROR", "Jumlah harus berupa angka", 400);
    }

    // Check if expense exists and belongs to shift
    const expenseResult = await pool.query(
      "SELECT id FROM shift_expenses WHERE id = $1 AND shift_id = $2",
      [expenseId, id],
    );

    if (expenseResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Belanja tidak ditemukan", 404);
    }

    // Update expense
    const result = await pool.query(
      `UPDATE shift_expenses
       SET deskripsi = $1, jumlah = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [deskripsi.trim(), jumlahValue, expenseId],
    );

    const updatedExpense = result.rows[0];
    console.log("[updateExpense] Expense updated:", expenseId);

    res.json(successResponse(updatedExpense, "Belanja berhasil diperbarui"));
  } catch (error) {
    next(error);
  }
};

/**
 * Delete expense
 * DELETE /api/v1/shifts/:id/expenses/:expenseId
 */
export const deleteExpense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id, expenseId } = req.params;

    console.log("[deleteExpense] Deleting expense:", expenseId);

    // Check if expense exists and belongs to shift
    const expenseResult = await pool.query(
      "SELECT id FROM shift_expenses WHERE id = $1 AND shift_id = $2",
      [expenseId, id],
    );

    if (expenseResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Belanja tidak ditemukan", 404);
    }

    // Delete expense
    await pool.query("DELETE FROM shift_expenses WHERE id = $1", [expenseId]);

    console.log("[deleteExpense] Expense deleted:", expenseId);

    res.json(successResponse(null, "Belanja berhasil dihapus"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get total expenses (sum all shift_expenses.jumlah)
 * GET /api/v1/shifts/expenses/total
 */
export const getTotalExpenses = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log("[getTotalExpenses] Fetching total expenses");

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(jumlah), 0) as total
       FROM shift_expenses`,
    );

    const totalExpenses = parseFloat(result.rows[0].total) || 0;

    console.log("[getTotalExpenses] Total expenses:", totalExpenses);

    res.json(
      successResponse(
        {
          total: totalExpenses,
        },
        "Total expenses retrieved",
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get shift income calculation
 * GET /api/v1/shifts/:id/income
 */
export const getShiftIncome = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const cashierId = req.user?.id;

    console.log(
      "[getShiftIncome] Calculating income for shift:",
      id,
      "cashier:",
      cashierId,
    );

    if (!cashierId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    // Get shift data
    const shiftResult = await pool.query(
      "SELECT * FROM shifts WHERE id = $1 AND cashier_id = $2",
      [id, cashierId],
    );

    if (shiftResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Shift tidak ditemukan", 404);
    }

    const shift = shiftResult.rows[0];

    // Calculate total penjualan (sum all transactions with status completed)
    const totalPenjualanResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE shift_id = $1 AND status = 'paid'`,
      [id],
    );

    // Calculate total belanja (sum all shift expenses)
    const totalBelanjaResult = await pool.query(
      `SELECT COALESCE(SUM(jumlah), 0) as total
       FROM shift_expenses
       WHERE shift_id = $1`,
      [id],
    );

    const modalAwal = parseFloat(shift.modal_awal) || 0;
    const totalPenjualan = parseFloat(totalPenjualanResult.rows[0]?.total) || 0;
    const totalBelanja = parseFloat(totalBelanjaResult.rows[0]?.total) || 0;

    // Pendapatan shift = revenue earned during shift (penjualan - belanja)
    // Total kas = modal_awal + pendapatan_shift (posisi uang di laci)
    const pendapatanShift = totalPenjualan - totalBelanja;
    const totalKas = modalAwal + pendapatanShift;

    const result = {
      shift_id: id,
      modal_awal: modalAwal,
      total_penjualan: totalPenjualan,
      total_belanja: totalBelanja,
      pendapatan_shift: pendapatanShift,
      total_kas: totalKas,
    };

    console.log("[getShiftIncome] Income calculated:", result);

    res.json(successResponse(result, "Shift income calculated"));
  } catch (error) {
    next(error);
  }
};
