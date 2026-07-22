import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

async function main() {
  const url = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 4000,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1).split('?')[0],
    ssl: { rejectUnauthorized: true }
  });
  
  console.log('Connected to database (MySQL/TiDB)');
  
  // Clear existing misconceptions
  await connection.execute('DELETE FROM misconceptions');
  console.log('Cleared existing misconceptions');
  
  // Read and execute each batch file
  const scriptsDir = join(process.cwd(), 'scripts');
  const batchFiles = readdirSync(scriptsDir)
    .filter(f => f.startsWith('misconceptions_batch_') && f.endsWith('.sql'))
    .sort();
  
  let totalInserted = 0;
  for (const file of batchFiles) {
    const sql = readFileSync(join(scriptsDir, file), 'utf-8');
    try {
      const [result] = await connection.execute(sql) as any;
      const count = result.affectedRows || 0;
      totalInserted += count;
      console.log(`  ${file}: ${count} rows inserted`);
    } catch (err: any) {
      console.error(`  ERROR in ${file}: ${err.message?.substring(0, 300)}`);
    }
  }
  
  console.log(`\nTotal misconceptions inserted: ${totalInserted}`);
  
  // Verify
  const [rows] = await connection.execute('SELECT COUNT(*) as cnt FROM misconceptions') as any;
  console.log(`Verification - misconceptions count in DB: ${rows[0].cnt}`);
  
  await connection.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
