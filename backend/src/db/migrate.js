import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { query, closePool } from './index.js';

if (!config.databaseUrl?.trim()) {
    console.error(`
DATABASE_URL is not set — migrations cannot run.

For Fly.io + Supabase, set the secret (use the URI from Supabase → Project Settings → Database), then deploy again:
  fly secrets set DATABASE_URL="postgresql://..."
  fly deploy

See backend/DEPLOY.md
`);
    process.exit(1);
}

/** Catch bad host before pg connects (avoids cryptic getaddrinfo when URL is malformed). */
function validateDatabaseUrlShape(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        console.error(`
DATABASE_URL is not a valid URL.

If your database password contains @ # : / ? or spaces, it must be percent-encoded in the URI.
Example: encodeURIComponent('p@ss') → use that encoded value as the password segment.
`);
        process.exit(1);
    }
    const host = parsed.hostname;
    if (!host || host === '...' || host.includes('...')) {
        console.error(`
DATABASE_URL has no real hostname (got "${host || '(empty)'}").

Paste the full URI from Supabase → Project Settings → Database and replace [YOUR-PASSWORD] with your actual password.
`);
        process.exit(1);
    }
}

validateDatabaseUrlShape(config.databaseUrl);

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
        const msg = String(err.message || '');
        const code = err.code || '';
        if (code === 'ENOTFOUND' || msg.includes('getaddrinfo ENOTFOUND')) {
            console.error(`
The database hostname in DATABASE_URL could not be resolved (DNS).

Fix:
  • Paste the full URI from Supabase → Project Settings → Database (URI tab).
    Host should look like db.xxxxx.supabase.co or aws-0-…pooler.supabase.com — not "..." or a placeholder.
  • Replace [YOUR-PASSWORD] with your real database password in the URI.
  • Update Fly:  fly secrets set DATABASE_URL='postgresql://postgres:PASSWORD@HOST:5432/postgres'
  • Then:      fly deploy
`);
        } else if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
            console.error(`
Could not open a TCP connection to the database (connection refused).

Check the host, port (5432 direct / 6543 pooler), and that the Supabase project is running.
`);
        }
        process.exit(1);
    });
