import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'

/**
 * Get all categories
 * GET /api/v1/categories
 */
export const getCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, icon, sort_order, status, created_at, updated_at
      FROM categories
      ORDER BY sort_order ASC, name ASC
    `)

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}

/**
 * Get category by ID
 * GET /api/v1/categories/:id
 */
export const getCategoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Kategori tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0]))
  } catch (error) {
    next(error)
  }
}

/**
 * Create category
 * POST /api/v1/categories
 */
export const createCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, icon, sort_order } = req.body

    if (!name) {
      throw new AppError('VALIDATION_ERROR', 'Nama kategori harus diisi', 400)
    }

    // Check if name already exists
    const existingCategory = await pool.query(
      'SELECT id FROM categories WHERE name = $1',
      [name]
    )

    if (existingCategory.rows.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'Nama kategori sudah digunakan', 400)
    }

    const result = await pool.query(
      `INSERT INTO categories (name, description, icon, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, icon, sort_order || 0]
    )

    res.json(successResponse(result.rows[0], 'Kategori berhasil dibuat'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update category
 * PUT /api/v1/categories/:id
 */
export const updateCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { name, description, icon, sort_order, status } = req.body

    // Check if category exists
    const existingCategory = await pool.query(
      'SELECT id FROM categories WHERE id = $1',
      [id]
    )

    if (existingCategory.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Kategori tidak ditemukan', 404)
    }

    // Check if new name already exists (except current category)
    if (name) {
      const duplicateName = await pool.query(
        'SELECT id FROM categories WHERE name = $1 AND id != $2',
        [name, id]
      )

      if (duplicateName.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Nama kategori sudah digunakan', 400)
      }
    }

    const result = await pool.query(
      `UPDATE categories
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           icon = COALESCE($3, icon),
           sort_order = COALESCE($4, sort_order),
           status = COALESCE($5, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, description, icon, sort_order, status, id]
    )

    res.json(successResponse(result.rows[0], 'Kategori berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Delete category
 * DELETE /api/v1/categories/:id
 */
export const deleteCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    // Check if category exists
    const existingCategory = await pool.query(
      'SELECT id FROM categories WHERE id = $1',
      [id]
    )

    if (existingCategory.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Kategori tidak ditemukan', 404)
    }

    // Check if category is used by products
    const productsCount = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
      [id]
    )

    if (parseInt(productsCount.rows[0].count) > 0) {
      throw new AppError('VALIDATION_ERROR', 'Kategori masih digunakan oleh produk', 400)
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [id])

    res.json(successResponse(null, 'Kategori berhasil dihapus'))
  } catch (error) {
    next(error)
  }
}
