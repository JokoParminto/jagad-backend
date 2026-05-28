import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../config/database'
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'
import { LoginRequest, RegisterRequest, ChangePasswordRequest } from '../types'

/**
 * Login user
 * POST /api/v1/auth/login
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, password } = req.body as LoginRequest

    // Validation
    if (!username || !password) {
      throw new AppError('VALIDATION_ERROR', 'Username dan password harus diisi', 400)
    }

    // Get user with permissions (prefer user_permissions if exists, else use role_permissions)
    const userResult = await pool.query(
      `SELECT u.*,
        COALESCE(
          json_agg(
            DISTINCT p.name
          ) FILTER (WHERE p.name IS NOT NULL),
          '[]'
        ) as permissions
       FROM users u
       LEFT JOIN (
         SELECT user_id, permission_id FROM user_permissions
         UNION ALL
         SELECT u2.id as user_id, rp.permission_id FROM users u2
         LEFT JOIN role_permissions rp ON u2.role = rp.role
         WHERE NOT EXISTS (SELECT 1 FROM user_permissions WHERE user_id = u2.id)
       ) perms ON u.id = perms.user_id
       LEFT JOIN permissions p ON perms.permission_id = p.id
       WHERE u.username = $1
       GROUP BY u.id`,
      [username]
    )

    if (userResult.rows.length === 0) {
      throw new AppError('UNAUTHORIZED', 'Username atau password salah', 401)
    }

    const user = userResult.rows[0]

    // Check if user is active
    if (user.status !== 'active') {
      throw new AppError('UNAUTHORIZED', 'Akun Anda tidak aktif', 401)
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    if (!isValidPassword) {
      throw new AppError('UNAUTHORIZED', 'Username atau password salah', 401)
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    )

    // Generate tokens
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    }

    const accessToken = generateToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)

    // Store refresh token in database
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    )

    // Remove password hash from response
    delete user.password_hash

    res.json(successResponse({
      user,
      accessToken,
      refreshToken
    }, 'Login berhasil'))

  } catch (error) {
    next(error)
  }
}

/**
 * Logout user
 * POST /api/v1/auth/logout
 */
export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const refreshToken = req.body.refreshToken

    if (refreshToken) {
      // Delete refresh token from database
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken])
    }

    res.json(successResponse(null, 'Logout berhasil'))

  } catch (error) {
    next(error)
  }
}

/**
 * Register new user (admin only)
 * POST /api/v1/auth/register
 */
export const register = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, password, full_name, email, phone_number, role } = req.body as RegisterRequest

    // Validation
    if (!username || !password || !full_name || !role) {
      throw new AppError('VALIDATION_ERROR', 'Username, password, full_name, dan role harus diisi', 400)
    }

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    )

    if (existingUser.rows.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'Username sudah digunakan', 400)
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      )

      if (existingEmail.rows.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Email sudah digunakan', 400)
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12)

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, phone_number, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, full_name, email, phone_number, role, status, created_at`,
      [username, password_hash, full_name, email, phone_number, role]
    )

    res.json(successResponse(result.rows[0], 'User berhasil didaftarkan'))

  } catch (error) {
    next(error)
  }
}

/**
 * Refresh access token
 * POST /api/v1/auth/refresh
 */
export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      throw new AppError('VALIDATION_ERROR', 'Refresh token harus diisi', 400)
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken)

    // Check if refresh token exists in database
    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2',
      [refreshToken, decoded.id]
    )

    if (tokenResult.rows.length === 0) {
      throw new AppError('UNAUTHORIZED', 'Refresh token tidak valid', 401)
    }

    const tokenRecord = tokenResult.rows[0]

    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [tokenRecord.id])
      throw new AppError('UNAUTHORIZED', 'Refresh token sudah expired', 401)
    }

    // Get user with permissions
    const userResult = await pool.query(
      `SELECT u.*,
        COALESCE(
          json_agg(
            DISTINCT p.name
          ) FILTER (WHERE p.name IS NOT NULL),
          '[]'
        ) as permissions
       FROM users u
       LEFT JOIN role_permissions rp ON u.role = rp.role
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [decoded.id]
    )

    if (userResult.rows.length === 0) {
      throw new AppError('UNAUTHORIZED', 'User tidak ditemukan', 401)
    }

    const user = userResult.rows[0]

    // Check if user is still active
    if (user.status !== 'active') {
      throw new AppError('UNAUTHORIZED', 'Akun Anda tidak aktif', 401)
    }

    // Generate new access token
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    }

    const accessToken = generateToken(tokenPayload)

    res.json(successResponse({
      accessToken
    }, 'Token berhasil di-refresh'))

  } catch (error) {
    next(error)
  }
}

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
export const me = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'User tidak terautentikasi', 401)
    }

    // Get user with permissions
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone_number, u.role, 
              u.status, u.avatar_url, u.created_at, u.updated_at, u.last_login_at,
        COALESCE(
          json_agg(
            DISTINCT p.name
          ) FILTER (WHERE p.name IS NOT NULL),
          '[]'
        ) as permissions
       FROM users u
       LEFT JOIN role_permissions rp ON u.role = rp.role
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId]
    )

    if (userResult.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'User tidak ditemukan', 404)
    }

    res.json(successResponse(userResult.rows[0]))

  } catch (error) {
    next(error)
  }
}

/**
 * Change password
 * PUT /api/v1/auth/change-password
 */
export const changePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id
    const { currentPassword, newPassword } = req.body as ChangePasswordRequest

    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'User tidak terautentikasi', 401)
    }

    // Validation
    if (!currentPassword || !newPassword) {
      throw new AppError('VALIDATION_ERROR', 'Current password dan new password harus diisi', 400)
    }

    if (newPassword.length < 6) {
      throw new AppError('VALIDATION_ERROR', 'Password baru minimal 6 karakter', 400)
    }

    // Get user
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'User tidak ditemukan', 404)
    }

    const user = userResult.rows[0]

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash)
    if (!isValidPassword) {
      throw new AppError('UNAUTHORIZED', 'Password saat ini salah', 401)
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    )

    // Delete all refresh tokens for this user (force re-login)
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])

    res.json(successResponse(null, 'Password berhasil diubah'))

  } catch (error) {
    next(error)
  }
}
