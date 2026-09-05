import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('release updates all version metadata without changing locked dependencies', () => {
  const version = '9.8.7-test.1';
  const paths = [
    'package.json', 'package-lock.json', 'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json',
  ];
  const files = Object.fromEntries(paths.map(path => [path, readFileSync(path, 'utf8')]));
  const originalNpmLock = JSON.parse(files['package-lock.json']);
  const originalCargoLock = files['src-tauri/Cargo.lock'];
  const commands: string[] = [];
  runInNewContext(readFileSync('scripts/release.js', 'utf8'), {
    require(name: string) {
      if (name === 'fs') return {
        readFileSync: (path: string) => files[path],
        writeFileSync: (path: string, content: string) => { files[path] = content; },
      };
      if (name === 'child_process') return {
        execSync: (command: string) => { commands.push(command); },
      };
      throw new Error(`Unexpected module: ${name}`);
    },
    console: { log() {} },
    process: { argv: ['node', 'release.js', version], env: {} },
  });
  expect(JSON.parse(files['package.json']).version).toBe(version);
  expect(JSON.parse(files['src-tauri/tauri.conf.json']).version).toBe(version);
  expect(files['src-tauri/Cargo.toml']).toContain(`version = "${version}"`);
  originalNpmLock.version = version;
  originalNpmLock.packages[''].version = version;
  expect(JSON.parse(files['package-lock.json'])).toEqual(originalNpmLock);
  expect(files['src-tauri/Cargo.lock']).toBe(originalCargoLock.replace(
    /(name = "agent-arcade"\r?\nversion = ")[^"]+"/,
    (_match, prefix) => `${prefix}${version}"`,
  ));
  expect(commands).toEqual([
    `git-cliff --tag v${version} -o CHANGELOG.md`,
    'git add -A',
    `git commit -m "Release v${version}"`,
    `git tag v${version}`,
    'git push',
    `git push origin v${version}`,
  ]);
});
