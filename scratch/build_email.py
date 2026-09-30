import pathlib

target_root = pathlib.Path(r'E:\dev\iial-grantdesk-synced')

def write_file(rel_path, content):
    dest = target_root / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding='utf-8')
    print(f"Wrote {dest}")

# 1. src/lib/email-settings.ts
write_file('src/lib/email-settings.ts', '''import { z } from "zod";

export type EmailPresetKey = "gmail" | "microsoft365" | "custom" | "resend";

export type EmailPreset = {
  key: EmailPresetKey;
  label: string;
  provider: "smtp" | "resend";
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: "tls" | "starttls";
  secretLabel: string;
  hint: string;
};

export const EMAIL_PRESETS: EmailPreset[] = [
  {
    key: "gmail",
    label: "Gmail",
    provider: "smtp",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: "tls",
    secretLabel: "Google App Password",
    hint:
      "Gmail needs an App Password, not your normal password. Turn on 2-Step Verification, " +
      "then create one at myaccount.google.com/apppasswords. The username is the full Gmail address.",
  },
  {
    key: "microsoft365",
    label: "Microsoft 365",
    provider: "smtp",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: "starttls",
    secretLabel: "Password",
    hint:
      "The mailbox must have Authenticated SMTP enabled in the Microsoft 365 admin center. " +
      "The username is the full email address.",
  },
  {
    key: "custom",
    label: "Custom SMTP",
    provider: "smtp",
    secretLabel: "Password",
    hint: "Use the host, port and security your mail provider documents for SMTP submission.",
  },
  {
    key: "resend",
    label: "Resend",
    provider: "resend",
    secretLabel: "Resend API key",
    hint: "The From address must be on a domain verified in Resend.",
  },
];

export function presetFor(provider: "smtp" | "resend", smtpHost: string | null): EmailPresetKey {
  if (provider === "resend") return "resend";
  const host = smtpHost?.trim().toLowerCase();
  if (host === "smtp.gmail.com") return "gmail";
  if (host === "smtp.office365.com") return "microsoft365";
  return "custom";
}

const email = z.string().trim().email("Enter a valid email address").max(254);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "Enter a valid email address or leave it empty",
  });

export const emailSettingsInput = z
  .object({
    provider: z.enum(["smtp", "resend"]),
    fromName: z.string().trim().max(120),
    fromAddress: email,
    replyTo: optionalEmail,
    smtpHost: z.string().trim().max(253),
    smtpPort: z.number().int().min(1).max(65535).nullable(),
    smtpSecure: z.enum(["tls", "starttls"]).nullable(),
    smtpUser: z.string().trim().max(254),
    secret: z.string().max(500).nullable(),
    enabled: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.provider !== "smtp") return;
    if (!value.smtpHost)
      ctx.addIssue({ code: "custom", path: ["smtpHost"], message: "SMTP host is required" });
    if (value.smtpPort === null)
      ctx.addIssue({ code: "custom", path: ["smtpPort"], message: "SMTP port is required" });
    if (value.smtpSecure === null)
      ctx.addIssue({ code: "custom", path: ["smtpSecure"], message: "Choose TLS or STARTTLS" });
    if (!value.smtpUser)
      ctx.addIssue({ code: "custom", path: ["smtpUser"], message: "SMTP username is required" });
  });

export type EmailSettingsInput = z.infer<typeof emailSettingsInput>;

export type EmailSettingsView = {
  orgId: string;
  orgName: string;
  saved: {
    provider: "smtp" | "resend";
    fromName: string | null;
    fromAddress: string;
    replyTo: string | null;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: "tls" | "starttls" | null;
    smtpUser: string | null;
    hasSecret: boolean;
    enabled: boolean;
    updatedAt: string;
    lastTestAt: string | null;
    lastTestResult: string | null;
  } | null;
  envFallback: boolean;
  canStoreSecrets: boolean;
};

export function formatFrom(name: string | null | undefined, address: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return address;
  const safe = trimmed.replace(/["\\\r\n]/g, "");
  return /[(),.:;<>@[\]]/.test(safe) ? `"${safe}" <${address}>` : `${safe} <${address}>`;
}
''')

# 2. src/lib/email-settings.test.ts
write_file('src/lib/email-settings.test.ts', '''import { describe, expect, it } from "vitest";
import { emailSettingsInput, formatFrom, presetFor } from "./email-settings";

describe("presetFor", () => {
  it("maps hosts to presets", () => {
    expect(presetFor("resend", null)).toBe("resend");
    expect(presetFor("smtp", "smtp.gmail.com")).toBe("gmail");
    expect(presetFor("smtp", "SMTP.GMAIL.COM ")).toBe("gmail");
    expect(presetFor("smtp", "smtp.office365.com")).toBe("microsoft365");
    expect(presetFor("smtp", "mail.example.org")).toBe("custom");
  });
});

describe("formatFrom", () => {
  it("formats standard and quoted names", () => {
    expect(formatFrom(null, "dev@example.org")).toBe("dev@example.org");
    expect(formatFrom("Grant Team", "dev@example.org")).toBe("Grant Team <dev@example.org>");
    expect(formatFrom("Team, Grant", "dev@example.org")).toBe('"Team, Grant" <dev@example.org>');
  });
});

describe("emailSettingsInput validation", () => {
  it("accepts valid Gmail configuration", () => {
    const res = emailSettingsInput.safeParse({
      provider: "smtp",
      fromName: "IIAL Grants",
      fromAddress: "consultant@example.org",
      replyTo: "",
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: "tls",
      smtpUser: "consultant@example.org",
      secret: "abcd efgh ijkl mnop",
      enabled: true,
    });
    expect(res.success).toBe(true);
  });

  it("requires SMTP fields when provider is smtp", () => {
    const res = emailSettingsInput.safeParse({
      provider: "smtp",
      fromName: "",
      fromAddress: "consultant@example.org",
      replyTo: "",
      smtpHost: "",
      smtpPort: null,
      smtpSecure: null,
      smtpUser: "",
      secret: null,
      enabled: false,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("smtpHost");
      expect(paths).toContain("smtpPort");
      expect(paths).toContain("smtpSecure");
      expect(paths).toContain("smtpUser");
    }
  });

  it("allows simple Resend configuration without SMTP parameters", () => {
    const res = emailSettingsInput.safeParse({
      provider: "resend",
      fromName: "Notifications",
      fromAddress: "grants@example.org",
      replyTo: "support@example.org",
      smtpHost: "",
      smtpPort: null,
      smtpSecure: null,
      smtpUser: "",
      secret: "re_123456789",
      enabled: true,
    });
    expect(res.success).toBe(true);
  });
});
''')

# 3. src/server/email-sender.ts
write_file('src/server/email-sender.ts', '''import type { SupabaseClient } from "@supabase/supabase-js";
import { formatFrom } from "@/lib/email-settings";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const MAX_ATTEMPTS = 3;
export const STALE_AFTER_MS = 7 * 86_400_000;
export const BACKOFF_MS = [0, 15 * 60_000, 2 * 60 * 60_000] as const;
export const TEST_DOMAIN = "@grantdesk.test";

export type OutboxRow = {
  id: string;
  org_id?: string | null;
  tenant_id?: string | null;
  recipient_email: string;
  subject: string;
  body_html: string;
  status: "pending" | "failed";
  attempts?: number;
  last_attempt_at?: string | null;
  created_at: string;
};

export type EmailConfig =
  | { ok: true; apiKey: string; from: string }
  | { ok: false; reason: string };

export function emailConfig(env: Record<string, string | undefined>): EmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey) return { ok: false, reason: "email not configured: RESEND_API_KEY is not set" };
  if (!from) return { ok: false, reason: "email not configured: EMAIL_FROM is not set" };
  return { ok: true, apiKey, from };
}

export type ResendTransport = { kind: "resend"; apiKey: string; from: string; replyTo?: string };
export type SmtpTransport = {
  kind: "smtp";
  host: string;
  port: number;
  secure: "tls" | "starttls";
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
};
export type Transport = ResendTransport | SmtpTransport;

export type Message = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export type SmtpClient = {
  sendMail: (options: Record<string, unknown>) => Promise<unknown>;
  close?: () => void;
};
export type SmtpFactory = (transport: SmtpTransport) => SmtpClient | Promise<SmtpClient>;

export const defaultSmtpFactory: SmtpFactory = async (t) => {
  const { createTransport } = await import("nodemailer");
  return createTransport({
    host: t.host,
    port: t.port,
    secure: t.secure === "tls",
    requireTLS: t.secure === "starttls",
    auth: { user: t.user, pass: t.pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  }) as unknown as SmtpClient;
};

export function envTransport(config: { apiKey: string; from: string }): ResendTransport {
  return { kind: "resend", apiKey: config.apiKey, from: config.from };
}

export type OrgTransportRow = {
  org_id: string;
  provider: string;
  from_name: string | null;
  from_address: string;
  reply_to: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: string | null;
  smtp_user: string | null;
  secret: string | null;
  enabled: boolean;
};

export function toTransport(
  row: OrgTransportRow,
): { ok: true; transport: Transport } | { ok: false; reason: string } {
  if (!row.secret) return { ok: false, reason: "no password or API key saved" };
  const from = formatFrom(row.from_name, row.from_address);
  const replyTo = row.reply_to ?? undefined;
  if (row.provider === "resend") {
    return { ok: true, transport: { kind: "resend", apiKey: row.secret, from, replyTo } };
  }
  if (row.provider !== "smtp") return { ok: false, reason: `unknown provider ${row.provider}` };
  if (!row.smtp_host || !row.smtp_port || !row.smtp_user) {
    return { ok: false, reason: "SMTP host, port or username missing" };
  }
  return {
    ok: true,
    transport: {
      kind: "smtp",
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_secure === "starttls" ? "starttls" : "tls",
      user: row.smtp_user,
      pass: row.secret,
      from,
      replyTo,
    },
  };
}

export async function loadOrgSettings(
  supabase: SupabaseClient,
  encryptionKey: string,
): Promise<OrgTransportRow[]> {
  const { data, error } = await supabase.rpc("get_org_email_transports", {
    p_encryption_key: encryptionKey,
  });
  if (error) throw new Error(`could not read org email settings: ${error.message}`);
  return (data ?? []) as OrgTransportRow[];
}

export async function loadOrgTransports(
  supabase: SupabaseClient,
  encryptionKey: string,
): Promise<Map<string, Transport>> {
  const map = new Map<string, Transport>();
  for (const row of await loadOrgSettings(supabase, encryptionKey)) {
    if (!row.enabled) continue;
    const built = toTransport(row);
    if (built.ok) map.set(row.org_id, built.transport);
  }
  return map;
}

export type RowPlan = "send" | "stale" | "test_recipient" | "backoff" | "exhausted";

export function planRow(row: OutboxRow, now: Date): RowPlan {
  const attempts = row.attempts ?? 0;
  if (attempts >= MAX_ATTEMPTS) return "exhausted";
  if (now.getTime() - Date.parse(row.created_at) > STALE_AFTER_MS) return "stale";
  if (row.recipient_email.trim().toLowerCase().endsWith(TEST_DOMAIN)) return "test_recipient";
  if (row.status === "failed" && row.last_attempt_at) {
    const wait = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 0;
    if (now.getTime() - Date.parse(row.last_attempt_at) < wait) return "backoff";
  }
  return "send";
}

export async function deliver(
  transport: Transport,
  message: Message,
  deps: {
    fetchImpl?: typeof fetch;
    smtpClient?: SmtpClient;
    smtpFactory?: SmtpFactory;
  } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (transport.kind === "smtp") {
    const ownClient = !deps.smtpClient;
    let client: SmtpClient | null = null;
    try {
      client = deps.smtpClient
        ? deps.smtpClient
        : await (deps.smtpFactory ?? defaultSmtpFactory)(transport);
      await client.sendMail({
        from: transport.from,
        to: message.to,
        replyTo: transport.replyTo,
        subject: message.subject,
        html: message.html,
        messageId: `<${message.idempotencyKey}@grantdesk.local>`,
      });
      return { ok: true };
    } catch (caught) {
      return { ok: false, error: `smtp: ${smtpError(caught)}` };
    } finally {
      if (ownClient) client?.close?.();
    }
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transport.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: transport.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(transport.replyTo ? { reply_to: transport.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return { ok: true };
    const text = await response.text().catch(() => "");
    return { ok: false, error: `resend ${response.status}: ${text.slice(0, 300)}` };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
  }
}

export function smtpError(caught: unknown): string {
  const text = caught instanceof Error ? caught.message : String(caught);
  const code = (caught as { responseCode?: number } | null)?.responseCode;
  if (code === 535 || /\b535\b|Invalid login|Username and Password not accepted/i.test(text)) {
    return "the server rejected the username or password (for Gmail, use an App Password, not the account password)";
  }
  return text.slice(0, 300);
}
''')

# 4. src/server/email-sender.test.ts
write_file('src/server/email-sender.test.ts', '''import { describe, expect, it, vi } from "vitest";
import { deliver, planRow, smtpError, toTransport, type OutboxRow } from "./email-sender";

describe("toTransport", () => {
  it("converts a valid SMTP configuration", () => {
    const res = toTransport({
      org_id: "org-1",
      provider: "smtp",
      from_name: "Grant Team",
      from_address: "info@example.org",
      reply_to: null,
      smtp_host: "smtp.gmail.com",
      smtp_port: 465,
      smtp_secure: "tls",
      smtp_user: "info@example.org",
      secret: "app-password-123",
      enabled: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.transport.kind).toBe("smtp");
      if (res.transport.kind === "smtp") {
        expect(res.transport.host).toBe("smtp.gmail.com");
        expect(res.transport.port).toBe(465);
        expect(res.transport.from).toBe("Grant Team <info@example.org>");
      }
    }
  });

  it("fails if secret is missing", () => {
    const res = toTransport({
      org_id: "org-1",
      provider: "smtp",
      from_name: null,
      from_address: "info@example.org",
      reply_to: null,
      smtp_host: "smtp.gmail.com",
      smtp_port: 465,
      smtp_secure: "tls",
      smtp_user: "info@example.org",
      secret: null,
      enabled: true,
    });
    expect(res.ok).toBe(false);
  });
});

describe("planRow", () => {
  it("plans normal sending for fresh outbox row", () => {
    const row: OutboxRow = {
      id: "row-1",
      recipient_email: "user@example.com",
      subject: "Test",
      body_html: "<p>Hi</p>",
      status: "pending",
      attempts: 0,
      created_at: new Date().toISOString(),
    };
    expect(planRow(row, new Date())).toBe("send");
  });

  it("detects exhausted attempts", () => {
    const row: OutboxRow = {
      id: "row-1",
      recipient_email: "user@example.com",
      subject: "Test",
      body_html: "<p>Hi</p>",
      status: "failed",
      attempts: 3,
      created_at: new Date().toISOString(),
    };
    expect(planRow(row, new Date())).toBe("exhausted");
  });
});

describe("smtpError", () => {
  it("formats 535 authentication failure into clear guidance", () => {
    const err = new Error("535 5.7.8 Error: authentication failed");
    expect(smtpError(err)).toContain("use an App Password");
  });
});

describe("deliver (resend mock)", () => {
  it("delivers via resend API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg-123" }),
    });

    const res = await deliver(
      { kind: "resend", apiKey: "re_key", from: "info@example.org" },
      { to: "recipient@example.com", subject: "Hello", html: "<p>Hi</p>", idempotencyKey: "key-1" },
      { fetchImpl: mockFetch as unknown as typeof fetch },
    );

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
''')

# 5. src/lib/email-settings.functions.ts
write_file('src/lib/email-settings.functions.ts', '''"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSupabaseAdmin } from "./supabase-admin";
import { emailSettingsInput, type EmailSettingsView } from "@/lib/email-settings";
import { deliver, emailConfig, loadOrgSettings, toTransport } from "@/server/email-sender";

const NOT_ADMIN = "Only an organization owner or admin can change email settings.";

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailSettingsView> => {
    const supabase = await createSupabaseAdmin();

    const { data: userOrgs, error: orgErr } = await supabase
      .from("user_organizations")
      .select("org_id, role, organizations(name)")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();

    if (orgErr) throw new Error(orgErr.message);

    let orgId = userOrgs?.org_id;
    let orgName = (userOrgs as unknown as { organizations?: { name?: string } })?.organizations?.name ?? "Organization";

    if (!orgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", context.userId)
        .maybeSingle();
      orgId = profile?.org_id ?? undefined;
    }

    if (!orgId) {
      throw new Error(NOT_ADMIN);
    }

    const { data: row, error } = await supabase
      .from("org_email_settings")
      .select(
        "provider, from_name, from_address, reply_to, smtp_host, smtp_port, smtp_secure, " +
          "smtp_user, has_secret, enabled, updated_at, last_test_at, last_test_result",
      )
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const saved = row as unknown as {
      provider: "smtp" | "resend";
      from_name: string | null;
      from_address: string;
      reply_to: string | null;
      smtp_host: string | null;
      smtp_port: number | null;
      smtp_secure: "tls" | "starttls" | null;
      smtp_user: string | null;
      has_secret: boolean;
      enabled: boolean;
      updated_at: string;
      last_test_at: string | null;
      last_test_result: string | null;
    } | null;

    return {
      orgId,
      orgName,
      saved: saved && {
        provider: saved.provider,
        fromName: saved.from_name,
        fromAddress: saved.from_address,
        replyTo: saved.reply_to,
        smtpHost: saved.smtp_host,
        smtpPort: saved.smtp_port,
        smtpSecure: saved.smtp_secure,
        smtpUser: saved.smtp_user,
        hasSecret: saved.has_secret,
        enabled: saved.enabled,
        updatedAt: saved.updated_at,
        lastTestAt: saved.last_test_at,
        lastTestResult: saved.last_test_result,
      },
      envFallback: emailConfig(process.env).ok,
      canStoreSecrets: !!process.env.EMAIL_SETTINGS_KEY,
    };
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ settings: emailSettingsInput }).parse(i))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const supabase = await createSupabaseAdmin();
    const s = data.settings;
    const secret = s.secret?.trim() ? s.secret.trim() : null;
    const key = process.env.EMAIL_SETTINGS_KEY;

    if (secret && !key) {
      throw new Error(
        "The server has no EMAIL_SETTINGS_KEY configured in environment, so a secret cannot be encrypted. " +
          "Add EMAIL_SETTINGS_KEY to your environment/secrets.",
      );
    }

    const { data: userOrg } = await supabase
      .from("user_organizations")
      .select("org_id")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();

    const orgId = userOrg?.org_id;
    if (!orgId) throw new Error(NOT_ADMIN);

    const { error } = await supabase.rpc("set_org_email_settings", {
      target_org_id: orgId,
      p_provider: s.provider,
      p_from_name: s.fromName,
      p_from_address: s.fromAddress,
      p_reply_to: s.replyTo,
      p_smtp_host: s.smtpHost,
      p_smtp_port: s.smtpPort,
      p_smtp_secure: s.smtpSecure,
      p_smtp_user: s.smtpUser,
      p_secret: secret,
      p_enabled: s.enabled,
      p_encryption_key: key ?? "",
    });

    if (error) {
      if (error.code === "42501") throw new Error(NOT_ADMIN);
      throw new Error(error.message);
    }
    return { saved: true };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const supabase = await createSupabaseAdmin();
    const userEmail = context.claims.email;
    if (!userEmail) throw new Error("Your account has no email address to send a test to.");

    const key = process.env.EMAIL_SETTINGS_KEY;
    if (!key) throw new Error("The server has no EMAIL_SETTINGS_KEY set; saved settings cannot be decrypted.");

    const { data: userOrg } = await supabase
      .from("user_organizations")
      .select("org_id, organizations(name)")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();

    const orgId = userOrg?.org_id;
    if (!orgId) throw new Error(NOT_ADMIN);
    const orgName = (userOrg as unknown as { organizations?: { name?: string } })?.organizations?.name ?? "Organization";

    const rows = await loadOrgSettings(supabase, key);
    const row = rows.find((r) => r.org_id === orgId);
    if (!row) throw new Error("Save the email settings first, then send a test.");

    const built = toTransport(row);
    const outcome = built.ok
      ? await deliver(built.transport, {
          to: userEmail,
          subject: "IIAL Grants test email",
          html:
            `<p>This is a test email from IIAL Grants for <strong>${escapeHtml(orgName)}</strong>.</p>` +
            `<p>If you can read this, grant alerts and deadline reminders will be delivered using this mailbox.</p>`,
          idempotencyKey: `settings-test-${orgId}-${Date.now()}`,
        })
      : { ok: false as const, error: built.reason };

    const message = outcome.ok
      ? `Sent test email to ${userEmail}. Please check your inbox (and spam folder).`
      : `Could not send test email: ${outcome.error}`;

    await supabase
      .from("org_email_settings")
      .update({ last_test_at: new Date().toISOString(), last_test_result: message.slice(0, 500) })
      .eq("org_id", orgId);

    return { ok: outcome.ok, message };
  });

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
''')

# 6. src/routes/_authenticated.settings.email.tsx
write_file('src/routes/_authenticated.settings.email.tsx', '''import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Mail, CheckCircle2, AlertCircle, ShieldAlert, Send, KeyRound } from "lucide-react";

import {
  EMAIL_PRESETS,
  emailSettingsInput,
  presetFor,
  type EmailPresetKey,
  type EmailSettingsInput,
} from "@/lib/email-settings";
import { getEmailSettings, saveEmailSettings, sendTestEmail } from "@/lib/email-settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/PageLayout";

const emailSettingsQueryOptions = queryOptions({
  queryKey: ["settings", "email"],
  queryFn: () => getEmailSettings(),
});

export const Route = createFileRoute("/_authenticated/settings/email")({
  head: () => ({ meta: [{ title: "Email Settings — IIAL Grants" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(emailSettingsQueryOptions),
  component: EmailSettingsPage,
});

function EmailSettingsPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getEmailSettings);
  const saveFn = useServerFn(saveEmailSettings);
  const testFn = useServerFn(sendTestEmail);

  const { data } = useSuspenseQuery({
    queryKey: ["settings", "email"],
    queryFn: () => fetchSettings(),
  });

  const saved = data.saved;
  const initialPreset = saved ? presetFor(saved.provider, saved.smtpHost) : "gmail";
  const [preset, setPreset] = useState<EmailPresetKey>(initialPreset);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const form = useForm<EmailSettingsInput>({
    resolver: zodResolver(emailSettingsInput),
    defaultValues: {
      provider: saved?.provider ?? "smtp",
      fromName: saved?.fromName ?? "",
      fromAddress: saved?.fromAddress ?? "",
      replyTo: saved?.replyTo ?? "",
      smtpHost: saved?.smtpHost ?? "smtp.gmail.com",
      smtpPort: saved?.smtpPort ?? 465,
      smtpSecure: saved?.smtpSecure ?? "tls",
      smtpUser: saved?.smtpUser ?? "",
      secret: null,
      enabled: saved?.enabled ?? false,
    },
  });

  const provider = form.watch("provider");
  const selectedPreset = EMAIL_PRESETS.find((p) => p.key === preset) ?? EMAIL_PRESETS[0]!;

  function onSelectPreset(key: EmailPresetKey) {
    setPreset(key);
    const p = EMAIL_PRESETS.find((item) => item.key === key);
    if (!p) return;

    form.setValue("provider", p.provider);
    if (p.provider === "smtp") {
      form.setValue("smtpHost", p.smtpHost ?? "");
      form.setValue("smtpPort", p.smtpPort ?? null);
      form.setValue("smtpSecure", p.smtpSecure ?? null);
    }
  }

  async function onSubmit(values: EmailSettingsInput) {
    try {
      await saveFn({ data: { settings: values } });
      toast.success("Email settings saved");
      await qc.invalidateQueries({ queryKey: ["settings", "email"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save email settings");
    }
  }

  async function onSendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testFn();
      setTestResult(res);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      await qc.invalidateQueries({ queryKey: ["settings", "email"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send test email";
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <PageContainer size="medium">
      <PageHeader
        eyebrow="Organization Settings"
        title="Outgoing Email Configuration"
        description={`Configure the email mailbox for ${data.orgName}. Notifications and grant alerts will be delivered through this sender.`}
      />

      {!data.canStoreSecrets && (
        <Card className="border-amber-500/50 bg-amber-500/10 mb-6">
          <CardContent className="pt-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-800 dark:text-amber-300">
                EMAIL_SETTINGS_KEY missing on server
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                The server environment key required for encrypting passwords is not configured. Ask an administrator to add <code>EMAIL_SETTINGS_KEY</code> to secrets.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Select Provider Preset
            </CardTitle>
            <CardDescription>
              Choose a standard preset or configure custom SMTP settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {EMAIL_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => onSelectPreset(p.key)}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm font-medium transition-all ${
                    preset === p.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded border border-border/50">
              {selectedPreset.hint}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sender Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">From Name</label>
                <Input
                  {...form.register("fromName")}
                  placeholder="IIAL Grant Team"
                  className="mt-1"
                />
                {form.formState.errors.fromName && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.fromName.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">From Address *</label>
                <Input
                  {...form.register("fromAddress")}
                  placeholder="grants@example.org"
                  className="mt-1"
                />
                {form.formState.errors.fromAddress && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.fromAddress.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Reply-To Address (Optional)</label>
              <Input
                {...form.register("replyTo")}
                placeholder="support@example.org"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {provider === "smtp" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SMTP Connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm font-medium">SMTP Server Host *</label>
                  <Input {...form.register("smtpHost")} placeholder="smtp.gmail.com" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Port *</label>
                  <Input
                    type="number"
                    value={form.watch("smtpPort") ?? ""}
                    onChange={(e) =>
                      form.setValue("smtpPort", e.target.value ? parseInt(e.target.value) : null)
                    }
                    placeholder="465"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Security *</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background mt-1"
                    value={form.watch("smtpSecure") ?? ""}
                    onChange={(e) =>
                      form.setValue(
                        "smtpSecure",
                        (e.target.value as "tls" | "starttls") || null,
                      )
                    }
                  >
                    <option value="tls">TLS (Implicit, port 465)</option>
                    <option value="starttls">STARTTLS (Explicit, port 587)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Username *</label>
                  <Input {...form.register("smtpUser")} placeholder="username@example.org" className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Credentials & Activation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">{selectedPreset.secretLabel}</label>
                {saved?.hasSecret && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Secret Saved
                  </Badge>
                )}
              </div>
              <Input
                type="password"
                placeholder={saved?.hasSecret ? "•••••••••••••••• (Leave blank to keep stored secret)" : "Enter password or API key"}
                value={form.watch("secret") ?? ""}
                onChange={(e) => form.setValue("secret", e.target.value || null)}
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <h4 className="font-medium text-sm">Enable Outgoing Email</h4>
                <p className="text-xs text-muted-foreground">
                  When enabled, match alerts and deadline reminders use this sender.
                </p>
              </div>
              <Switch
                checked={form.watch("enabled")}
                onCheckedChange={(v) => form.setValue("enabled", v)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-4 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onSendTest}
            disabled={testing || !saved}
            className="flex items-center gap-2"
          >
            <Send className="h-4 w-4" /> {testing ? "Sending..." : "Send Test Email"}
          </Button>

          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>

      {(testResult || saved?.lastTestResult) && (
        <Card className="mt-6 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {(testResult?.ok ?? true) ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              Last Test Email Status
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono text-muted-foreground">
            <p>{testResult?.message ?? saved?.lastTestResult}</p>
            {saved?.lastTestAt && (
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Ran on {new Date(saved.lastTestAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
''')
