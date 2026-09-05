#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

const version = process.argv[2];
if (!version) {
  console.error('Usage: npm run release <version>  (e.g. npm run release 0.3.0)');
  process.exit(1);
}

const tag = `v${version}`;
const copilotSession = process.env.COPILOT_SESSION_ID;
const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

// 1. Bump version in all config files
console.log(`\n🔖 Bumping version to ${version}...`);
const update = (file, regex, replacement) => {
  let content = fs.readFileSync(file, 'utf8');
  if (!regex.test(content)) throw new Error(`Version field not found in ${file}`);
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content);
  console.log(`   ✓ ${file}`);
};
update('package.json', /"version": ".*?"/, `"version": "${version}"`);
update('src-tauri/tauri.conf.json', /"version": ".*?"/, `"version": "${version}"`);
update('src-tauri/Cargo.toml', /^version = ".*?"/m, `version = "${version}"`);
update('src-tauri/Cargo.lock', /(name = "agent-arcade"\r?\nversion = ")[^"]+"/,
  (_match, prefix) => `${prefix}${version}"`);

// Keep the root package metadata aligned without changing dependency resolutions.
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
packageLock.version = version;
packageLock.packages[''].version = version;
fs.writeFileSync('package-lock.json', JSON.stringify(packageLock, null, 2) + '\n');
console.log('   ✓ package-lock.json');

// 2. Update changelog
console.log('\n📋 Updating CHANGELOG.md...');
run('git-cliff --tag ' + tag + ' -o CHANGELOG.md');

// 3. Commit, tag, push
console.log('\n📦 Committing and tagging...');
run('git add -A');
const sessionTrailer = copilotSession ? `\n\nCopilot-Session: ${copilotSession}` : '';
run(`git commit -m "Release ${tag}${sessionTrailer}"`);
run(`git tag ${tag}`);
run('git push');
run(`git push origin ${tag}`);

console.log(`\n✅ Released ${tag}! CI will build and create the GitHub Release.`);
