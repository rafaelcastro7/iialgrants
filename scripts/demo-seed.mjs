// Stable demo seed: creates fixed demo users with a known password used by the
// "Demo autologin" button on /auth. Idempotent — re-running resets the password.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/demo-seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

export const DEMO_PASSWORD = "IIAL-Demo-2026!";
export const DEMO_USERS = [
  { email: "demo-admin@iial.test", role: "admin", label: "Demo Admin" },
  { email: "demo-member-a@iial.test", role: "member", label: "Demo Member A" },
  { email: "demo-member-b@iial.test", role: "member", label: "Demo Member B" },
];

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  // paginated listUsers — small project, page 1 is enough
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

for (const u of DEMO_USERS) {
  let existing = await findUserByEmail(u.email);
  let userId;

  if (existing) {
    userId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, demo: true, label: u.label },
    });
    if (error) console.error(`update ${u.email}:`, error.message);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      password: DEMO_PASSWORD,
      user_metadata: { preferred_lang: "en", demo: true, label: u.label },
    });
    if (error) {
      console.error(`create ${u.email}:`, error.message);
      continue;
    }
    userId = data.user.id;
  }

  if (u.role === "admin") {
    const { error } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) console.error(`role ${u.email}:`, error.message);
  }

  console.log(`▸ ${u.label.padEnd(16)} ${u.email}  (uid=${userId}, role=${u.role})`);
}

console.log(`\nPassword for all demo users: ${DEMO_PASSWORD}`);
