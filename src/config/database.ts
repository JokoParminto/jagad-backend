import { Pool, QueryResult, types } from 'pg'
import { config } from './env'

// TIMESTAMP WITHOUT TIME ZONE (OID 1114) — session tz is Asia/Jakarta,
// so all stored values are WIB wall-clock times. Parse explicitly as +07:00
// so result is a correct UTC Date regardless of Node.js process timezone.
types.setTypeParser(1114, (val: string) => {
  if (!val) return null
  return new Date(val.replace(' ', 'T') + '+07:00')
})

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Set timezone on every new pooled connection so CURRENT_TIMESTAMP, DATE(), etc.
// all operate in Asia/Jakarta regardless of which pool connection is used.
pool.on('connect', (client) => {
  client.query("SET timezone = 'Asia/Jakarta'")
    .then(() => console.log('✅ DB connection established (tz: Asia/Jakarta)'))
    .catch((err: Error) => console.error('❌ Failed to set timezone on new connection:', err))
})

// Initialize timezone on database connection
export const initializeDatabase = async (): Promise<void> => {
  try {
    console.log('🔧 Initializing database...')
    // Test connection and set timezone
    const client = await pool.connect()
    try {
      await client.query("SET timezone = 'Asia/Jakarta'")
      console.log('🕐 Database timezone set to Asia/Jakarta (UTC+7)')
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error)
    throw error
  }
}

pool.on('error', (err: Error) => {
  console.error('❌ Unexpected database error:', err)
  process.exit(-1)
})

export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log('📊 Query executed', { text, duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error('❌ Query error:', error)
    throw error
  }
}

export const getClient = async () => {
  const client = await pool.connect()
  const originalQuery = client.query
  const originalRelease = client.release

  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!')
  }, 5000)

  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args: any[]) => {
    return (originalQuery as any).apply(client, args)
  }

  client.release = () => {
    clearTimeout(timeout)
    client.query = originalQuery
    client.release = originalRelease
    return originalRelease.apply(client)
  }

  return client
}
