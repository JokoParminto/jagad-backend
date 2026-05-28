import jwt from 'jsonwebtoken'
import { config } from '../config/env'

interface TokenPayload {
  id: string
  username: string
  role: string
  permissions: string[]
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as string | number,
  } as jwt.SignOptions)
}

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as string | number,
  } as jwt.SignOptions)
}

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload
  } catch (error) {
    throw new Error('Invalid or expired refresh token')
  }
}
