import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../middleware/auth'

/**
 * Get all products with filters and pagination
 * GET /api/v1/products
 */
export const getProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page = 1,
      per_page = 20,
      category_id,
      status,
      search,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query as any

    const offset = (parseInt(page) - 1) * parseInt(per_page)

    // Build WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (category_id) {
      conditions.push(`p.category_id = $${paramIndex++}`)
      params.push(category_id)
    }

    if (status) {
      conditions.push(`p.status = $${paramIndex++}`)
      params.push(status)
    }

    if (search) {
      conditions.push(`(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }


    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      ${whereClause}
    `
    const countResult = await pool.query(countQuery, params)
    const total = parseInt(countResult.rows[0].total)

    // Get products
    const validSortColumns = ['name', 'price', 'stock', 'created_at']
    const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'name'
    const sortDirection = sortOrder === 'desc' ? 'DESC' : 'ASC'

    params.push(parseInt(per_page), offset)

    const query = `
      SELECT
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.member_price,
        p.hpp,
        p.stock,
        p.image_url,
        p.status,
        p.created_at,
        p.updated_at,
        c.name as category_name,
        c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `

    const result = await pool.query(query, params)

    console.log('[productController] Raw product data from DB:', {
      rowCount: result.rows.length,
      firstProduct: result.rows[0],
      hasMemberPrice: result.rows[0]?.member_price !== undefined
    })

    // Get add-ons for each product
    const productsWithAddOns = await Promise.all(
      result.rows.map(async (product) => {
        const addOnsResult = await pool.query(
          `SELECT a.id, a.name, a.price, a.description, a.icon, a.sort_order, a.status
           FROM add_ons a
           INNER JOIN product_addons pa ON a.id = pa.addon_id
           WHERE pa.product_id = $1
           ORDER BY a.sort_order ASC`,
          [product.id]
        )
        return {
          ...product,
          addOns: addOnsResult.rows
        }
      })
    )

    res.json(successResponse(
      productsWithAddOns,
      'success',
      {
        page: parseInt(page),
        limit: parseInt(per_page),
        total,
        totalPages: Math.ceil(total / parseInt(per_page))
      }
    ))
  } catch (error) {
    next(error)
  }
}

/**
 * Get product by ID with add-ons
 * GET /api/v1/products/:id
 */
export const getProductById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      `SELECT
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.member_price,
        p.hpp,
        p.stock,
        p.image_url,
        p.status,
        p.created_at,
        p.updated_at,
        c.name as category_name,
        c.icon as category_icon
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Produk tidak ditemukan', 404)
    }

    const product = result.rows[0]
    
    console.log('[productController] Product by ID - raw data:', {
      id: product.id,
      name: product.name,
      price: product.price,
      member_price: product.member_price,
      hasMemberPrice: product.member_price !== undefined
    })

    // Get add-ons for this product
    const addOnsResult = await pool.query(
      `SELECT a.id, a.name, a.price, a.description, a.icon, a.sort_order, a.status
       FROM add_ons a
       INNER JOIN product_addons pa ON a.id = pa.addon_id
       WHERE pa.product_id = $1
       ORDER BY a.sort_order ASC`,
      [id]
    )

    product.addOns = addOnsResult.rows

    res.json(successResponse(product))
  } catch (error) {
    next(error)
  }
}

/**
 * Create product with add-ons
 * POST /api/v1/products
 */
export const createProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      category_id,
      name,
      description,
      image_url,
      hpp,
      price,
      member_price,
      stock,
      min_stock,
      status,
      addOnIds = []
    } = req.body

    console.log('[createProduct] Request body:', req.body)
    console.log('[createProduct] addOnIds received:', addOnIds)

    // Extract IDs dari addOns array jika dikirim sebagai objects
    let finalAddOnIds: string[] = []

    // Priority: addOns array (dari frontend)
    if (req.body.addOns && Array.isArray(req.body.addOns) && req.body.addOns.length > 0) {
      finalAddOnIds = req.body.addOns.map((addon: any) => addon.id).filter((id: any) => id)
      console.log('[createProduct] Extracted addOnIds from addOns array:', finalAddOnIds)
    }
    // Fallback: addOnIds array (untuk backward compatibility)
    else if (addOnIds && Array.isArray(addOnIds) && addOnIds.length > 0) {
      finalAddOnIds = addOnIds.filter((id: any) => id)
      console.log('[createProduct] Using addOnIds array:', finalAddOnIds)
    }

    console.log('[createProduct] Final addOnIds to insert:', finalAddOnIds)

    // Validation
    if (!name || !price) {
      throw new AppError('VALIDATION_ERROR', 'Nama dan harga produk harus diisi', 400)
    }

    if (parseFloat(price) < 0) {
      throw new AppError('VALIDATION_ERROR', 'Harga tidak boleh negatif', 400)
    }

    if (parseFloat(hpp || 0) < 0) {
      throw new AppError('VALIDATION_ERROR', 'HPP tidak boleh negatif', 400)
    }

    // Validate member_price if provided
    if (member_price !== undefined && member_price !== null) {
      const memberPriceNum = parseFloat(member_price)
      const priceNum = parseFloat(price)
      const hppNum = parseFloat(hpp || 0)

      if (memberPriceNum < 0) {
        throw new AppError('VALIDATION_ERROR', 'Harga member tidak boleh negatif', 400)
      }

      if (memberPriceNum > priceNum) {
        throw new AppError('VALIDATION_ERROR', 'Harga member tidak boleh lebih tinggi dari harga normal', 400)
      }

      if (memberPriceNum < hppNum) {
        throw new AppError('VALIDATION_ERROR', 'Harga member tidak boleh lebih rendah dari HPP', 400)
      }
    }

    // Create product
    const result = await pool.query(
      `INSERT INTO products (
        category_id, name, description, image_url, hpp, price, member_price, stock, min_stock, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        category_id || null,
        name,
        description,
        image_url,
        hpp || 0,
        price,
        member_price || null,
        stock || 0,
        min_stock || 5,
        status || 'active'
      ]
    )

    const product = result.rows[0]

    // Add product add-ons if provided
    if (finalAddOnIds && finalAddOnIds.length > 0) {
      for (const addonId of finalAddOnIds) {
        try {
          await pool.query(
            `INSERT INTO product_addons (product_id, addon_id)
             VALUES ($1, $2)
             ON CONFLICT (product_id, addon_id) DO NOTHING`,
            [product.id, addonId]
          )
        } catch (err) {
          console.error(`Error adding addon ${addonId} to product:`, err)
        }
      }
    }

    // Fetch created product with add-ons
    const addOnsResult = await pool.query(
      `SELECT a.id, a.name, a.price, a.description, a.icon, a.sort_order, a.status
       FROM add_ons a
       INNER JOIN product_addons pa ON a.id = pa.addon_id
       WHERE pa.product_id = $1
       ORDER BY a.sort_order ASC`,
      [product.id]
    )

    product.addOns = addOnsResult.rows

    res.json(successResponse(product, 'Produk berhasil dibuat'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update product with add-ons
 * PUT /api/v1/products/:id
 */
export const updateProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const {
      category_id,
      name,
      description,
      image_url,
      hpp,
      price,
      member_price,
      stock,
      min_stock,
      status,
      addOnIds = []
    } = req.body

    console.log('[updateProduct] Request body:', req.body)
    console.log('[updateProduct] addOnIds received:', addOnIds)

    // Extract IDs dari addOns array jika dikirim sebagai objects
    let finalAddOnIds: string[] = []

    // Priority: addOns array (dari frontend)
    if (req.body.addOns && Array.isArray(req.body.addOns) && req.body.addOns.length > 0) {
      finalAddOnIds = req.body.addOns.map((addon: any) => addon.id).filter((id: any) => id)
      console.log('[updateProduct] Extracted addOnIds from addOns array:', finalAddOnIds)
    }
    // Fallback: addOnIds array (untuk backward compatibility)
    else if (addOnIds && Array.isArray(addOnIds) && addOnIds.length > 0) {
      finalAddOnIds = addOnIds.filter((id: any) => id)
      console.log('[updateProduct] Using addOnIds array:', finalAddOnIds)
    }

    console.log('[updateProduct] Final addOnIds to insert:', finalAddOnIds)

    // Check if product exists
    const existingProduct = await pool.query(
      'SELECT id, hpp, price FROM products WHERE id = $1',
      [id]
    )

    if (existingProduct.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Produk tidak ditemukan', 404)
    }

    const currentProduct = existingProduct.rows[0]

    // Validation
    if (price && parseFloat(price) < 0) {
      throw new AppError('VALIDATION_ERROR', 'Harga tidak boleh negatif', 400)
    }

    if (hpp && parseFloat(hpp) < 0) {
      throw new AppError('VALIDATION_ERROR', 'HPP tidak boleh negatif', 400)
    }

    // Validate member_price if provided
    if (member_price !== undefined && member_price !== null) {
      const memberPriceNum = parseFloat(member_price)
      const priceNum = price ? parseFloat(price) : currentProduct.price
      const hppNum = hpp ? parseFloat(hpp) : currentProduct.hpp

      if (memberPriceNum < 0) {
        throw new AppError('VALIDATION_ERROR', 'Harga member tidak boleh negatif', 400)
      }

      if (memberPriceNum > priceNum) {
        throw new AppError('VALIDATION_ERROR', 'Harga member tidak boleh lebih tinggi dari harga normal', 400)
      }

      if (memberPriceNum < hppNum) {
        throw new AppError('VALIDATION_ERROR', 'Harga member tidak boleh lebih rendah dari HPP', 400)
      }
    }

    // Update product
    const result = await pool.query(
      `UPDATE products
       SET category_id = COALESCE($1, category_id),
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           image_url = COALESCE($4, image_url),
           hpp = COALESCE($5, hpp),
           price = COALESCE($6, price),
           member_price = COALESCE($7, member_price),
           stock = COALESCE($8, stock),
           min_stock = COALESCE($9, min_stock),
           status = COALESCE($10, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [category_id, name, description, image_url, hpp, price, member_price || null, stock, min_stock, status, id]
    )

    const product = result.rows[0]

    // Update product add-ons if provided
    if (finalAddOnIds && Array.isArray(finalAddOnIds)) {
      // Delete existing product add-ons
      await pool.query('DELETE FROM product_addons WHERE product_id = $1', [id])

      // Insert new product add-ons
      if (finalAddOnIds.length > 0) {
        for (const addonId of finalAddOnIds) {
          try {
            await pool.query(
              `INSERT INTO product_addons (product_id, addon_id)
               VALUES ($1, $2)
               ON CONFLICT (product_id, addon_id) DO NOTHING`,
              [id, addonId]
            )
          } catch (err) {
            console.error(`Error adding addon ${addonId} to product:`, err)
          }
        }
      }
    }

    // Fetch updated product with add-ons
    const addOnsResult = await pool.query(
      `SELECT a.id, a.name, a.price, a.description, a.icon, a.sort_order, a.status
       FROM add_ons a
       INNER JOIN product_addons pa ON a.id = pa.addon_id
       WHERE pa.product_id = $1
       ORDER BY a.sort_order ASC`,
      [id]
    )

    product.addOns = addOnsResult.rows

    res.json(successResponse(product, 'Produk berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Delete product
 * DELETE /api/v1/products/:id
 */
export const deleteProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    // Check if product exists
    const existingProduct = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [id]
    )

    if (existingProduct.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Produk tidak ditemukan', 404)
    }

    await pool.query('DELETE FROM products WHERE id = $1', [id])

    res.json(successResponse(null, 'Produk berhasil dihapus'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update product status
 * PATCH /api/v1/products/:id/status
 */
export const updateProductStatus = async (
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
      `UPDATE products
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Produk tidak ditemukan', 404)
    }

    res.json(successResponse(result.rows[0], 'Status produk berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Update product stock
 * PATCH /api/v1/products/:id/stock
 */
export const updateProductStock = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params
    const { stock, adjustment, type = 'set' } = req.body

    // Check if product exists
    const existingProduct = await pool.query(
      'SELECT stock FROM products WHERE id = $1',
      [id]
    )

    if (existingProduct.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Produk tidak ditemukan', 404)
    }

    let newStock: number

    if (type === 'set') {
      newStock = parseInt(stock || 0)
    } else if (type === 'add') {
      newStock = existingProduct.rows[0].stock + parseInt(adjustment || 0)
    } else if (type === 'subtract') {
      newStock = existingProduct.rows[0].stock - parseInt(adjustment || 0)
    } else {
      throw new AppError('VALIDATION_ERROR', 'Type harus set, add, atau subtract', 400)
    }

    if (newStock < 0) {
      throw new AppError('VALIDATION_ERROR', 'Stok tidak boleh negatif', 400)
    }

    const result = await pool.query(
      `UPDATE products
       SET stock = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newStock, id]
    )

    res.json(successResponse(result.rows[0], 'Stok produk berhasil diupdate'))
  } catch (error) {
    next(error)
  }
}

/**
 * Get low stock products
 * GET /api/v1/products/low-stock
 */
export const getLowStockProducts = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        c.name as category_name,
        c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.stock < p.min_stock
      ORDER BY p.stock ASC
    `)

    res.json(successResponse(result.rows))
  } catch (error) {
    next(error)
  }
}
