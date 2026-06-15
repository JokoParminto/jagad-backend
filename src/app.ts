import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config/env'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/logger'
import { globalLimiter } from './middleware/rateLimiter'
import routes from './routes'

const app = express()

// Security middleware
app.use(helmet())
app.disable('etag')  // Disable ETag to prevent 304 Not Modified responses
const corsOptions = {
  origin: true,
  credentials: true,
}
app.options('*', cors(corsOptions))
app.use(cors(corsOptions))

// Rate limiting (only apply in production or if explicitly needed)
// For single coffee shop setup: rate limiting is disabled
if (config.env === 'production') {
  app.use('/api', globalLimiter)
  console.log('[Rate Limit] Enabled for production environment')
}

// Body parser
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging
app.use(requestLogger)

// Static files (for uploads)
app.use('/uploads', express.static(config.upload.path))

// API Routes
app.use(`/api/${config.apiVersion}`, routes)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: config.env })
})
app.get('/api', (_req, res) => {
  res.json({ status: 'ok', app: 'POS JAGAD API', version: config.apiVersion })
})

// 404 handler
app.use(notFoundHandler)

// Error handler (must be last)
app.use(errorHandler)

export default app
