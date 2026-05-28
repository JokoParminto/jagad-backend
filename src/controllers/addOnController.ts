import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'

/**
 * Get all add-ons
 * GET /api/v1/add-ons
 */
export const getAddOns = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await pool.query(`
      SELECT id, name, price, description, icon, sort_order, status, created_at, updated_at
      FROM add_ons
      WHERE status = 'active'
      ORDER BY sort_order ASC, name ASC
    `)

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}

/**
 * Get all add-ons (including inactive)
 * GET /api/v1/add-ons/all
 * Admin/Manager only
 */
export const getAllAddOns = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await pool.query(`
      SELECT id, name, price, description, icon, sort_order, status, created_at, updated_at
      FROM add_ons
      ORDER BY sort_order ASC, name ASC
    `)

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}

/**
 * Get add-on by ID
 * GET /api/v1/add-ons/:id
 */
export const getAddOnById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM add_ons WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Add-on tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0]))
  } catch (error) {
    next(error)
  }
}

/**
 * Create add-on
 * POST /api/v1/add-ons
 * Admin only
 */
export const createAddOn = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, price, description, icon, sort_order } = req.body

    // Validation
    if (!name || price === undefined) {
      throw new AppError('VALIDATION_ERROR', 'Nama dan harga add-on harus diisi', 400)
    }

    if (price < 0) {
      throw new AppError('VALIDATION_ERROR', 'Harga add-on tidak boleh negatif', 400)
    }

    // Check if name already exists
    const existingAddOn = await pool.query(
      'SELECT id FROM add_ons WHERE LOWER(name) = LOWER($1)',
      [name]
    )

    if (existingAddOn.rows.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'Nama add-on sudah digunakan', 400)
    }

    const result = await pool.query(
      `INSERT INTO add_ons (name, price, description, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, price, description || null, icon || null, sort_order || 0]
    )

    res.json(successResponse(result.rows[0], 'Add-on berhasil dibuat'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update add-on
 * PUT /api/v1/add-ons/:id
 * Admin only
 */
export const updateAddOn = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { name, price, description, icon, sort_order, status } = req.body

    // Check if add-on exists
    const existingAddOn = await pool.query(
      'SELECT id FROM add_ons WHERE id = $1',
      [id]
    )

    if (existingAddOn.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Add-on tidak ditemukan', 404)
    }

    // Validate price if provided
    if (price !== undefined && price < 0) {
      throw new AppError('VALIDATION_ERROR', 'Harga add-on tidak boleh negatif', 400)
    }

    // Check if new name already exists (except current add-on)
    if (name) {
      const duplicateName = await pool.query(
        'SELECT id FROM add_ons WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, id]
      )

      if (duplicateName.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Nama add-on sudah digunakan', 400)
      }
    }

    const result = await pool.query(
      `UPDATE add_ons
       SET name = COALESCE($1, name),
           price = COALESCE($2, price),
           description = COALESCE($3, description),
           icon = COALESCE($4, icon),
           sort_order = COALESCE($5, sort_order),
           status = COALESCE($6, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [name, price, description, icon, sort_order, status, id]
    )

    res.json(successResponse(result.rows[0], 'Add-on berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Delete add-on
 * DELETE /api/v1/add-ons/:id
 * Admin only
 */
export const deleteAddOn = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    // Check if add-on exists
    const existingAddOn = await pool.query(
      'SELECT id FROM add_ons WHERE id = $1',
      [id]
    )

    if (existingAddOn.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Add-on tidak ditemukan', 404)
    }

    // Check if add-on is used in transactions
    const usageCount = await pool.query(
      'SELECT COUNT(*) as count FROM transaction_item_add_ons WHERE add_on_id = $1',
      [id]
    )

    if (parseInt(usageCount.rows[0].count) > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Tidak bisa hapus add-on yang sudah digunakan dalam transaksi',
        400
      )
    }

    await pool.query('DELETE FROM add_ons WHERE id = $1', [id])

    res.json(successResponse(null, 'Add-on berhasil dihapus'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update add-on status
 * PATCH /api/v1/add-ons/:id/status
 * Admin only
 */
export const updateAddOnStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !['active', 'inactive'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Status harus "active" atau "inactive"', 400)
    }

    // Check if add-on exists
    const existingAddOn = await pool.query(
      'SELECT id FROM add_ons WHERE id = $1',
      [id]
    )

    if (existingAddOn.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Add-on tidak ditemukan', 404)
    }

    const result = await pool.query(
      `UPDATE add_ons
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    )

    res.json(successResponse(result.rows[0], 'Status add-on berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}
