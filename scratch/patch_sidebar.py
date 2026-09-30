import pathlib

root = pathlib.Path(r'E:\dev\iial-grantdesk-synced')

sidebar_path = root / 'src/components/AppSidebar.tsx'
content = sidebar_path.read_text(encoding='utf-8')

if '/settings/email' not in content:
    if 'Mail' not in content:
        content = content.replace('Building2,', 'Building2, Mail,')
    
    target = '{ to: "/org", labelKey: "org.title", icon: Building2 },'
    replacement = target + '\n      { to: "/settings/email", labelKey: "nav.emailSettings", icon: Mail },'
    content = content.replace(target, replacement)
    sidebar_path.write_text(content, encoding='utf-8')
    print('Updated AppSidebar.tsx')

en_path = root / 'src/i18n/locales/en.json'
en_content = en_path.read_text(encoding='utf-8')
if 'emailSettings' not in en_content:
    en_content = en_content.replace('"manual": "User Manual",', '"manual": "User Manual",\n    "emailSettings": "Email settings",')
    en_path.write_text(en_content, encoding='utf-8')
    print('Updated en.json')

fr_path = root / 'src/i18n/locales/fr.json'
if fr_path.exists():
    fr_content = fr_path.read_text(encoding='utf-8')
    if 'emailSettings' not in fr_content:
        fr_content = fr_content.replace('"manual":', '"emailSettings": "Paramètres de courriel",\n    "manual":')
        fr_path.write_text(fr_content, encoding='utf-8')
        print('Updated fr.json')
