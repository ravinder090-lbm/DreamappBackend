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
    // Replace "./wrapper.mjs" with the CommonJS target
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

    // If dist/index.js exists, ensure root index.js is also the same file (belt-and-suspenders)
    if (fs.existsSync(distFile) && !fs.existsSync(rootFile)) {
      fs.copyFileSync(distFile, rootFile);
      console.log('Copied retry-as-promised/dist/index.js -> retry-as-promised/index.js');
    }

    // Ensure dist/ folder exists by copying root -> dist if dist is missing
    const distDir = path.join(base, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    if (!fs.existsSync(distFile) && fs.existsSync(rootFile)) {
      fs.copyFileSync(rootFile, distFile);
      console.log('Copied retry-as-promised/index.js -> retry-as-promised/dist/index.js');
    }

    // Patch main to point to dist/index.js (the canonical location)
    if (pkg.main !== 'dist/index.js') {
      pkg.main = 'dist/index.js';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log('Patched retry-as-promised/package.json: main -> dist/index.js');
    } else {
      console.log('retry-as-promised/package.json already correct.');
    }
  } catch (err) {
    console.error('Failed to patch retry-as-promised:', err);
  }
}

patchPackageJson('node_modules/socket.io/package.json', './dist/index.js');
patchPackageJson('node_modules/engine.io/package.json', './build/engine.io.js');
ensureRetryAsPromised();
