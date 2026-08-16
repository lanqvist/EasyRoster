/**
 * Сборка портативной версии для Windows x64:
 *   dist-portable/EasyRoster/
 *     EasyRoster.cmd            — запуск (node\node.exe app\apps\server\dist\index.js --open)
 *     node\node.exe             — встроенный Node.js (скачивается с nodejs.org)
 *     app\                      — собранный сервер/UI/аддон + production node_modules
 *     data\                     — конфиг и база (создаётся при первом запуске)
 *   dist-portable/EasyRoster-portable-win64-v<version>.zip
 *
 * Использование: node scripts/build-portable.mjs [--node 24.16.0] [--skip-build]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const nodeVersion = (args.includes("--node") ? args[args.indexOf("--node") + 1] : process.versions.node).replace(/^v/, "");
const skipBuild = args.includes("--skip-build");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

const out = path.join(root, "dist-portable");
const stage = path.join(out, "EasyRoster");
const app = path.join(stage, "app");

const run = (cmd, cwd = root) => {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
};
const cp = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};

if (!skipBuild) run("npm run build");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(app, { recursive: true });

// --- приложение: собранные артефакты в той же раскладке, что и репозиторий (paths.ts считает REPO_ROOT от apps/server/dist)
cp(path.join(root, "apps/server/dist"), path.join(app, "apps/server/dist"));
cp(path.join(root, "apps/server/package.json"), path.join(app, "apps/server/package.json"));
cp(path.join(root, "apps/web/dist"), path.join(app, "apps/web/dist"));
cp(path.join(root, "packages/core/dist"), path.join(app, "packages/core/dist"));
cp(path.join(root, "packages/core/package.json"), path.join(app, "packages/core/package.json"));
cp(path.join(root, "addon"), path.join(app, "addon"));
cp(path.join(root, "README.md"), path.join(stage, "README.md"));
cp(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));

// --- production-зависимости сервера
const serverPkg = JSON.parse(fs.readFileSync(path.join(root, "apps/server/package.json"), "utf8"));
const deps = { ...serverPkg.dependencies };
delete deps["@easyroster/core"];
fs.writeFileSync(
  path.join(app, "package.json"),
  JSON.stringify({ name: "easyroster-portable", private: true, version, type: "module", dependencies: deps }, null, 2),
);
run("npm install --omit=dev --no-audit --no-fund --ignore-scripts", app);
// core как локальный пакет
cp(path.join(app, "packages/core"), path.join(app, "node_modules/@easyroster/core"));

// --- Node.js runtime
const nodeDir = path.join(stage, "node");
fs.mkdirSync(nodeDir, { recursive: true });
const zipName = `node-v${nodeVersion}-win-x64.zip`;
const cache = path.join(root, "data", "cache", zipName);
if (!fs.existsSync(cache)) {
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  const url = `https://nodejs.org/dist/v${nodeVersion}/${zipName}`;
  console.log(`> download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`nodejs.org ${res.status}`);
  fs.writeFileSync(cache, Buffer.from(await res.arrayBuffer()));
}
const tmp = path.join(out, "node-tmp");
fs.mkdirSync(tmp, { recursive: true });
run(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${cache}' -DestinationPath '${tmp}' -Force"`);
const extracted = path.join(tmp, `node-v${nodeVersion}-win-x64`);
for (const f of ["node.exe", "LICENSE"]) fs.copyFileSync(path.join(extracted, f), path.join(nodeDir, f));
fs.rmSync(tmp, { recursive: true, force: true });

// --- запуск
fs.writeFileSync(
  path.join(stage, "EasyRoster.cmd"),
  [
    "@echo off",
    "chcp 65001 >nul",
    "rem EasyRoster portable — данные хранятся в папке data рядом с этим файлом",
    'cd /d "%~dp0"',
    "set EASYROSTER_DATA_DIR=%~dp0data",
    'if not exist "%EASYROSTER_DATA_DIR%" mkdir "%EASYROSTER_DATA_DIR%"',
    'title EasyRoster',
    'echo EasyRoster запускается... окно можно свернуть; закрытие окна остановит сервер.',
    '"%~dp0node\\node.exe" "%~dp0app\\apps\\server\\dist\\index.js" --open',
    "pause",
    "",
  ].join("\r\n"),
);
fs.mkdirSync(path.join(stage, "data"), { recursive: true });
fs.writeFileSync(path.join(stage, "data", "README.txt"), "Здесь хранятся config.json (ключи API), easyroster.sqlite и кэши. Для переноса скопируйте папку целиком.\r\n");

// --- zip
const zipPath = path.join(out, `EasyRoster-portable-win64-v${version}.zip`);
run(`powershell -NoProfile -Command "Compress-Archive -LiteralPath '${stage}' -DestinationPath '${zipPath}' -Force"`);
const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`\nГотово: ${zipPath} (${mb} МБ), Node ${nodeVersion}`);
