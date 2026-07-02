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

patchPackageJson('node_modules/socket.io/package.json', './dist/index.js');
patchPackageJson('node_modules/engine.io/package.json', './build/engine.io.js');
