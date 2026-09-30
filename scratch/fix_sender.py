import pathlib

p = pathlib.Path(r'E:\dev\iial-grantdesk-synced\src\server\email-sender.ts')
lines = p.read_text(encoding='utf-8').splitlines()

# Keep everything up to line 218 (0-indexed 218 is line 219)
cut_idx = -1
for i, line in enumerate(lines):
    if line.startswith('export function smtpError'):
        cut_idx = i
        break

if cut_idx != -1:
    new_lines = lines[:cut_idx]
    new_fn = [
        'export function smtpError(caught: unknown): string {',
        '  const text = caught instanceof Error ? caught.message : String(caught);',
        '  const code = (caught as { responseCode?: number } | null)?.responseCode;',
        '  if (code === 535 || /\\b535\\b|Invalid login|Username and Password not accepted/i.test(text)) {',
        '    return "the server rejected the username or password (for Gmail, use an App Password, not the account password)";',
        '  }',
        '  return text.slice(0, 300);',
        '}',
        ''
    ]
    p.write_text('\n'.join(new_lines + new_fn), encoding='utf-8')
    print('Cleanly replaced smtpError')
