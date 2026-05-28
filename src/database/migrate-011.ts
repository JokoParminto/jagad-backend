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

async function runMigration() {
  const client = await pool.connect()
  try {
    console.log('🚀 Running migration 011...')

    const migrationFile = path.join(__dirname, '..', '..', 'src', 'database', 'migrations', '011_create_transaction_temporary_item_add_ons.sql')
    const sql = fs.readFileSync(migrationFile, 'utf-8')

    console.log('⏳ Executing: 011_create_transaction_temporary_item_add_ons.sql')
    await client.query(sql)
    console.log('✅ Migration 011 completed successfully!')
    console.log('✨ Table "transaction_temporary_item_add_ons" created!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await client.release()
    await pool.end()
  }
}

runMigration()
