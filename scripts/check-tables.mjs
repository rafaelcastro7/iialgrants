import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres' });
await c.connect();
const r = await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
console.log('Tables (' + r.rows.length + '):');
r.rows.forEach(row => console.log('  ' + row.tablename));
await c.end();
