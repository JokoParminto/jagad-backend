import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'
import { config } from '../config/env'

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
})

async function runMigrations() {
  const client = await pool.connect()
  try {
    console.log('🚀 Starting migrations...')

    const migrationsDir = path.join(__dirname, '..', '..', 'src', 'database', 'migrations')
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file)
      const sql = fs.readFileSync(filePath, 'utf-8')

      console.log(`⏳ Running migration: ${file}`)
      try {
        await client.query(sql)
        console.log(`✅ Completed: ${file}`)
      } catch (error) {
        console.error(`❌ Error in migration ${file}:`, error)
        throw error
      }
    }

    console.log('✨ All migrations completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await client.release()
    await pool.end()
  }
}

runMigrations()
