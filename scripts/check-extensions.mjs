import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:your-super-secret-and-long-postgres-password@localhost:15432/postgres' });
await c.connect();
const r = await c.query("SELECT extname, extversion, extnamespace::regnamespace as schema FROM pg_extension ORDER BY extname");
r.rows.forEach(row => console.log(row.extname + ' v' + row.extversion + ' @ ' + row.schema));
const r2 = await c.query("SELECT proname, pronamespace::regnamespace as schema FROM pg_proc WHERE proname IN ('gen_random_bytes','gen_salt','digest','crypt') ORDER BY proname");
r2.rows.forEach(row => console.log('func: ' + row.proname + ' @ ' + row.schema));
await c.end();
