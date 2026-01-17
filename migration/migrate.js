const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const config = {
  host: process.env.DB_HOST || 'mysql',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_NAME || 'zynk_db',
  multipleStatements: true
};

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || '/migrations';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDatabase(maxRetries = 30, retryInterval = 2000) {
  let connection;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to database (attempt ${i + 1}/${maxRetries})...`);
      connection = await mysql.createConnection(config);
      await connection.ping();
      console.log('Database connection established!');
      return connection;
    } catch (error) {
      console.log(`Connection failed: ${error.message}`);
      if (connection) {
        await connection.end().catch(() => {});
      }
      if (i < maxRetries - 1) {
        console.log(`Retrying in ${retryInterval / 1000} seconds...`);
        await sleep(retryInterval);
      }
    }
  }

  throw new Error('Could not connect to database after maximum retries');
}

async function createMigrationsTable(connection) {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64) NULL
    )
  `;

  await connection.execute(createTableSQL);
  console.log('Migrations table ready.');
}

async function getExecutedMigrations(connection) {
  const [rows] = await connection.execute('SELECT filename FROM _migrations');
  return new Set(rows.map(row => row.filename));
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`Migrations directory ${MIGRATIONS_DIR} does not exist.`);
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();

  return files;
}

function generateChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 64);
}

async function runMigration(connection, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  const checksum = generateChecksum(sql);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running migration: ${filename}`);
  console.log(`${'='.repeat(60)}`);

  try {
    await connection.query(sql);

    await connection.execute(
      'INSERT INTO _migrations (filename, checksum) VALUES (?, ?)',
      [filename, checksum]
    );

    console.log(`Migration ${filename} completed successfully.`);
    return true;
  } catch (error) {
    console.error(`Migration ${filename} failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('  ZYNK DATABASE MIGRATION SERVICE');
  console.log('='.repeat(60));
  console.log(`\nMigrations directory: ${MIGRATIONS_DIR}`);
  console.log(`Database: ${config.database}@${config.host}:${config.port}`);
  console.log('');

  let connection;

  try {
    connection = await waitForDatabase();
    await createMigrationsTable(connection);

    const executedMigrations = await getExecutedMigrations(connection);
    const migrationFiles = getMigrationFiles();

    console.log(`\nFound ${migrationFiles.length} migration file(s).`);
    console.log(`Already executed: ${executedMigrations.size} migration(s).`);

    const pendingMigrations = migrationFiles.filter(f => !executedMigrations.has(f));

    if (pendingMigrations.length === 0) {
      console.log('\nNo pending migrations. Database is up to date!');
    } else {
      console.log(`\nPending migrations: ${pendingMigrations.length}`);

      for (const migration of pendingMigrations) {
        await runMigration(connection, migration);
      }

      console.log('\n' + '='.repeat(60));
      console.log('  ALL MIGRATIONS COMPLETED SUCCESSFULLY!');
      console.log('='.repeat(60) + '\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

main();
