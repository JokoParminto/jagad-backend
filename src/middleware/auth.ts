import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { errorResponse } from '../utils/response'

export interface AuthRequest extends Request {
  user?: {
    id: string
    username: string
    role: string
    permissions: string[]
  }
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'Token tidak ditemukan')
      )
      return
    }

    const token = authHeader.split(' ')[1]

    if (!token) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'Token tidak valid')
      )
      return
    }

    const decoded = verifyToken(token)
    req.user = decoded

    next()
  } catch (error: any) {
    res.status(401).json(
      errorResponse('UNAUTHORIZED', 'Token tidak valid atau expired')
    )
  }
}
