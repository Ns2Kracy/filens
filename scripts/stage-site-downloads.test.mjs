import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import JSZip from 'jszip';
import { stageSiteDownloads } from './stage-site-downloads.mjs';

test('publishes only verified release bytes and includes the complete Skill', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'filens-downloads-'));
  try {
    const bytes = Buffer.from('published release fixture');
    const asset = { file: 'filens-test.zip', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const manifest = { tag: 'v1.0.0', components: { cli: '1', preview: '1', mobileSdk: '1' }, assets: [asset] };
    await mkdir(path.join(root, 'docs'));
    await mkdir(path.join(root, 'dist/github-release/v1.0.0'), { recursive: true });
    await mkdir(path.join(root, 'skills/filens/references'), { recursive: true });
    await writeFile(path.join(root, 'docs/preview-release-sizes.json'), JSON.stringify(manifest));
    const cached = path.join(root, 'dist/github-release/v1.0.0', asset.file);
    await writeFile(cached, bytes);
    await writeFile(path.join(root, 'skills/filens/SKILL.md'), '# FiLens\n[Read](references/reading.md)\n');
    await writeFile(path.join(root, 'skills/filens/references/reading.md'), 'Reading reference\n');
    await stageSiteDownloads(root);
    const output = path.join(root, 'apps/demo/dist/downloads');
    assert.deepEqual(await readFile(path.join(output, 'v1.0.0', asset.file)), bytes);
    assert.equal(await readFile(path.join(output, 'v1.0.0/SHA256SUMS'), 'utf8'), `${asset.sha256}  ${asset.file}\n`);
    assert.match(await readFile(path.join(output, 'index.html'), 'utf8'), /v1\.0\.0\/filens-test\.zip/);
    const zip = await JSZip.loadAsync(await readFile(path.join(output, 'filens-skill.zip')));
    assert.equal(await zip.file('filens/references/reading.md').async('string'), 'Reading reference\n');
    assert.match(await zip.file('filens/SKILL.md').async('string'), /references\/reading\.md/);

    await rm(output, { recursive: true });
    await writeFile(cached, Buffer.alloc(bytes.length));
    await assert.rejects(stageSiteDownloads(root), /Release checksum mismatch/);
    await assert.rejects(readFile(path.join(output, 'v1.0.0', asset.file)), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
