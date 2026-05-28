import { pool } from '../config/database'
import { AppError } from '../middleware/errorHandler'

export interface MasterdataTemplate {
  id: string
  name: string
  printer_type: 'receipt' | 'barista'
  content: Record<string, any>
  preview_content: Record<string, any>
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Get masterdata template by printer type
 * @param printerType - Type of printer ('receipt' or 'barista')
 * @returns Complete masterdata template with JSONB content
 */
export const getMasterdataTemplateByType = async (
  printerType: 'receipt' | 'barista'
): Promise<MasterdataTemplate> => {
  try {
    const result = await pool.query(
      'SELECT * FROM printer_masterdata_template WHERE printer_type = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1',
      [printerType]
    )

    if (result.rows.length === 0) {
      throw new AppError(
        'NOT_FOUND',
        `Masterdata template untuk tipe printer '${printerType}' tidak ditemukan`,
        404
      )
    }

    return result.rows[0] as MasterdataTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengambil masterdata template',
      500
    )
  }
}

/**
 * Get all masterdata templates
 * @returns All active masterdata templates
 */
export const getAllMasterdataTemplates = async (): Promise<MasterdataTemplate[]> => {
  try {
    const result = await pool.query(
      'SELECT * FROM printer_masterdata_template WHERE is_active = true ORDER BY printer_type, created_at ASC'
    )

    return result.rows as MasterdataTemplate[]
  } catch (error) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengambil semua masterdata template',
      500
    )
  }
}

/**
 * Get masterdata template by ID
 * @param id - Template ID
 * @returns Masterdata template with matching ID
 */
export const getMasterdataTemplateById = async (id: string): Promise<MasterdataTemplate> => {
  try {
    const result = await pool.query(
      'SELECT * FROM printer_masterdata_template WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Masterdata template tidak ditemukan', 404)
    }

    return result.rows[0] as MasterdataTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengambil masterdata template',
      500
    )
  }
}

/**
 * Create new masterdata template (manual DB insertion - no UI needed)
 * @param name - Template name
 * @param printerType - Printer type ('receipt' or 'barista')
 * @param content - JSONB template content
 * @param description - Optional description
 * @returns Created masterdata template
 */
export const createMasterdataTemplate = async (
  name: string,
  printerType: 'receipt' | 'barista',
  content: Record<string, any>,
  description?: string
): Promise<MasterdataTemplate> => {
  try {
    const result = await pool.query(
      `INSERT INTO printer_masterdata_template (name, printer_type, content, description, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [name, printerType, JSON.stringify(content), description]
    )

    return result.rows[0] as MasterdataTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal membuat masterdata template',
      500
    )
  }
}

/**
 * Update masterdata template (manual DB updates - no UI needed)
 * @param id - Template ID
 * @param updates - Fields to update
 * @returns Updated masterdata template
 */
export const updateMasterdataTemplate = async (
  id: string,
  updates: Partial<Omit<MasterdataTemplate, 'id' | 'created_at' | 'updated_at'>>
): Promise<MasterdataTemplate> => {
  try {
    // Check if template exists
    await getMasterdataTemplateById(id)

    const updateFields = Object.keys(updates)
      .map((key, idx) => {
        if (key === 'content') {
          return `${key} = $${idx + 1}::jsonb`
        }
        return `${key} = $${idx + 1}`
      })
      .join(', ')

    const values = Object.values(updates).map((val) =>
      typeof val === 'object' ? JSON.stringify(val) : val
    )
    values.push(id)

    const result = await pool.query(
      `UPDATE printer_masterdata_template SET ${updateFields} WHERE id = $${values.length} RETURNING *`,
      values
    )

    return result.rows[0] as MasterdataTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengupdate masterdata template',
      500
    )
  }
}

/**
 * Delete masterdata template (manual DB deletion - no UI needed)
 * @param id - Template ID
 */
export const deleteMasterdataTemplate = async (id: string): Promise<void> => {
  try {
    // Check if template exists
    await getMasterdataTemplateById(id)

    await pool.query('DELETE FROM printer_masterdata_template WHERE id = $1', [id])
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal menghapus masterdata template',
      500
    )
  }
}
