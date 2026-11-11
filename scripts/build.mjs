import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
// Chromium deduplicates a script path across content-script worlds. Give MAIN its own bundle.
await fs.writeFile(path.join(root, 'extension/bridge.js'), (await fs.readFile(path.join(root, 'extension/core.js'), 'utf8')) + '\n' + (await fs.readFile(path.join(root, 'scripts/bridge-main.js'), 'utf8')).replace('__CNG_VERSION__', version));
for (const size of [16, 32, 48, 128]) {
  await sharp(path.join(root, 'extension/icons/mark.svg')).resize(size, size).png().toFile(path.join(root, `extension/icons/icon-${size}.png`));
}
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const zip = path.join(root, `dist/CanalNonGrato-${version}.zip`);
await fs.rm(zip, { force: true });
execFileSync('/usr/bin/zip', ['-qr', zip, '.', '-x', '*.DS_Store'], { cwd: path.join(root, 'extension') });
const stat = await fs.stat(zip);
console.log(`Extensão pronta: ${zip} (${(stat.size / 1024).toFixed(1)} KB)`);
