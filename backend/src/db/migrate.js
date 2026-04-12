import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
    await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

    const { rows } = await query('SELECT filename FROM schema_migrations ORDER BY filename');
    const applied = new Set(rows.map(r => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    let ran = 0;
    for (const file of files) {
        if (applied.has(file)) {
            console.log(`  skip  ${file} (already applied)`);
            continue;
        }
        console.log(`  apply ${file} ...`);
        const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        await query(sql);
        await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        console.log(`  ✓     ${file}`);
        ran++;
    }

    if (ran === 0) console.log('  All migrations already applied.');
    else console.log(`\n  Applied ${ran} migration(s).`);
}

console.log('Running migrations...');
migrate()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Migration failed:', err.message);
        process.exit(1);
    });
