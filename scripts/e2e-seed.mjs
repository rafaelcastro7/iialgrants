// End-to-end seed: creates pilot test users and emits autologin magic links.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/e2e-seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "https://text-teller-ace.lovable.app";

const users = [
  { email: `e2e-admin-${stamp}@iial.test`, role: "admin", label: "Admin (tenant A)" },
  { email: `e2e-member-a-${stamp}@iial.test`, role: "member", label: "Member tenant A" },
  { email: `e2e-member-b-${stamp}@iial.test`, role: "member", label: "Member tenant B" },
];

const out = [];

for (const u of users) {
  // 1. Create user (auto-confirmed; trigger handle_new_user inserts profile + default 'member' role)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: u.email,
    email_confirm: true,
    password: crypto.randomUUID(),
    user_metadata: { preferred_lang: "en", e2e: true, label: u.label },
  });
  if (cErr) {
    console.error(`createUser ${u.email}:`, cErr.message);
    continue;
  }
  const userId = created.user.id;

  // 2. Promote to admin via user_roles (service role bypasses RLS)
  if (u.role === "admin") {
    const { error: rErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (rErr && !rErr.message.includes("duplicate")) {
      console.error(`role insert ${u.email}:`, rErr.message);
    }
  }

  // 3. Generate magic link (autologin)
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: u.email,
    options: { redirectTo: `${PUBLIC_BASE}/dashboard` },
  });
  if (lErr) {
    console.error(`generateLink ${u.email}:`, lErr.message);
    continue;
  }

  out.push({
    label: u.label,
    email: u.email,
    user_id: userId,
    role: u.role,
    action_link: link.properties?.action_link,
  });
}

console.log("\n=== E2E TEST USERS (autologin) ===\n");
for (const r of out) {
  console.log(`▸ ${r.label}`);
  console.log(`  email:  ${r.email}`);
  console.log(`  uid:    ${r.user_id}`);
  console.log(`  role:   ${r.role}`);
  console.log(`  login:  ${r.action_link}\n`);
}
console.log("These magic links expire per Supabase Auth settings (default 1h).");
