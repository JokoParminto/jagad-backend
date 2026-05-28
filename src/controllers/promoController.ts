import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'

/**
 * Get all promos with filters
 * GET /api/v1/promos
 */
export const getPromos = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      active_only,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query as any

    const offset = (parseInt(page) - 1) * parseInt(limit)

    // Build WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`status = $${paramIndex++}`)
      params.push(status)
    }

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (active_only === 'true') {
      conditions.push(`status = 'active'`)
      conditions.push(`CURRENT_DATE BETWEEN start_date AND end_date`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM promos
      ${whereClause}
    `
    const countResult = await pool.query(countQuery, params)
    const total = parseInt(countResult.rows[0].total)

    // Get promos
    const validSortColumns = ['name', 'discount_value', 'start_date', 'end_date', 'usage_count', 'created_at']
    const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'created_at'
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC'

    params.push(parseInt(limit), offset)

    const query = `
      SELECT *
      FROM promos
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `

    const result = await pool.query(query, params)

    res.json(successResponse(
      result.rows,
      'success',
      {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    ))
  } catch (error) {
    next(error)
  }
}

/**
 * Get promo by ID
 * GET /api/v1/promos/:id
 */
export const getPromoById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM promos WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Promo tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0]))
  } catch (error) {
    next(error)
  }
}

/**
 * Get active promos (currently valid)
 * GET /api/v1/promos/active
 */
export const getActivePromos = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM promos
       WHERE status = 'active'
       AND CURRENT_DATE BETWEEN start_date AND end_date
       ORDER BY discount_value DESC`
    )

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}

/**
 * Create promo
 * POST /api/v1/promos
 */
export const createPromo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      name,
      description,
      discount_value,
      discount_type,
      start_date,
      end_date,
      min_transaction,
      max_discount,
      applicable_products,
      status
    } = req.body

    // Validation
    if (!name || !discount_value || !discount_type || !start_date || !end_date) {
      throw new AppError('VALIDATION_ERROR', 'Nama, nilai diskon, tipe diskon, tanggal mulai dan tanggal berakhir harus diisi', 400)
    }

    if (!['amount', 'percentage'].includes(discount_type)) {
      throw new AppError('VALIDATION_ERROR', 'Tipe diskon harus amount atau percentage', 400)
    }

    if (parseFloat(discount_value) <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Nilai diskon harus lebih dari 0', 400)
    }

    if (discount_type === 'percentage' && parseFloat(discount_value) > 100) {
      throw new AppError('VALIDATION_ERROR', 'Nilai diskon persentase tidak boleh lebih dari 100', 400)
    }

    // Validate dates
    const startDate = new Date(start_date)
    const endDate = new Date(end_date)

    if (endDate < startDate) {
      throw new AppError('VALIDATION_ERROR', 'Tanggal berakhir harus setelah tanggal mulai', 400)
    }

    const result = await pool.query(
      `INSERT INTO promos (
        name, description, discount_value, discount_type, start_date, end_date,
        min_transaction, max_discount, applicable_products, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        name,
        description,
        discount_value,
        discount_type,
        start_date,
        end_date,
        min_transaction || 0,
        max_discount,
        applicable_products ? JSON.stringify(applicable_products) : null,
        status || 'active'
      ]
    )

    res.json(successResponse(result.rows[0], 'Promo berhasil dibuat'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update promo
 * PUT /api/v1/promos/:id
 */
export const updatePromo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const {
      name,
      description,
      discount_value,
      discount_type,
      start_date,
      end_date,
      min_transaction,
      max_discount,
      applicable_products,
      status
    } = req.body

    // Check if promo exists
    const existingPromo = await pool.query(
      'SELECT * FROM promos WHERE id = $1',
      [id]
    )

    if (existingPromo.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Promo tidak ditemukan', 404)
    }

    // Validation
    if (discount_type && !['amount', 'percentage'].includes(discount_type)) {
      throw new AppError('VALIDATION_ERROR', 'Tipe diskon harus amount atau percentage', 400)
    }

    if (discount_value && parseFloat(discount_value) <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Nilai diskon harus lebih dari 0', 400)
    }

    if (discount_type === 'percentage' && discount_value && parseFloat(discount_value) > 100) {
      throw new AppError('VALIDATION_ERROR', 'Nilai diskon persentase tidak boleh lebih dari 100', 400)
    }

    // Validate dates if both are provided
    if (start_date && end_date) {
      const startDate = new Date(start_date)
      const endDate = new Date(end_date)

      if (endDate < startDate) {
        throw new AppError('VALIDATION_ERROR', 'Tanggal berakhir harus setelah tanggal mulai', 400)
      }
    }

    const result = await pool.query(
      `UPDATE promos
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           discount_value = COALESCE($3, discount_value),
           discount_type = COALESCE($4, discount_type),
           start_date = COALESCE($5, start_date),
           end_date = COALESCE($6, end_date),
           min_transaction = COALESCE($7, min_transaction),
           max_discount = COALESCE($8, max_discount),
           applicable_products = COALESCE($9, applicable_products),
           status = COALESCE($10, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [
        name,
        description,
        discount_value,
        discount_type,
        start_date,
        end_date,
        min_transaction,
        max_discount,
        applicable_products ? JSON.stringify(applicable_products) : null,
        status,
        id
      ]
    )

    res.json(successResponse(result.rows[0], 'Promo berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Delete promo
 * DELETE /api/v1/promos/:id
 */
export const deletePromo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    // Check if promo exists
    const existingPromo = await pool.query(
      'SELECT id FROM promos WHERE id = $1',
      [id]
    )

    if (existingPromo.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Promo tidak ditemukan', 404)
    }

    await pool.query('DELETE FROM promos WHERE id = $1', [id])

    res.json(successResponse(null, 'Promo berhasil dihapus'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update promo status
 * PATCH /api/v1/promos/:id/status
 */
export const updatePromoStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !['active', 'inactive'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Status harus active atau inactive', 400)
    }

    const result = await pool.query(
      `UPDATE promos
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Promo tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0], 'Status promo berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}
