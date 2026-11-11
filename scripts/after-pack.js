// electron-builder afterPack hook.
// Apple Silicon Macs refuse to run apps without any code signature ("app is damaged").
// When no Developer ID certificate is configured, give the app an ad-hoc signature
// so a locally built app opens normally.
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return; // real signing configured
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
