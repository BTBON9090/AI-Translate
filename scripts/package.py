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
files = [root / name for name in ['manifest.json', 'background.js', 'content.js', 'content.css', 'providers.js', 'protocol.js']]
for folder in ['popup', 'icons', 'images']:
    files += [p for p in (root / folder).rglob('*') if p.is_file() and p.suffix in {'.js', '.html', '.css', '.png', '.svg', '.jpg', '.webp'}]
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for file in sorted(files):
        z.write(file, file.relative_to(root))
notes = '新增输入翻译与精细解释；逐段持久缓存、请求合并与扫描限流；优化贴边按钮和划词交互；支持模型检测以及 OpenAI、Anthropic、Responses；修复中英文界面。'
notes_en = 'Text translation and detailed explanations; durable paragraph cache, shared requests and bounded scanning; improved docking and selection UI; model discovery and OpenAI, Anthropic, Responses support; complete Chinese/English interface.'
data = {'version': version, 'downloadUrl': f'https://ai-translate-release-1317980685.cos.ap-shanghai.myqcloud.com/releases/{archive.name}', 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'size': archive.stat().st_size, 'publishedAt': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'), 'releaseNotes': notes, 'releaseNotesEn': notes_en}
(out / 'update_manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'archive': str(archive), **data}, ensure_ascii=False, indent=2))
