import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/database";
import { successResponse } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../middleware/auth";

/**
 * Get all users with filters
 * GET /api/v1/users
 */
export const getUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      status,
      search,
      userId,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Exclude specific user if userId is provided
    if (userId) {
      conditions.push(`id != $${paramIndex++}`);
      params.push(userId);
    }

    if (role) {
      conditions.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(username ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (req.user?.id) {
      conditions.push(`id <> $${paramIndex++}`);
      params.push(req.user.id);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get users
    const validSortColumns = [
      "username",
      "full_name",
      "role",
      "created_at",
      "last_login_at",
    ];
    const sortColumn = validSortColumns.includes(sortBy as string)
      ? sortBy
      : "created_at";
    const sortDirection = sortOrder === "asc" ? "ASC" : "DESC";

    params.push(parseInt(limit), offset);
    console.log(whereClause);

    const query = `
      SELECT id, username, full_name, email, phone_number, role, status,
             avatar_url, created_at, updated_at, last_login_at
      FROM users
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const result = await pool.query(query, params);

    res.json(
      successResponse(
        result.rows,
        'success',
        {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      ),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID
 * GET /api/v1/users/:id
 */
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, username, full_name, email, phone_number, role, status,
              avatar_url, created_at, updated_at, last_login_at
       FROM users
       WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    res.json(successResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

/**
 * Create user
 * POST /api/v1/users
 * Admin only
 */
export const createUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      username,
      password,
      full_name,
      email,
      phone_number,
      role,
      avatar_url,
    } = req.body;

    // Validation
    if (!username || !password || !full_name || !role) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Username, password, full_name, dan role harus diisi",
        400,
      );
    }

    if (!["admin", "manager", "kasir"].includes(role)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Role harus admin, manager, atau kasir",
        400,
      );
    }

    if (password.length < 6) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Password minimal 6 karakter",
        400,
      );
    }

    // Validate phone number format if provided (only digits)
    if (phone_number && !/^\d+$/.test(phone_number)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Nomor telepon hanya boleh berisi angka",
        400,
      );
    }

    // Check if username already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username],
    );

    if (existingUser.rows.length > 0) {
      throw new AppError("VALIDATION_ERROR", "Username sudah digunakan", 400);
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email],
      );

      if (existingEmail.rows.length > 0) {
        throw new AppError("VALIDATION_ERROR", "Email sudah digunakan", 400);
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, phone_number, role, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, full_name, email, phone_number, role, status, avatar_url, created_at`,
      [
        username,
        passwordHash,
        full_name,
        email,
        phone_number,
        role,
        avatar_url,
      ],
    );

    res.json(successResponse(result.rows[0], "User berhasil dibuat"));
  } catch (error) {
    next(error);
  }
};

/**
 * Update user
 * PUT /api/v1/users/:id
 */
export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const {
      username,
      full_name,
      email,
      phone_number,
      role,
      status,
      avatar_url,
    } = req.body;

    const currentUser = req.user;

    // Check if user exists
    const existingUser = await pool.query("SELECT * FROM users WHERE id = $1", [
      id,
    ]);

    if (existingUser.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    // Only admin can change role and status
    if ((role || status) && currentUser?.role !== "admin") {
      throw new AppError(
        "FORBIDDEN",
        "Hanya admin yang dapat mengubah role dan status",
        403,
      );
    }

    // Validate role if provided
    if (role && !["admin", "manager", "kasir"].includes(role)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Role harus admin, manager, atau kasir",
        400,
      );
    }

    // Check if new username already exists (except current user)
    if (username) {
      const duplicateUsername = await pool.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [username, id],
      );

      if (duplicateUsername.rows.length > 0) {
        throw new AppError("VALIDATION_ERROR", "Username sudah digunakan", 400);
      }
    }

    // Check if new email already exists (except current user)
    if (email) {
      const duplicateEmail = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, id],
      );

      if (duplicateEmail.rows.length > 0) {
        throw new AppError("VALIDATION_ERROR", "Email sudah digunakan", 400);
      }
    }

    const result = await pool.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           full_name = COALESCE($2, full_name),
           email = COALESCE($3, email),
           phone_number = COALESCE($4, phone_number),
           role = COALESCE($5, role),
           status = COALESCE($6, status),
           avatar_url = COALESCE($7, avatar_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, username, full_name, email, phone_number, role, status, avatar_url, created_at, updated_at`,
      [username, full_name, email, phone_number, role, status, avatar_url, id],
    );

    res.json(successResponse(result.rows[0], "User berhasil diupdate"));
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user
 * DELETE /api/v1/users/:id
 * Admin only
 */
export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // Check if user exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [id],
    );

    if (existingUser.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    // Prevent deleting own account
    if (currentUser?.id === id) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Tidak dapat menghapus akun sendiri",
        400,
      );
    }

    // Check if user has transactions
    const transactionsCount = await pool.query(
      "SELECT COUNT(*) as count FROM transactions WHERE cashier_id = $1",
      [id],
    );

    if (parseInt(transactionsCount.rows[0].count) > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "User masih memiliki transaksi",
        400,
      );
    }

    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    res.json(successResponse(null, "User berhasil dihapus"));
  } catch (error) {
    next(error);
  }
};

/**
 * Update user password (Admin reset password)
 * PATCH /api/v1/users/:id/password
 * Admin only
 */
export const resetUserPassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    // Validation
    if (!new_password) {
      throw new AppError("VALIDATION_ERROR", "Password baru harus diisi", 400);
    }

    if (new_password.length < 6) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Password minimal 6 karakter",
        400,
      );
    }

    // Check if user exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [id],
    );

    if (existingUser.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(new_password, 12);

    // Update password
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, id],
    );

    // Delete all refresh tokens for this user (force re-login)
    await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [id]);

    res.json(successResponse(null, "Password berhasil direset"));
  } catch (error) {
    next(error);
  }
};

/**
 * Update user status
 * PATCH /api/v1/users/:id/status
 * Admin only
 */
export const updateUserStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const currentUser = req.user;

    // Validation
    if (!status || !["active", "inactive"].includes(status)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Status harus active atau inactive",
        400,
      );
    }

    // Prevent deactivating own account
    if (currentUser?.id === id && status === "inactive") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Tidak dapat menonaktifkan akun sendiri",
        400,
      );
    }

    const result = await pool.query(
      `UPDATE users
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, full_name, email, phone_number, role, status, avatar_url, created_at, updated_at`,
      [status, id],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    // If user is deactivated, delete all refresh tokens (force logout)
    if (status === "inactive") {
      await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [id]);
    }

    res.json(successResponse(result.rows[0], "Status user berhasil diupdate"));
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user profile
 * PATCH /api/v1/users/me
 */
export const updateMyProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    const { full_name, email, phone_number, avatar_url } = req.body;

    if (!userId) {
      throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    }

    // Check if new email already exists (except current user)
    if (email) {
      const duplicateEmail = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, userId],
      );

      if (duplicateEmail.rows.length > 0) {
        throw new AppError("VALIDATION_ERROR", "Email sudah digunakan", 400);
      }
    }

    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           phone_number = COALESCE($3, phone_number),
           avatar_url = COALESCE($4, avatar_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, username, full_name, email, phone_number, role, status, avatar_url, created_at, updated_at`,
      [full_name, email, phone_number, avatar_url, userId],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    res.json(successResponse(result.rows[0], "Profile berhasil diupdate"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get all available permissions
 * GET /api/v1/permissions
 */
export const getAllPermissions = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Get all available permissions
    const allPermsResult = await pool.query(
      "SELECT id, name FROM permissions ORDER BY name",
    );
    const allPermissions = allPermsResult.rows;

    // Return all permissions with assigned: false by default
    const permissionsWithStatus = allPermissions.map((p) => ({
      id: p.id,
      name: p.name,
      assigned: false,
    }));

    res.json(
      successResponse({
        permissions: permissionsWithStatus,
      }),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get user permissions
 * GET /api/v1/users/:id/permissions
 */
export const getUserPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [
      id,
    ]);

    if (userResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    // Get all available permissions
    const allPermsResult = await pool.query(
      "SELECT id, name FROM permissions ORDER BY name",
    );
    const allPermissions = allPermsResult.rows;

    // Get user's current permissions
    const userPermsResult = await pool.query(
      `SELECT p.id, p.name FROM user_permissions up
       JOIN permissions p ON up.permission_id = p.id
       WHERE up.user_id = $1
       ORDER BY p.name`,
      [id],
    );
    const userPermissions = userPermsResult.rows.map((p) => p.id);

    // Return all permissions with flags for which ones user has
    const permissionsWithStatus = allPermissions.map((p) => ({
      id: p.id,
      name: p.name,
      assigned: userPermissions.includes(p.id),
    }));

    res.json(
      successResponse({
        permissions: permissionsWithStatus,
      }),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Update user permissions
 * PATCH /api/v1/users/:id/permissions
 */
export const updateUserPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { permissionIds } = req.body;

    // Validation
    if (!Array.isArray(permissionIds)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "permissionIds harus berupa array",
        400,
      );
    }

    // Check if user exists
    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [
      id,
    ]);

    if (userResult.rows.length === 0) {
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
    }

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Delete existing user permissions
      await pool.query("DELETE FROM user_permissions WHERE user_id = $1", [id]);

      // Insert new permissions
      if (permissionIds.length > 0) {
        const placeholders = permissionIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(",");
        const values = [id, ...permissionIds];

        await pool.query(
          `INSERT INTO user_permissions (user_id, permission_id) VALUES ${placeholders}`,
          values,
        );
      }

      await pool.query("COMMIT");

      console.log(
        `[UserController] User ${id} permissions updated. Count: ${permissionIds.length}`,
      );

      res.json(successResponse(null, "Permission user berhasil diupdate"));
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Change own password (self-service)
 * PATCH /api/v1/users/me/password
 */
export const changeMyPassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    const { current_password, new_password } = req.body;

    if (!userId) throw new AppError("UNAUTHORIZED", "User tidak terautentikasi", 401);
    if (!current_password || !new_password)
      throw new AppError("VALIDATION_ERROR", "Password lama dan baru wajib diisi", 400);
    if (new_password.length < 6)
      throw new AppError("VALIDATION_ERROR", "Password baru minimal 6 karakter", 400);

    // Verify current password
    const userResult = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );
    if (userResult.rows.length === 0)
      throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);

    const isMatch = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!isMatch)
      throw new AppError("VALIDATION_ERROR", "Password lama tidak sesuai", 400);

    const passwordHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, userId],
    );

    res.json(successResponse(null, "Password berhasil diubah"));
  } catch (error) {
    next(error);
  }
};
