import { pool } from '../config/database'
import { AppError } from '../middleware/errorHandler'
import { getMasterdataTemplateByType } from './printerMasterdataTemplateService'

export interface PrinterTemplate {
  id: string
  name: string
  description?: string
  template_type: 'receipt' | 'barista'
  id_printer: string
  content: Record<string, any>
  preview_content?: Record<string, any>
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Get template for a specific printer
 * If template doesn't exist, auto-create it from masterdata
 * @param printerId - ID of the printer
 * @returns Template linked to this printer
 */
export const getTemplateByPrinterId = async (printerId: string): Promise<PrinterTemplate> => {
  try {
    const result = await pool.query(
      `SELECT pt.* FROM printer_templates pt
       WHERE pt.id_printer = $1 AND pt.is_active = true
       LIMIT 1`,
      [printerId]
    )

    if (result.rows.length === 0) {
      // Template doesn't exist for this printer
      // Get printer to determine its type
      const printerResult = await pool.query(
        'SELECT printer_type FROM printers WHERE id = $1',
        [printerId]
      )

      if (printerResult.rows.length === 0) {
        throw new AppError(
          'NOT_FOUND',
          `Printer dengan ID '${printerId}' tidak ditemukan`,
          404
        )
      }

      const printerType = printerResult.rows[0].printer_type as 'receipt' | 'barista'
      
      // Auto-create template from masterdata (lazy creation)
      console.log(`[getTemplateByPrinterId] Template not found for printer ${printerId}, auto-creating from masterdata (${printerType})`)
      const newTemplate = await createTemplateFromMasterdata(printerId, printerType)
      return newTemplate
    }

    return result.rows[0] as PrinterTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengambil template printer',
      500
    )
  }
}

/**
 * Create template for a printer from masterdata template
 * This function:
 * 1. Gets the masterdata template matching the printer type
 * 2. Copies the content to a new printer_templates record
 * 3. Links it to the specific printer via id_printer FK
 * 
 * @param printerId - ID of the printer
 * @param printerType - Type of printer ('receipt' or 'barista')
 * @returns Created printer template
 */
export const createTemplateFromMasterdata = async (
  printerId: string,
  printerType: 'receipt' | 'barista'
): Promise<PrinterTemplate> => {
  try {
    // Get masterdata template
    const masterdataTemplate = await getMasterdataTemplateByType(printerType)

    // Get printer to ensure it exists and get its name for template naming
    const printerResult = await pool.query(
      'SELECT name FROM printers WHERE id = $1',
      [printerId]
    )

    if (printerResult.rows.length === 0) {
      throw new AppError('NOT_FOUND', `Printer dengan ID '${printerId}' tidak ditemukan`, 404)
    }

    const printerName = printerResult.rows[0].name

    // Create template name: "{printerName} - {masterdata_name}"
    const templateName = `${printerName} - ${masterdataTemplate.name}`

    // Insert into printer_templates with id_printer FK (copy both content AND preview_content)
    const result = await pool.query(
      `INSERT INTO printer_templates (
        name, 
        description, 
        template_type, 
        id_printer, 
        content,
        preview_content,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [
        templateName,
        `Template untuk printer ${printerName}`,
        printerType,
        printerId,
        JSON.stringify(masterdataTemplate.content), // Copy content from masterdata
        JSON.stringify(masterdataTemplate.preview_content), // Copy preview_content from masterdata
      ]
    )

    return result.rows[0] as PrinterTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal membuat template dari masterdata',
      500
    )
  }
}

/**
 * Update template content for a specific printer
 * @param printerId - ID of the printer
 * @param content - New JSONB content
 * @returns Updated printer template
 */
export const updateTemplateByPrinterId = async (
  printerId: string,
  content: Record<string, any>
): Promise<PrinterTemplate> => {
  try {
    // Ensure template exists for this printer
    await getTemplateByPrinterId(printerId)

    const result = await pool.query(
      `UPDATE printer_templates 
       SET content = $1::jsonb 
       WHERE id_printer = $2 
       RETURNING *`,
      [JSON.stringify(content), printerId]
    )

    if (result.rows.length === 0) {
      throw new AppError(
        'NOT_FOUND',
        `Template untuk printer ID '${printerId}' tidak ditemukan`,
        404
      )
    }

    return result.rows[0] as PrinterTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengupdate template printer',
      500
    )
  }
}

/**
 * Delete template for a specific printer
 * Used when changing printer type to create a new template
 * @param printerId - ID of the printer
 */
export const deleteTemplateByPrinterId = async (printerId: string): Promise<void> => {
  try {
    const result = await pool.query(
      'DELETE FROM printer_templates WHERE id_printer = $1',
      [printerId]
    )

    if (result.rowCount === 0) {
      console.warn(`No template found to delete for printer ID '${printerId}'`)
    }
  } catch (error) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal menghapus template printer',
      500
    )
  }
}

/**
 * Get all templates for a specific printer type
 * Useful for admin listing templates
 * @param printerType - Type of printer ('receipt' or 'barista')
 * @returns All templates for this printer type
 */
export const getTemplatesByType = async (
  printerType: 'receipt' | 'barista'
): Promise<PrinterTemplate[]> => {
  try {
    const result = await pool.query(
      `SELECT * FROM printer_templates 
       WHERE template_type = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [printerType]
    )

    return result.rows as PrinterTemplate[]
  } catch (error) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengambil templates berdasarkan tipe',
      500
    )
  }
}

/**
 * Replace printer template when type changes
 * This function:
 * 1. Deletes old template for the printer
 * 2. Creates new template from masterdata matching new type
 * 
 * @param printerId - ID of the printer
 * @param newPrinterType - New printer type
 * @returns New printer template
 */
export const replaceTemplateOnTypeChange = async (
  printerId: string,
  newPrinterType: 'receipt' | 'barista'
): Promise<PrinterTemplate> => {
  try {
    // Delete existing template for this printer
    await deleteTemplateByPrinterId(printerId)

    // Create new template from masterdata
    const newTemplate = await createTemplateFromMasterdata(printerId, newPrinterType)

    return newTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal mengganti template printer saat perubahan tipe',
      500
    )
  }
}

/**
 * Sync preview_content based on content configuration
 * When user changes content toggles (show_logo: true -> false), 
 * this function updates preview_content accordingly
 * 
 * Strategy: Keep all fields visible but based on show_xxx toggles,
 * sync the preview values (keep all fields for easier debugging)
 * 
 * @param printerId - ID of the printer
 * @returns Updated printer template
 */
export const syncPreviewContent = async (printerId: string): Promise<PrinterTemplate> => {
  try {
    // Get current template
    const template = await getTemplateByPrinterId(printerId)

    // Get masterdata template to use as reference for preview structure
    const masterdataTemplate = await getMasterdataTemplateByType(template.template_type as 'receipt' | 'barista')

    // Start with the masterdata preview_content as base
    const syncedPreviewContent = JSON.parse(JSON.stringify(masterdataTemplate.preview_content))

    // Sync based on content configuration
    // For Receipt template
    if (template.template_type === 'receipt') {
      const contentConfig = template.content as any
      const headerConfig = contentConfig.sections?.header || {}
      const itemsConfig = contentConfig.sections?.items || {}
      const paymentConfig = contentConfig.sections?.payment || {}
      const footerConfig = contentConfig.sections?.footer || {}

      // Sync header fields
      if (syncedPreviewContent.sections?.header && Array.isArray(syncedPreviewContent.sections.header)) {
        syncedPreviewContent.sections.header.forEach((headerField: any) => {
          if (headerField.show_logo !== undefined) {
            headerField.show_logo = headerConfig.show_logo !== false
          }
          if (headerField.show_store_name !== undefined) {
            headerField.show_store_name = headerConfig.show_store_name !== false
          }
          if (headerField.show_store_address !== undefined) {
            headerField.show_store_address = headerConfig.show_store_address !== false
          }
          if (headerField.show_date_time !== undefined) {
            headerField.show_date_time = headerConfig.show_date_time !== false
          }
          if (headerField.show_cashier !== undefined) {
            headerField.show_cashier = headerConfig.show_cashier !== false
          }
          if (headerField.show_customer_name !== undefined) {
            headerField.show_customer_name = headerConfig.show_customer_name !== false
          }
          if (headerField.show_table_number !== undefined) {
            headerField.show_table_number = headerConfig.show_table_number !== false
          }
        })
      }

      // Sync item fields
      if (syncedPreviewContent.sections?.items) {
        syncedPreviewContent.sections.items.show_quantity = itemsConfig.show_quantity !== false
        syncedPreviewContent.sections.items.show_item_discount = itemsConfig.show_item_discount !== false
        syncedPreviewContent.sections.items.show_add_ons = itemsConfig.show_add_ons !== false
      }

      // Sync payment fields
      if (syncedPreviewContent.sections?.payment) {
        syncedPreviewContent.sections.payment.show_subtotal = paymentConfig.show_subtotal !== false
        syncedPreviewContent.sections.payment.show_global_discount = paymentConfig.show_global_discount !== false
        syncedPreviewContent.sections.payment.show_grand_total = paymentConfig.show_grand_total !== false
        syncedPreviewContent.sections.payment.show_payment_method = paymentConfig.show_payment_method !== false
      }

      // Sync footer fields
      if (syncedPreviewContent.sections?.footer) {
        syncedPreviewContent.sections.footer.footer_text = footerConfig.footer_text || syncedPreviewContent.sections.footer.footer_text
      }

      // Sync store_info overrides (nama toko, alamat, logo, tagline)
      const storeInfo = (template.content as any).sections?.store_info
      if (storeInfo && syncedPreviewContent.sections?.header && Array.isArray(syncedPreviewContent.sections.header)) {
        syncedPreviewContent.sections.header = syncedPreviewContent.sections.header.map((field: any) => {
          if (field.store_name !== undefined && storeInfo.store_name)
            return { ...field, store_name: storeInfo.store_name }
          if (field.store_address !== undefined && storeInfo.store_address)
            return { ...field, store_address: storeInfo.store_address }
          if (field.store_phone !== undefined && storeInfo.store_phone)
            return { ...field, store_phone: storeInfo.store_phone }
          if (field.logo !== undefined && storeInfo.logo_url)
            return { ...field, logo: storeInfo.logo_url }
          return field
        })
        if (storeInfo.footer_text && syncedPreviewContent.sections?.footer) {
          syncedPreviewContent.sections.footer.footer_text = storeInfo.footer_text
        }
      }
    }
    // For Barista template
    else if (template.template_type === 'barista') {
      const contentConfig = template.content as any
      const headerConfig = contentConfig.sections?.header || {}
      const itemsConfig = contentConfig.sections?.items || {}
      const footerConfig = contentConfig.sections?.footer || {}

      // Sync header fields
      if (syncedPreviewContent.sections?.header && Array.isArray(syncedPreviewContent.sections.header)) {
        syncedPreviewContent.sections.header.forEach((headerField: any) => {
          if (headerField.show_queue_number !== undefined) {
            headerField.show_queue_number = headerConfig.show_queue_number !== false
          }
          if (headerField.show_table_number !== undefined) {
            headerField.show_table_number = headerConfig.show_table_number !== false
          }
          if (headerField.show_date_time !== undefined) {
            headerField.show_date_time = headerConfig.show_date_time !== false
          }
          if (headerField.show_customer_name !== undefined) {
            headerField.show_customer_name = headerConfig.show_customer_name !== false
          }
        })
      }

      // Sync item fields
      if (syncedPreviewContent.sections?.items) {
        syncedPreviewContent.sections.items.show_quantity = itemsConfig.show_quantity !== false
        syncedPreviewContent.sections.items.show_add_ons = itemsConfig.show_add_ons !== false
      }

      // Sync footer fields
      if (syncedPreviewContent.sections?.footer) {
        syncedPreviewContent.sections.footer.show_preparation_reminder = footerConfig.show_preparation_reminder !== false
        syncedPreviewContent.sections.footer.preparation_text = footerConfig.preparation_text || syncedPreviewContent.sections.footer.preparation_text
      }

      // Sync store_info for barista too
      const baristaStoreInfo = (template.content as any).sections?.store_info
      if (baristaStoreInfo && syncedPreviewContent.sections?.header && Array.isArray(syncedPreviewContent.sections.header)) {
        syncedPreviewContent.sections.header = syncedPreviewContent.sections.header.map((field: any) => {
          if (field.store_name !== undefined && baristaStoreInfo.store_name)
            return { ...field, store_name: baristaStoreInfo.store_name }
          if (field.logo !== undefined && baristaStoreInfo.logo_url)
            return { ...field, logo: baristaStoreInfo.logo_url }
          return field
        })
      }
    }

    // Update preview_content in database
    const result = await pool.query(
      `UPDATE printer_templates 
       SET preview_content = $1::jsonb 
       WHERE id_printer = $2 
       RETURNING *`,
      [JSON.stringify(syncedPreviewContent), printerId]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', `Template untuk printer ID '${printerId}' tidak ditemukan`, 404)
    }

    return result.rows[0] as PrinterTemplate
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Gagal menyinkronkan preview_content',
      500
    )
  }
}
