import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'

// Data in DB is stored as UTC TIMESTAMP. Convert to Asia/Jakarta before extracting
// date/hour so queries respect WIB boundaries (midnight WIB = 17:00 UTC previous day).
const TX_DATE = `DATE((COALESCE(completed_at, paid_at, updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')`
const TX_TS   = `(COALESCE(completed_at, paid_at, updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta'`

/** Returns today's date string in Asia/Jakarta (YYYY-MM-DD) */
function jakartaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

/** Returns 30 days ago in Asia/Jakarta (YYYY-MM-DD) */
function jakarta30DaysAgo(): string {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}


/**
 * Get dashboard statistics
 * GET /api/v1/reports/dashboard
 */
export const getDashboardStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { start_date, end_date } = req.query

    const today = jakartaToday()
    const startDate = start_date || today
    const endDate = end_date || today

    const salesResult = await pool.query(
      `SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(total), 0) as total_sales,
        COALESCE(AVG(total), 0) as average_sales
       FROM transactions
       WHERE status IN ('completed', 'paid')
       AND ${TX_DATE} BETWEEN $1 AND $2`,
      [startDate, endDate]
    )

    const customersResult = await pool.query(
      `SELECT COUNT(DISTINCT customer_id) as total_customers
       FROM transactions
       WHERE status IN ('completed', 'paid')
       AND customer_id IS NOT NULL
       AND ${TX_DATE} BETWEEN $1 AND $2`,
      [startDate, endDate]
    )

    const productsResult = await pool.query(
      `SELECT COALESCE(SUM(ti.quantity), 0) as total_products_sold
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE t.status IN ('completed', 'paid')
       AND DATE((COALESCE(t.completed_at, t.paid_at, t.updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2`,
      [startDate, endDate]
    )

    const lowStockResult = await pool.query(
      `SELECT COUNT(*) as low_stock_products
       FROM products
       WHERE stock < min_stock AND status = 'active'`
    )

    const paymentMethodsResult = await pool.query(
      `SELECT
        COALESCE(payment_method, 'Lainnya') as payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as total
       FROM transactions
       WHERE status IN ('completed', 'paid')
       AND ${TX_DATE} BETWEEN $1 AND $2
       GROUP BY payment_method`,
      [startDate, endDate]
    )

    let hourlySales: any[] = []
    if (startDate === endDate) {
      const hourlySalesResult = await pool.query(
        `SELECT
          EXTRACT(HOUR FROM ${TX_TS}) as hour,
          COUNT(*) as transactions,
          COALESCE(SUM(total), 0) as sales
         FROM transactions
         WHERE status IN ('completed', 'paid')
         AND ${TX_DATE} = $1
         GROUP BY EXTRACT(HOUR FROM ${TX_TS})
         ORDER BY hour`,
        [startDate]
      )
      hourlySales = hourlySalesResult.rows
    }

    res.json(successResponse({
      period: { start_date: startDate, end_date: endDate },
      sales: {
        total_transactions: parseInt(salesResult.rows[0].total_transactions),
        total_sales: parseFloat(salesResult.rows[0].total_sales),
        average_sales: parseFloat(salesResult.rows[0].average_sales)
      },
      customers: {
        total_customers: parseInt(customersResult.rows[0].total_customers)
      },
      products: {
        total_products_sold: parseInt(productsResult.rows[0].total_products_sold),
        low_stock_products: parseInt(lowStockResult.rows[0].low_stock_products)
      },
      payment_methods: paymentMethodsResult.rows,
      hourly_sales: hourlySales
    }))
  } catch (error) {
    next(error)
  }
}

/**
 * Get daily sales report
 * GET /api/v1/reports/daily-sales
 */
export const getDailySales = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { start_date, end_date, limit = 30 } = req.query

    const endDateValue = end_date || jakartaToday()
    const startDateValue = start_date || jakarta30DaysAgo()

    const result = await pool.query(
      `SELECT
        ${TX_DATE} as date,
        COUNT(*) as transactions,
        COALESCE(SUM(total), 0) as sales,
        COALESCE(AVG(total), 0) as average_sale,
        COALESCE(SUM(COALESCE(discount_items,0) + COALESCE(discount_global,0)), 0) as total_discounts
       FROM transactions
       WHERE status IN ('completed', 'paid')
       AND ${TX_DATE} BETWEEN $1 AND $2
       GROUP BY ${TX_DATE}
       ORDER BY date DESC
       LIMIT $3`,
      [startDateValue, endDateValue, parseInt(limit as string)]
    )

    res.json(successResponse({
      period: { start_date: startDateValue, end_date: endDateValue },
      data: result.rows
    }))
  } catch (error) {
    next(error)
  }
}

/**
 * Get monthly sales report
 * GET /api/v1/reports/monthly-sales
 */
export const getMonthlySales = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { year, limit = 12 } = req.query

    const yearValue = year || new Date().getFullYear()

    const result = await pool.query(
      `SELECT
        EXTRACT(YEAR FROM ${TX_TS}) as year,
        EXTRACT(MONTH FROM ${TX_TS}) as month,
        TO_CHAR(${TX_TS}, 'Month YYYY') as period,
        COUNT(*) as transactions,
        COALESCE(SUM(total), 0) as sales,
        COALESCE(AVG(total), 0) as average_sale,
        COALESCE(SUM(COALESCE(discount_items,0) + COALESCE(discount_global,0)), 0) as total_discounts
       FROM transactions
       WHERE status IN ('completed', 'paid')
       AND EXTRACT(YEAR FROM ${TX_TS}) = $1
       GROUP BY EXTRACT(YEAR FROM ${TX_TS}), EXTRACT(MONTH FROM ${TX_TS}), TO_CHAR(${TX_TS}, 'Month YYYY')
       ORDER BY year DESC, month DESC
       LIMIT $2`,
      [yearValue, parseInt(limit as string)]
    )

    res.json(successResponse({
      year: yearValue,
      data: result.rows
    }))
  } catch (error) {
    next(error)
  }
}

/**
 * Get best selling products
 * GET /api/v1/reports/best-products
 */
export const getBestProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query

    const endDateValue = end_date || jakartaToday()
    const startDateValue = start_date || jakarta30DaysAgo()

    const result = await pool.query(
      `SELECT
        ti.product_id,
        ti.product_name,
        p.image_url,
        c.name as category_name,
        SUM(ti.quantity) as total_quantity,
        COUNT(DISTINCT ti.transaction_id) as total_transactions,
        COALESCE(SUM(ti.total), 0) as total_sales
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       LEFT JOIN products p ON ti.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE t.status IN ('completed', 'paid')
       AND DATE((COALESCE(t.completed_at, t.paid_at, t.updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
       GROUP BY ti.product_id, ti.product_name, p.image_url, c.name
       ORDER BY total_quantity DESC
       LIMIT $3`,
      [startDateValue, endDateValue, parseInt(limit as string)]
    )

    res.json(successResponse({
      period: { start_date: startDateValue, end_date: endDateValue },
      data: result.rows
    }))
  } catch (error) {
    next(error)
  }
}

/**
 * Get top customers
 * GET /api/v1/reports/top-customers
 */
export const getTopCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query

    const endDateValue = end_date || jakartaToday()
    const startDateValue = start_date || jakarta30DaysAgo()

    const result = await pool.query(
      `SELECT
        c.id,
        c.name,
        c.phone_number,
        c.email,
        c.avatar_url,
        COUNT(t.id) as total_transactions,
        COALESCE(SUM(t.total), 0) as total_spending,
        COALESCE(AVG(t.total), 0) as average_transaction
       FROM customers c
       JOIN transactions t ON c.id = t.customer_id
       WHERE t.status IN ('completed', 'paid')
       AND DATE((COALESCE(t.completed_at, t.paid_at, t.updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
       GROUP BY c.id, c.name, c.phone_number, c.email, c.avatar_url
       ORDER BY total_spending DESC
       LIMIT $3`,
      [startDateValue, endDateValue, parseInt(limit as string)]
    )

    res.json(successResponse({
      period: { start_date: startDateValue, end_date: endDateValue },
      data: result.rows
    }))
  } catch (error) {
    next(error)
  }
}

/**
 * Get sales by category
 * GET /api/v1/reports/sales-by-category
 */
export const getSalesByCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { start_date, end_date } = req.query

    const endDateValue = end_date || jakartaToday()
    const startDateValue = start_date || jakarta30DaysAgo()

    const result = await pool.query(
      `SELECT
        c.id as category_id,
        c.name as category_name,
        c.icon as category_icon,
        COUNT(DISTINCT ti.transaction_id) as total_transactions,
        COALESCE(SUM(ti.quantity), 0) as total_quantity,
        COALESCE(SUM(ti.total), 0) as total_sales
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
       LEFT JOIN transaction_items ti ON p.id = ti.product_id
       LEFT JOIN transactions t ON ti.transaction_id = t.id AND t.status IN ('completed', 'paid')
         AND DATE((COALESCE(t.completed_at, t.paid_at, t.updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
       GROUP BY c.id, c.name, c.icon
       HAVING COALESCE(SUM(ti.total), 0) > 0
       ORDER BY total_sales DESC`,
      [startDateValue, endDateValue]
    )

    res.json(successResponse({
      period: { start_date: startDateValue, end_date: endDateValue },
      data: result.rows
    }))
  } catch (error) {
    next(error)
  }
}

/**
 * Get cashier performance
 * GET /api/v1/reports/cashier-performance
 */
export const getCashierPerformance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query

    const endDateValue = end_date || jakartaToday()
    const startDateValue = start_date || jakarta30DaysAgo()

    const result = await pool.query(
      `SELECT
        u.id as cashier_id,
        u.full_name as cashier_name,
        u.avatar_url,
        COUNT(t.id) as total_transactions,
        COALESCE(SUM(t.total), 0) as total_sales,
        COALESCE(AVG(t.total), 0) as average_transaction
       FROM users u
       JOIN transactions t ON u.id = t.cashier_id
       WHERE t.status IN ('completed', 'paid')
       AND DATE((COALESCE(t.completed_at, t.paid_at, t.updated_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
       GROUP BY u.id, u.full_name, u.avatar_url
       ORDER BY total_sales DESC
       LIMIT $3`,
      [startDateValue, endDateValue, parseInt(limit as string)]
    )

    res.json(successResponse({
      period: { start_date: startDateValue, end_date: endDateValue },
      data: result.rows
    }))
  } catch (error) {
    next(error)
  }
}
