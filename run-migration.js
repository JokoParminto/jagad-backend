const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'jagad-pos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...\n');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'src/database/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${migrationFiles.length} migration files:\n`);

    // Get already executed migrations
    const executedResult = await client.query('SELECT filename FROM migrations');
    const executedMigrations = new Set(executedResult.rows.map(row => row.filename));

    // Run migrations in order
    for (const file of migrationFiles) {
      if (executedMigrations.has(file)) {
        console.log(`   ⏭  ${file} (already executed)\n`);
        continue;
      }

      console.log(`   ▶ Running ${file}...`);
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        console.log(`   ✅ ${file} completed\n`);
      } catch (error) {
        console.error(`   ❌ ${file} failed:`, error.message);
        throw error;
      }
    }

    console.log('✅ All migrations completed successfully!\n');

    // Verify tables created
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📊 Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    console.log('');

    // Check default admin
    const adminResult = await client.query('SELECT username, role FROM users');
    if (adminResult.rows.length > 0) {
      console.log('👤 Default users:');
      adminResult.rows.forEach(user => {
        console.log(`   - ${user.username} (${user.role})`);
      });
      console.log('');
    }

    // Check permissions
    const permResult = await client.query('SELECT name FROM permissions ORDER BY name');
    if (permResult.rows.length > 0) {
      console.log('🔐 Permissions:');
      permResult.rows.forEach(perm => {
        console.log(`   - ${perm.name}`);
      });
      console.log('');
    }

    console.log('🎉 Database ready! You can now start the server with: npm run dev');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
