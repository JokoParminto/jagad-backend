import rateLimit from 'express-rate-limit'
import { config } from '../config/env'

/**
 * Global Rate Limiter
 * - Default: Applied to all /api routes
 * - Development: 1000 requests per 60 minutes
 * - Production: Adjust RATE_LIMIT_MAX in .env
 */
export const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak request, coba lagi nanti'
    }
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health'
  }
})

/**
 * Strict Rate Limiter (for auth endpoints)
 * - 5 attempts per 15 minutes per IP
 * - Prevents brute force attacks
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak attempt login, coba lagi dalam 15 menit'
    }
  },
  skipSuccessfulRequests: true // Don't count successful requests
})

/**
 * Relaxed Rate Limiter (for read-heavy endpoints)
 * - 200 requests per 5 minutes
 * - For GET endpoints that are frequently accessed
 */
export const relaxedLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak request, coba lagi nanti'
    }
  }
})

/**
 * Transaction Rate Limiter (for critical operations)
 * - 50 requests per 5 minutes
 * - For POST/PUT endpoints (create/update transactions)
 */
export const transactionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak transaksi, coba lagi setelah beberapa menit'
    }
  }
})

/**
 * Download Rate Limiter (for file exports)
 * - 10 requests per 5 minutes
 * - For report/export endpoints
 */
export const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak download, coba lagi setelah beberapa menit'
    }
  }
})
