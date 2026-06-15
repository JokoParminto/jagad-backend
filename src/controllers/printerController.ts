import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { successResponse } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../middleware/auth";
import {
  CreatePrinterRequest,
  UpdatePrinterRequest,
  CreatePrinterTemplateRequest,
  UpdatePrinterTemplateRequest,
  UpdatePrinterRoutingRequest,
} from "../types";
import * as printerTemplateService from "../services/printerTemplateService";

/**
 * Get all printers
 * GET /api/v1/printers
 */
export const getAllPrinters = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, type } = req.query;

    let query = "SELECT * FROM printers WHERE 1=1";
    const params: any[] = [];
    let paramCount = 1;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (type) {
      query += ` AND printer_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    query += " ORDER BY is_default DESC, name ASC";

    const result = await pool.query(query, params);

    res.json(successResponse(result.rows));
  } catch (error) {
    next(error);
  }
};

/**
 * Get printer by ID
 * GET /api/v1/printers/:id
 */
export const getPrinterById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM printers WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Printer tidak ditemukan", 404);
    }

    res.json(successResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

/**
 * Create new printer
 * POST /api/v1/printers
 */
export const createPrinter = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      name,
      description,
      printer_type,
      connection_type,
      paper_width,
      font_size = 12,
      is_default = false,
      auto_print = false,
      device_path,
    }: CreatePrinterRequest = req.body;

    // Validation
    if (!name || !printer_type || !connection_type) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Nama, jenis printer, dan tipe koneksi harus diisi",
        400,
      );
    }

    // Validation for paper_width
    if (!paper_width) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Lebar kertas (paper_width) harus diisi",
        400,
      );
    }

    // Note: Printer names are NOT unique - multiple printers can have the same name

    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        "UPDATE printers SET is_default = false WHERE printer_type = $1",
        [printer_type],
      );
    }

    const result = await pool.query(
      `INSERT INTO printers (
         name, description, printer_type, connection_type,
         paper_width, font_size,
         is_default, auto_print, device_path, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING *`,
      [
        name,
        description,
        printer_type,
        connection_type,
        paper_width,
        font_size,
        is_default,
        auto_print,
        device_path ?? null,
      ],
    );

    // Log action
    await pool.query(
      `INSERT INTO printer_audit_logs (printer_id, action, changed_by)
       VALUES ($1, $2, $3)`,
      [result.rows[0].id, "CREATE", req.user?.id],
    );

    // Auto-create template from masterdata for this printer
    try {
      await printerTemplateService.createTemplateFromMasterdata(
        result.rows[0].id,
        printer_type as "receipt" | "barista",
      );
    } catch (templateError) {
      console.error(
        "Warning: Failed to create auto-template for new printer:",
        templateError,
      );
      // Don't fail the printer creation if template creation fails
      // But log it for debugging
    }

    res
      .status(201)
      .json(successResponse(result.rows[0], "Printer berhasil dibuat"));
  } catch (error) {
    next(error);
  }
};

/**
 * Update printer
 * PUT /api/v1/printers/:id
 */
export const updatePrinter = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const updates: UpdatePrinterRequest = req.body;

    // Check if printer exists
    const existingPrinter = await pool.query(
      "SELECT * FROM printers WHERE id = $1",
      [id],
    );

    if (existingPrinter.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Printer tidak ditemukan", 404);
    }

    // Note: Printer names are NOT unique - no duplicate check needed

    // Check if printer_type is being changed
    const printerTypeChanged =
      updates.printer_type &&
      updates.printer_type !== existingPrinter.rows[0].printer_type;

    // If setting as default, unset other defaults of same type
    if (updates.is_default) {
      await pool.query(
        "UPDATE printers SET is_default = false WHERE printer_type = $1 AND id != $2",
        [existingPrinter.rows[0].printer_type, id],
      );
    }

    const ALLOWED_COLUMNS = new Set([
      'name', 'description', 'printer_type', 'connection_type',
      'paper_width', 'font_size', 'status', 'is_default', 'auto_print', 'device_path',
    ]);

    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k, v]) => ALLOWED_COLUMNS.has(k) && v !== undefined),
    );

    if (Object.keys(safeUpdates).length === 0) {
      res.json(successResponse(existingPrinter.rows[0], "Tidak ada perubahan"));
      return;
    }

    const updateFields = Object.keys(safeUpdates)
      .map((key, idx) => `${key} = $${idx + 1}`)
      .join(", ");

    const values = Object.values(safeUpdates);
    values.push(id);

    const result = await pool.query(
      `UPDATE printers SET ${updateFields} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    // If printer type changed, delete old template and create new one from masterdata
    if (printerTypeChanged) {
      try {
        await printerTemplateService.replaceTemplateOnTypeChange(
          id,
          updates.printer_type as "receipt" | "barista",
        );
      } catch (templateError) {
        console.error(
          "Warning: Failed to update template on type change:",
          templateError,
        );
        // Don't fail the printer update if template handling fails
      }
    }

    // Log action
    await pool.query(
      `INSERT INTO printer_audit_logs (printer_id, action, changes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, "UPDATE", JSON.stringify(updates), req.user?.id],
    );

    res.json(successResponse(result.rows[0], "Printer berhasil diperbarui"));
  } catch (error) {
    next(error);
  }
};

/**
 * Delete printer
 * DELETE /api/v1/printers/:id
 */
export const deletePrinter = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    // Check if printer exists
    const result = await pool.query("SELECT * FROM printers WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Printer tidak ditemukan", 404);
    }

    // Log action BEFORE deleting (to avoid foreign key constraint violation)
    await pool.query(
      `INSERT INTO printer_audit_logs (printer_id, action, changed_by)
       VALUES ($1, $2, $3)`,
      [id, "DELETE", req.user?.id],
    );

    // Delete printer
    await pool.query("DELETE FROM printers WHERE id = $1", [id]);

    res.json(successResponse(null, "Printer berhasil dihapus"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get printer status
 * GET /api/v1/printers/:id/status
 */
export const getPrinterStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, status, last_used_at,
              (SELECT status FROM printer_jobs WHERE printer_id = $1 ORDER BY created_at DESC LIMIT 1) as last_job_status
       FROM printers WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Printer tidak ditemukan", 404);
    }

    res.json(successResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

/**
 * Get all printer templates
 * GET /api/v1/printer-templates
 */
export const getAllTemplates = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { template_type, is_active } = req.query;

    // Join with printers table to include printer info
    let query = `
      SELECT 
        pt.id,
        pt.name as template_name,
        pt.description as template_description,
        pt.template_type,
        pt.content,
        pt.preview_content,
        pt.is_default,
        pt.is_active,
        pt.created_at,
        pt.updated_at,
        p.id as printer_id,
        p.name as printer_name,
        p.printer_type,
        p.status as printer_status,
        p.description as printer_description,
        p.paper_width,
        p.paper_height,
        p.dpi,
        p.font_size,
        p.connection_type,
        p.ip_address,
        p.port_number,
        p.device_path
      FROM printer_templates pt
      LEFT JOIN printers p ON pt.id_printer = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (template_type) {
      query += ` AND pt.template_type = $${paramCount}`;
      params.push(template_type);
      paramCount++;
    }

    if (is_active !== undefined) {
      query += ` AND pt.is_active = $${paramCount}`;
      params.push(is_active === "true");
      paramCount++;
    }

    query += " ORDER BY pt.is_default DESC, pt.name ASC";

    const result = await pool.query(query, params);

    res.json(successResponse(result.rows));
  } catch (error) {
    next(error);
  }
};

/**
 * Get template by ID
 * GET /api/v1/printer-templates/:id
 * Returns template data joined with printer info
 */
export const getTemplateById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        pt.id,
        pt.name as template_name,
        pt.description as template_description,
        pt.template_type,
        pt.content,
        pt.preview_content,
        pt.is_default,
        pt.is_active,
        pt.created_at,
        pt.updated_at,
        p.id as printer_id,
        p.name as printer_name,
        p.printer_type,
        p.status as printer_status,
        p.description as printer_description,
        p.paper_width,
        p.dpi,
        p.font_size,
        p.connection_type
      FROM printer_templates pt
      LEFT JOIN printers p ON pt.id_printer = p.id
      WHERE pt.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Template tidak ditemukan", 404);
    }

    res.json(successResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

/**
 * Create printer template
 * POST /api/v1/printer-templates
 */
export const createTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      name,
      description,
      template_type,
      content,
      is_default = false,
    }: CreatePrinterTemplateRequest = req.body;

    if (!name || !template_type || !content) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Nama, jenis template, dan konten harus diisi",
        400,
      );
    }

    // If setting as default, unset other defaults of same type
    if (is_default) {
      await pool.query(
        "UPDATE printer_templates SET is_default = false WHERE template_type = $1",
        [template_type],
      );
    }

    const result = await pool.query(
      `INSERT INTO printer_templates (name, description, template_type, content, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [name, description, template_type, JSON.stringify(content), is_default],
    );

    res
      .status(201)
      .json(successResponse(result.rows[0], "Template berhasil dibuat"));
  } catch (error) {
    next(error);
  }
};

/**
 * Update printer template
 * PUT /api/v1/printer-templates/:id
 */
export const updateTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const updates: UpdatePrinterTemplateRequest = req.body;

    // Check if template exists
    const existingTemplate = await pool.query(
      "SELECT * FROM printer_templates WHERE id = $1",
      [id],
    );

    if (existingTemplate.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Template tidak ditemukan", 404);
    }

    const updateFields = Object.keys(updates)
      .map((key, idx) => {
        if (key === "content") {
          return `${key} = $${idx + 1}::jsonb`;
        }
        return `${key} = $${idx + 1}`;
      })
      .join(", ");

    const values = Object.values(updates).map((val) =>
      typeof val === "object" ? JSON.stringify(val) : val,
    );
    values.push(id);

    const result = await pool.query(
      `UPDATE printer_templates SET ${updateFields} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    res.json(successResponse(result.rows[0], "Template berhasil diperbarui"));
  } catch (error) {
    next(error);
  }
};

/**
 * Delete printer template
 * DELETE /api/v1/printer-templates/:id
 */
export const deleteTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    // Check if template exists
    const result = await pool.query(
      "SELECT * FROM printer_templates WHERE id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError("NOT_FOUND", "Template tidak ditemukan", 404);
    }

    // Delete template
    await pool.query("DELETE FROM printer_templates WHERE id = $1", [id]);

    res.json(successResponse(null, "Template berhasil dihapus"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get print jobs history
 * GET /api/v1/printer-jobs
 */
export const getPrintJobs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { printer_id, status, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM printer_jobs WHERE 1=1`;
    const params: any[] = [];
    let paramCount = 1;

    if (printer_id) {
      query += ` AND printer_id = $${paramCount}`;
      params.push(printer_id);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${
      paramCount + 1
    }`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM printer_jobs WHERE 1=1";
    const countParams: any[] = [];
    let countParamCount = 1;

    if (printer_id) {
      countQuery += ` AND printer_id = $${countParamCount}`;
      countParams.push(printer_id);
      countParamCount++;
    }

    if (status) {
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
      countParamCount++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json(
      successResponse({
        data: result.rows,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      }),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Create print job (test print)
 * POST /api/v1/printer-jobs
 */
export const createPrintJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { printer_id, template_id, job_type = "test", content } = req.body;

    if (!printer_id || !job_type) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Printer ID dan job type harus diisi",
        400,
      );
    }

    const result = await pool.query(
      `INSERT INTO printer_jobs (printer_id, template_id, job_type, content, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        printer_id,
        template_id,
        job_type,
        JSON.stringify(content),
        req.user?.id,
      ],
    );

    res
      .status(201)
      .json(successResponse(result.rows[0], "Print job berhasil dibuat"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get printer routing configuration
 * GET /api/v1/printer-routing
 */
export const getPrinterRouting = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await pool.query(
      `SELECT pr.*, p.name as printer_name, pt.name as template_name
       FROM printer_routing pr
       LEFT JOIN printers p ON pr.printer_id = p.id
       LEFT JOIN printer_templates pt ON pr.template_id = pt.id`,
    );

    res.json(successResponse(result.rows));
  } catch (error) {
    next(error);
  }
};

/**
 * Update printer routing
 * PUT /api/v1/printer-routing/:print_type
 */
export const updatePrinterRouting = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { print_type } = req.params;
    const updates: UpdatePrinterRoutingRequest = req.body;

    // Check if routing exists
    const existingRouting = await pool.query(
      "SELECT * FROM printer_routing WHERE print_type = $1",
      [print_type],
    );

    if (existingRouting.rows.length === 0) {
      // Create new routing
      const result = await pool.query(
        `INSERT INTO printer_routing (print_type, printer_id, template_id, is_enabled, auto_print, print_copies)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          print_type,
          updates.printer_id,
          updates.template_id,
          updates.is_enabled ?? true,
          updates.auto_print ?? false,
          updates.print_copies ?? 1,
        ],
      );

      return res
        .status(201)
        .json(successResponse(result.rows[0], "Routing berhasil dibuat"));
    }

    // Update existing routing
    const updateFields = Object.keys(updates)
      .map((key, idx) => `${key} = $${idx + 1}`)
      .join(", ");

    const values = Object.values(updates);
    values.push(print_type);

    const result = await pool.query(
      `UPDATE printer_routing SET ${updateFields} WHERE print_type = $${values.length} RETURNING *`,
      values,
    );

    return res.json(
      successResponse(result.rows[0], "Routing berhasil diperbarui"),
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * Get template for specific printer (per-printer customization)
 * GET /api/v1/printers/:id/template
 */
export const getPrinterTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: printerId } = req.params;

    // Get template data with all printer info via JOIN
    const result = await pool.query(
      `SELECT 
        -- Template fields
        pt.id as template_id,
        pt.name as template_name,
        pt.description as template_description,
        pt.template_type,
        pt.content,
        pt.preview_content,
        pt.is_default as template_is_default,
        pt.is_active as template_is_active,
        pt.created_at as template_created_at,
        pt.updated_at as template_updated_at,
        
        -- Printer fields
        p.id,
        p.name,
        p.description,
        p.printer_type,
        p.connection_type,
        p.paper_width,
        p.font_size,
        p.is_default,
        p.auto_print,
        p.status,
        p.last_used_at,
        p.created_at,
        p.updated_at
      FROM printer_templates pt
      LEFT JOIN printers p ON pt.id_printer = p.id
      WHERE pt.id_printer = $1 AND pt.is_active = true`,
      [printerId],
    );

    if (result.rows.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        `Template untuk printer ID '${printerId}' tidak ditemukan`,
        404,
      );
    }

    res.json(successResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

/**
 * Update template for specific printer (per-printer customization)
 * PUT /api/v1/printers/:id/template
 *
 * Flow:
 * 1. Save content to printer_templates
 * 2. Auto-sync preview_content based on content toggles
 * 3. Return both content + preview_content
 */
export const updatePrinterTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: printerId } = req.params;
    const { content } = req.body;

    if (!content) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Konten template harus diisi",
        400,
      );
    }

    // 1. Update content
    await printerTemplateService.updateTemplateByPrinterId(printerId, content);

    // 2. Auto-sync preview_content based on updated content
    const syncedTemplate =
      await printerTemplateService.syncPreviewContent(printerId);

    // 3. Return updated template with both content + preview_content
    res.json(
      successResponse(syncedTemplate, "Template printer berhasil diperbarui"),
    );
  } catch (error) {
    next(error);
  }
};
