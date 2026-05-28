import app from './app'
import { config } from './config/env'
import { pool, initializeDatabase } from './config/database'
import { logger } from './middleware/logger'

const PORT = config.port

const startServer = async () => {
  try {
    // Initialize database (set timezone, etc)
    await initializeDatabase()

    // Test database connection
    await pool.query('SELECT NOW()')
    logger.info('✅ Database connected successfully')

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`)
      logger.info(`📍 Environment: ${config.env}`)
      logger.info(`🔗 API Base URL: http://localhost:${PORT}/api/${config.apiVersion}`)
      logger.info(`💚 Health Check: http://localhost:${PORT}/health`)

      console.log('\n' + '='.repeat(60))
      console.log(`  🎯 Sederek Kasir Backend Server`)
      console.log(`  📡 Running on: http://localhost:${PORT}`)
      console.log(`  🌍 Environment: ${config.env}`)
      console.log(`  📚 API Docs: See BACKEND-DESIGN.md`)
      console.log('='.repeat(60) + '\n')
    })
  } catch (error) {
    logger.error('❌ Failed to start server:', error)
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Rejection:', err)
  console.error('Unhandled Rejection:', err)
  process.exit(1)
})

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err)
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server')
  await pool.end()
  process.exit(0)
})

startServer()
