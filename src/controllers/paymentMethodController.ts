import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'

/**
 * Get all payment methods
 * GET /api/v1/payment-methods
 */
export const getPaymentMethods = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await pool.query(`
      SELECT id, icon, name, status, created_at, updated_at
      FROM payment_methods
      ORDER BY created_at ASC
    `)

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}

/**
 * Get payment method by ID
 * GET /api/v1/payment-methods/:id
 */
export const getPaymentMethodById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM payment_methods WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Metode pembayaran tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0]))
  } catch (error) {
    next(error)
  }
}

/**
 * Create payment method
 * POST /api/v1/payment-methods
 */
export const createPaymentMethod = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { icon, name, status } = req.body

    if (!name || !icon) {
      throw new AppError('VALIDATION_ERROR', 'Icon dan nama metode pembayaran harus diisi', 400)
    }

    // Check if name already exists
    const existingMethod = await pool.query(
      'SELECT id FROM payment_methods WHERE name = $1',
      [name]
    )

    if (existingMethod.rows.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'Nama metode pembayaran sudah digunakan', 400)
    }

    const result = await pool.query(
      `INSERT INTO payment_methods (icon, name, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [icon, name, status || 'active']
    )

    res.json(successResponse(result.rows[0], 'Metode pembayaran berhasil dibuat'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update payment method
 * PUT /api/v1/payment-methods/:id
 */
export const updatePaymentMethod = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { icon, name, status } = req.body

    // Check if payment method exists
    const existingMethod = await pool.query(
      'SELECT id FROM payment_methods WHERE id = $1',
      [id]
    )

    if (existingMethod.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Metode pembayaran tidak ditemukan', 404)
    }

    // Check if new name already exists (except current method)
    if (name) {
      const duplicateName = await pool.query(
        'SELECT id FROM payment_methods WHERE name = $1 AND id != $2',
        [name, id]
      )

      if (duplicateName.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Nama metode pembayaran sudah digunakan', 400)
      }
    }

    const result = await pool.query(
      `UPDATE payment_methods
       SET icon = COALESCE($1, icon),
           name = COALESCE($2, name),
           status = COALESCE($3, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [icon, name, status, id]
    )

    res.json(successResponse(result.rows[0], 'Metode pembayaran berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Delete payment method
 * DELETE /api/v1/payment-methods/:id
 */
export const deletePaymentMethod = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    // Check if payment method exists
    const existingMethod = await pool.query(
      'SELECT id FROM payment_methods WHERE id = $1',
      [id]
    )

    if (existingMethod.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Metode pembayaran tidak ditemukan', 404)
    }

    // TODO: Check if payment method is used in transactions
    // For now, we'll allow deletion

    await pool.query('DELETE FROM payment_methods WHERE id = $1', [id])

    res.json(successResponse(null, 'Metode pembayaran berhasil dihapus'))
  } catch (error) {
    next(error)
  }
}
