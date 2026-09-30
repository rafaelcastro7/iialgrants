import pathlib
import re

p = pathlib.Path(r'E:\dev\iial-grantdesk-synced\src\server\email-sender.ts')
content = p.read_text(encoding='utf-8')

replacement = '''export function smtpError(caught: unknown): string {
  const text = caught instanceof Error ? caught.message : String(caught);
  const code = (caught as { responseCode?: number } | null)?.responseCode;
  if (code === 535 || /\\b535\\b|Invalid login|Username and Password not accepted/i.test(text)) {
    return "the server rejected the username or password (for Gmail, use an App Password, not the account password)";
  }
  return text.slice(0, 300);
}'''

content = re.sub(r'export function smtpError\(caught: unknown\): string \{[\s\S]*?\}', replacement, content)
p.write_text(content, encoding='utf-8')
print("Successfully replaced smtpError in email-sender.ts")
