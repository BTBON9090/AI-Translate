"""Build a minimal extension ZIP and versioned COS update manifest (no credentials)."""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
version = manifest['version']
assert json.loads((root / 'package.json').read_text())['version'] == version
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f'AI-Translate-v{version}.zip'
files = [root / name for name in ['manifest.json', 'background.js', 'content.js', 'content.css', 'providers.js', 'protocol.js', 'connection.js']]
for folder in ['popup', 'icons', 'images']:
    files += [p for p in (root / folder).rglob('*') if p.is_file() and p.suffix in {'.js', '.html', '.css', '.png', '.svg', '.jpg', '.webp'}]
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for file in sorted(files):
        z.write(file, file.relative_to(root))
notes = '修复模型检测 Receiving end does not exist：面板直接请求模型列表；新增百炼 Token Plan 套餐地址；区分模型列表、官方参考模型和模型连接测试；新增后台版本检查与重新加载入口。'
notes_en = 'Fix model discovery when the extension background has no message receiver; add Alibaba Token Plan endpoints; distinguish API model lists, official reference IDs and explicit model connection tests; add background health check and reload recovery.'
data = {'version': version, 'downloadUrl': f'https://ai-translate-release-1317980685.cos.ap-shanghai.myqcloud.com/releases/{archive.name}', 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'size': archive.stat().st_size, 'publishedAt': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'), 'releaseNotes': notes, 'releaseNotesEn': notes_en}
(out / 'update_manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'archive': str(archive), **data}, ensure_ascii=False, indent=2))
