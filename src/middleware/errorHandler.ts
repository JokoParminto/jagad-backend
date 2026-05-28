import { Request, Response, NextFunction } from 'express'
import { errorResponse } from '../utils/response'

export class AppError extends Error {
  statusCode: number
  code: string
  details?: any

  constructor(code: string, message: string, statusCode: number = 500, details?: any) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace(this, this.constructor)
  }
}

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Log error
  console.error('❌ Error:', {
    code: err.code,
    message: err.message,
    stack: err.stack,
  })

  // Default error values
  let statusCode = err.statusCode || 500
  let code = err.code || 'INTERNAL_ERROR'
  let message = err.message || 'Internal server error'
  let details = err.details

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400
    code = 'VALIDATION_ERROR'
    message = 'Validation failed'
    details = err.errors
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409
    code = 'DUPLICATE_ENTRY'
    message = 'Data sudah ada'
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400
    code = 'INVALID_REFERENCE'
    message = 'Referensi data tidak valid'
  }

  if (err.code === '22P02') { // PostgreSQL invalid text representation
    statusCode = 400
    code = 'INVALID_DATA'
    message = 'Format data tidak valid'
  }

  res.status(statusCode).json(errorResponse(code, message, details))
}

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json(
    errorResponse('NOT_FOUND', `Endpoint ${req.method} ${req.path} tidak ditemukan`)
  )
}
