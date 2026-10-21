"""个人版安全边界静态回归检查；不编译、不执行项目代码。"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
failures = []


def reject(path, *markers):
    source = (root / path).read_text()
    failures.extend(f'{path}: {marker}' for marker in markers if marker in source)


for base, extension in [('', 'cjs'), ('tools/release-app-shell/', 'js')]:
    reject(f'{base}main.{extension}', 'xiaochao-credentials-',
           "'get-userlist'", "'save-userlist'", 'scheduleMicroClientUpdate',
           'electron-updater', 'quitAndInstall')
    reject(f'{base}script/electron_frame.{extension}', 'mountPasswordManager',
           'input[type="password"]', 'saveCredentials', 'execute(webview)')
    reject(f'{base}script/electron_renderer.{extension}',
           'getCredentials', 'saveCredentials', 'xiaochao-credentials-')
    reject(f'{base}shared-store.{extension}', 'getCredentials',
           'setCredentials', 'normalizeCredentials')
    reject(f'{base}index_wd.html', 'googletagmanager', 'gtag(')
reject('src/core/bootstrap.ts', 'installGiftCodeController')
config = (root / 'vite.userscript.config.ts').read_text()
if "updateURL: 'none'" not in config or 'downloadURL:' in config:
    failures.append('油猴必须禁用远程更新')
if 'skipRemoteCheck: true' not in (root / 'src/core/bootstrap.ts').read_text():
    failures.append('面板远程更新检查必须停用')
if failures:
    raise SystemExit('\n'.join(failures))
print('本阶段安全边界静态检查通过（不代表完整安全审计通过）')
