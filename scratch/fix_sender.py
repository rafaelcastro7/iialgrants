import pathlib

target = pathlib.Path(r'E:\dev\iial-grantdesk-synced\src\server\email-sender.ts')
content = target.read_text(encoding='utf-8')

content = content.replace(
    "if (code === 535 || / 535 |Invalid login|Username and Password not accepted/i.test(text)) {",
    "if (code === 535 || /\\b535\\b|Invalid login|Username and Password not accepted/i.test(text)) {"
)

target.write_text(content, encoding='utf-8')
print("Fixed email-sender.ts smtpError regex")
