import fs from 'fs';
import path from 'path';

function patchPackageJson(packagePath, targetReplace) {
  try {
    const pkgPath = path.resolve(process.cwd(), packagePath);
    if (!fs.existsSync(pkgPath)) {
      console.log(`Package.json not found at ${pkgPath}`);
      return;
    }
    let content = fs.readFileSync(pkgPath, 'utf8');
    content = content.replace('"./wrapper.mjs"', `"${targetReplace}"`);
    fs.writeFileSync(pkgPath, content, 'utf8');
    console.log(`Patched ${pkgPath} successfully.`);
  } catch (err) {
    console.error(`Failed to patch ${packagePath}:`, err);
  }
}

function ensureRetryAsPromised() {
  try {
    const base = path.resolve(process.cwd(), 'node_modules/retry-as-promised');
    const pkgPath = path.join(base, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      console.log('retry-as-promised not found, skipping.');
      return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const distFile = path.join(base, 'dist', 'index.js');
    const rootFile = path.join(base, 'index.js');

    // Vercel's .gitignore strips any folder named "dist" from the bundle.
    // The root index.js has identical content and is NEVER stripped.
    // So we always redirect main -> index.js (root level).
    // Ensure root index.js exists (copy from dist if needed).
    if (!fs.existsSync(rootFile)) {
      if (fs.existsSync(distFile)) {
        fs.copyFileSync(distFile, rootFile);
        console.log('Copied retry-as-promised/dist/index.js -> index.js');
      } else {
        console.log('WARNING: neither root index.js nor dist/index.js found!');
        return;
      }
    }

    // Always set main to root index.js — avoids the dist/ gitignore exclusion
    if (pkg.main !== 'index.js') {
      pkg.main = 'index.js';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log('Patched retry-as-promised/package.json: main -> index.js');
    } else {
      console.log('retry-as-promised already patched.');
    }
  } catch (err) {
    console.error('Failed to patch retry-as-promised:', err);
  }
}

patchPackageJson('node_modules/socket.io/package.json', './dist/index.js');
patchPackageJson('node_modules/engine.io/package.json', './build/engine.io.js');
ensureRetryAsPromised();
