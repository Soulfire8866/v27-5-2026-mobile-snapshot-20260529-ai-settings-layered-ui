/**
 * CI: phát hiện chuỗi UI có dấu hiệu mojibake (UTF-8 đọc nhầm Latin-1).
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const MOJIBAKE = /Ã|â€|Ä|Æ°|áº|Â«|Â»|\uFFFD/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|json|md|html)$/i;
/** Regex char class hợp lệ (VFSManager slugify). */
const ALLOWLIST_FILES = new Set([
  path.normalize("src/components/VFSManager.tsx"),
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(name.name)) continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(name.name)) out.push(full);
  }
  return out;
}

const hits = [];
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (ALLOWLIST_FILES.has(path.normalize(rel))) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (MOJIBAKE.test(line)) {
      hits.push({ file: rel, line: i + 1, sample: line.trim().slice(0, 120) });
    }
  });
}

if (hits.length > 0) {
  console.error(`check-encoding: ${hits.length} dòng nghi mojibake:\n`);
  for (const h of hits.slice(0, 30)) {
    console.error(`  ${h.file}:${h.line}  ${h.sample}`);
  }
  if (hits.length > 30) console.error(`  … và ${hits.length - 30} dòng khác`);
  process.exit(1);
}

console.log("check-encoding: OK (không phát hiện mojibake trong src/)");
