import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { errorResponse } from '../utils/response'

/**
 * Check if user has one of the allowed roles
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'User tidak terautentikasi')
      )
      return
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json(
        errorResponse(
          'FORBIDDEN',
          'Anda tidak memiliki akses ke resource ini'
        )
      )
      return
    }

    next()
  }
}

/**
 * Check if user has specific permission
 */
export const checkPermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'User tidak terautentikasi')
      )
      return
    }

    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      res.status(403).json(
        errorResponse(
          'FORBIDDEN',
          `Permission '${permission}' diperlukan untuk akses ini`
        )
      )
      return
    }

    next()
  }
}

/**
 * Check if user is admin
 */
export const isAdmin = authorize('admin')

/**
 * Check if user is admin or manager
 */
export const isAdminOrManager = authorize('admin', 'manager')

/**
 * Alias for authorize (more semantic naming)
 */
export const requireRole = authorize

/**
 * Alias for checkPermission (more semantic naming)
 */
export const requirePermission = checkPermission
