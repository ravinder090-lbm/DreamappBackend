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

function patchMain(packagePath, from, to) {
  try {
    const pkgPath = path.resolve(process.cwd(), packagePath);
    if (!fs.existsSync(pkgPath)) {
      console.log(`Package.json not found at ${pkgPath}`);
      return;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.main === from) {
      pkg.main = to;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log(`Patched main in ${pkgPath}: ${from} -> ${to}`);
    } else {
      console.log(`No patch needed for ${pkgPath} (main is already "${pkg.main}")`);
    }
  } catch (err) {
    console.error(`Failed to patch main in ${packagePath}:`, err);
  }
}

patchPackageJson('node_modules/socket.io/package.json', './dist/index.js');
patchPackageJson('node_modules/engine.io/package.json', './build/engine.io.js');

// retry-as-promised ships dist/index.js but Vercel's file tracer misses the dist/ folder.
// The root index.js is identical and always gets traced, so we redirect "main" to it.
patchMain('node_modules/retry-as-promised/package.json', 'dist/index.js', 'index.js');
