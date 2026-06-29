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

function patchPackageMain(packagePath, mainTarget) {
  try {
    const pkgPath = path.resolve(process.cwd(), packagePath);
    if (!fs.existsSync(pkgPath)) {
      console.log(`Package.json not found at ${pkgPath}`);
      return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.main = mainTarget;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`Patched ${pkgPath} main to ${mainTarget}.`);
  } catch (err) {
    console.error(`Failed to patch ${packagePath}:`, err);
  }
}

function copyPackageFile(sourcePath, targetPath) {
  try {
    const source = path.resolve(process.cwd(), sourcePath);
    const target = path.resolve(process.cwd(), targetPath);
    if (!fs.existsSync(source)) {
      console.log(`Source file not found at ${source}`);
      return;
    }

    fs.copyFileSync(source, target);
    console.log(`Copied ${source} to ${target}.`);
  } catch (err) {
    console.error(`Failed to copy ${sourcePath}:`, err);
  }
}

patchPackageJson('node_modules/socket.io/package.json', './dist/index.js');
patchPackageJson('node_modules/engine.io/package.json', './build/engine.io.js');
copyPackageFile('node_modules/retry-as-promised/dist/index.js', 'node_modules/retry-as-promised/index.js');
patchPackageMain('node_modules/retry-as-promised/package.json', './index.js');
