import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'

/**
 * Get all customers with search and pagination
 * GET /api/v1/customers
 */
export const getCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page,
      limit,
      search,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query as any

    const isPaginated = limit !== undefined

    // Build WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR phone_number ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const validSortColumns = ['name', 'phone_number', 'total_spending', 'total_transactions', 'created_at']
    const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'name'
    const sortDirection = sortOrder === 'desc' ? 'DESC' : 'ASC'

    let query: string
    let meta: { page: number; limit: number; total: number; totalPages: number } | undefined

    if (isPaginated) {
      const parsedLimit = parseInt(limit)
      const parsedPage = parseInt(page ?? 1)
      const offset = (parsedPage - 1) * parsedLimit

      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM customers ${whereClause}`,
        params
      )
      const total = parseInt(countResult.rows[0].total)

      params.push(parsedLimit, offset)
      query = `
        SELECT *
        FROM customers
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `
      meta = { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) }
    } else {
      query = `
        SELECT *
        FROM customers
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
      `
    }

    const result = await pool.query(query, params)

    res.json(successResponse(result.rows, 'success', meta))
  } catch (error) {
    next(error)
  }
}

/**
 * Get customer by ID
 * GET /api/v1/customers/:id
 */
export const getCustomerById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Customer tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0]))
  } catch (error) {
    next(error)
  }
}

/**
 * Create customer
 * POST /api/v1/customers
 */
export const createCustomer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Accept both camelCase and snake_case from frontend
    const {
      name,
      phone_number: phoneNumber,
      phoneNumber: phoneNumberCamel,
      email,
      avatar_url: avatarUrl,
      avatar: avatarCamel,
      is_member: isMember,
      isMember: isMemberCamel,
      is_member_raw,
    } = req.body

    // Normalize field names (accept both camelCase and snake_case)
    const normalizedPhoneNumber = phoneNumber || phoneNumberCamel
    const normalizedAvatarUrl = avatarUrl || avatarCamel || ''
    const normalizedIsMember = isMember !== undefined ? isMember : (isMemberCamel !== undefined ? isMemberCamel : is_member_raw ?? false)

    // Validation — only name is required, phone is optional
    if (!name) {
      throw new AppError('VALIDATION_ERROR', 'Nama harus diisi', 400)
    }

    // Validate and check phone number only if provided
    if (normalizedPhoneNumber) {
      if (!/^\d+$/.test(normalizedPhoneNumber)) {
        throw new AppError('VALIDATION_ERROR', 'Nomor telepon hanya boleh berisi angka', 400)
      }

      const existingCustomer = await pool.query(
        'SELECT id FROM customers WHERE phone_number = $1',
        [normalizedPhoneNumber]
      )

      if (existingCustomer.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Nomor telepon sudah terdaftar', 400)
      }
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await pool.query(
        'SELECT id FROM customers WHERE email = $1',
        [email]
      )

      if (existingEmail.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Email sudah terdaftar', 400)
      }
    }

    const result = await pool.query(
      `INSERT INTO customers (name, phone_number, email, avatar_url, is_member)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, normalizedPhoneNumber || null, email || null, normalizedAvatarUrl, normalizedIsMember]
    )

    res.json(successResponse(result.rows[0], 'Customer berhasil dibuat'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update customer
 * PUT /api/v1/customers/:id
 */
export const updateCustomer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const raw = req.body
    const name        = raw.name?.trim()         || null
    const phone_number = raw.phone_number?.trim() || null
    const email       = raw.email?.trim()         || null
    const avatar_url  = raw.avatar_url?.trim()    || null
    const is_member   = raw.is_member

    // Check if customer exists
    const existingCustomer = await pool.query(
      'SELECT id FROM customers WHERE id = $1',
      [id]
    )

    if (existingCustomer.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Customer tidak ditemukan', 404)
    }

    // Validate phone number format if provided (only digits)
    if (phone_number && !/^\d+$/.test(phone_number)) {
      throw new AppError('VALIDATION_ERROR', 'Nomor telepon hanya boleh berisi angka', 400)
    }

    // Check if new phone number already exists (except current customer)
    if (phone_number) {
      const duplicatePhone = await pool.query(
        'SELECT id FROM customers WHERE phone_number = $1 AND id != $2',
        [phone_number, id]
      )

      if (duplicatePhone.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Nomor telepon sudah terdaftar', 400)
      }
    }

    // Check if new email already exists (except current customer)
    if (email) {
      const duplicateEmail = await pool.query(
        'SELECT id FROM customers WHERE email = $1 AND id != $2',
        [email, id]
      )

      if (duplicateEmail.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Email sudah terdaftar', 400)
      }
    }

    const result = await pool.query(
      `UPDATE customers
       SET name = COALESCE($1, name),
           phone_number = COALESCE($2, phone_number),
           email = COALESCE($3, email),
           avatar_url = COALESCE($4, avatar_url),
           is_member = COALESCE($5, is_member),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, phone_number, email, avatar_url, is_member, id]
    )

    res.json(successResponse(result.rows[0], 'Customer berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Delete customer
 * DELETE /api/v1/customers/:id
 */
export const deleteCustomer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    // Check if customer exists
    const existingCustomer = await pool.query(
      'SELECT id FROM customers WHERE id = $1',
      [id]
    )

    if (existingCustomer.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Customer tidak ditemukan', 404)
    }

    // Check if customer has transactions
    const transactionsCount = await pool.query(
      'SELECT COUNT(*) as count FROM transactions WHERE customer_id = $1',
      [id]
    )

    if (parseInt(transactionsCount.rows[0].count) > 0) {
      throw new AppError('VALIDATION_ERROR', 'Customer masih memiliki transaksi', 400)
    }

    await pool.query('DELETE FROM customers WHERE id = $1', [id])

    res.json(successResponse(null, 'Customer berhasil dihapus'))
  } catch (error) {
    next(error)
  }
}

/**
 * Get top customers by spending
 * GET /api/v1/customers/top
 */
export const getTopCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { limit = 10 } = req.query

    const result = await pool.query(
      `SELECT *
       FROM customers
       WHERE total_spending > 0
       ORDER BY total_spending DESC
       LIMIT $1`,
      [parseInt(limit as string)]
    )

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}
