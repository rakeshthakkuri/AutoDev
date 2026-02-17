#!/usr/bin/env node
/**
 * Build check: verify backend entry and dependencies load without errors.
 * Used by: npm run build
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.BUILD_CHECK = '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entryPath = path.join(__dirname, '..', 'src', 'index.js');

try {
  await import(pathToFileURL(entryPath).href);
  console.log('Backend build check OK');
} catch (err) {
  console.error('Backend build check failed:', err.message);
  process.exit(1);
}
