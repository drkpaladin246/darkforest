// Makes sure Electron's binary is downloaded and unpacked before the app starts.
//
// Why this exists:
// - npm 11+/12 blocks dependency install scripts unless approved, so Electron's
//   own postinstall may never run.
// - On Node 26, Electron's installer downloads the zip but its unzip library
//   stops part-way without an error, leaving a broken node_modules/electron.
// Either way `npm start` fails with "Electron failed to install correctly".
// This script downloads the zip with Electron's own downloader (cached, checksum
// verified) and unpacks it with the operating system's built-in unzip tool.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let electronDir;
try {
  electronDir = path.dirname(require.resolve('electron/package.json'));
} catch {
  console.error('Electron is not in node_modules. Run `npm install` first.');
  process.exit(1);
}

const { version } = require(path.join(electronDir, 'package.json'));
const platform = process.env.npm_config_platform || process.platform;
const distDir = path.join(electronDir, 'dist');
const exePath = {
  darwin: 'Electron.app/Contents/MacOS/Electron',
  mas: 'Electron.app/Contents/MacOS/Electron',
  win32: 'electron.exe',
}[platform] || 'electron';

function installed() {
  try {
    const rel = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim();
    const v = fs.readFileSync(path.join(distDir, 'version'), 'utf8').trim().replace(/^v/, '');
    return rel === exePath && v === version && fs.existsSync(path.join(distDir, rel));
  } catch {
    return false;
  }
}

function detectArch() {
  let arch = process.env.npm_config_arch || process.arch;
  // An x64 Node running under Rosetta on Apple Silicon should still get the arm64 build.
  if (platform === 'darwin' && arch === 'x64' && !process.env.npm_config_arch) {
    const r = spawnSync('sysctl', ['-in', 'sysctl.proc_translated'], { encoding: 'utf8' });
    if (r.stdout && r.stdout.trim() === '1') arch = 'arm64';
  }
  return arch;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0;
}

function unzip(zipPath, dest) {
  if (platform === 'darwin') return run('ditto', ['-x', '-k', zipPath, dest]); // keeps symlinks and permissions
  if (process.platform === 'win32') return run('tar', ['-xf', zipPath, '-C', dest]); // built into Windows 10+
  return run('unzip', ['-q', '-o', zipPath, '-d', dest]);
}

async function main() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD || installed()) return;

  const arch = detectArch();
  console.log(`Setting up Electron ${version} for ${platform}-${arch} (one time, about 100 MB)...`);

  const { downloadArtifact } = require(require.resolve('@electron/get', { paths: [electronDir] }));
  let checksums;
  try { checksums = require(path.join(electronDir, 'checksums.json')); } catch { /* optional */ }
  const zipPath = await downloadArtifact({ version, artifactName: 'electron', platform, arch, checksums });

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  if (!unzip(zipPath, distDir)) throw new Error('Could not unzip ' + zipPath);

  const typeDefs = path.join(distDir, 'electron.d.ts');
  if (fs.existsSync(typeDefs)) fs.renameSync(typeDefs, path.join(electronDir, 'electron.d.ts'));
  fs.writeFileSync(path.join(electronDir, 'path.txt'), exePath);

  if (!installed()) throw new Error('Electron files are incomplete after unzipping.');
  console.log('Electron is ready.');
}

main().catch((err) => {
  console.error('\nElectron setup failed:', err && err.message ? err.message : err);
  console.error('Check your internet connection, then run `npm start` again.');
  process.exit(1);
});
