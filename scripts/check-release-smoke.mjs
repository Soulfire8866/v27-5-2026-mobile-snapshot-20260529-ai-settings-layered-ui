/**
 * QA smoke phát hành (trước / sau build APK):
 * - App không import đồng bộ ReaderView (tránh đơ Home do parse ~1MB JS)
 * - Có chunk ReaderView tách trong dist/assets sau build
 * - dist/index.html + android/public tham chiếu asset tồn tại
 *
 * Chạy: node scripts/check-release-smoke.mjs
 * Đầy đủ trước APK: npm run build && npx cap sync android && npm run check:smoke
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const DIST_ASSETS = path.join(DIST, "assets");
const ANDROID_PUBLIC = path.join(ROOT, "android", "app", "src", "main", "assets", "public");
const ANDROID_ASSETS = path.join(ANDROID_PUBLIC, "assets");

let failed = 0;
let warned = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed++;
}

function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
  warned++;
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractAssetRefs(html) {
  const refs = [];
  const re = /(?:src|href)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ref = m[1];
    if (ref.startsWith("http") || ref.startsWith("data:")) continue;
    refs.push(ref.replace(/^\//, ""));
  }
  return refs;
}

function verifyHtmlAssets(htmlPath, baseDir, label) {
  if (!fs.existsSync(htmlPath)) {
    warn(`${label}: không có ${path.relative(ROOT, htmlPath)} — bỏ qua kiểm tra asset`);
    return;
  }
  const refs = extractAssetRefs(readText(htmlPath));
  let missing = 0;
  for (const ref of refs) {
    const target = path.join(baseDir, ref);
    if (!fs.existsSync(target)) {
      fail(`${label}: thiếu file ${ref}`);
      missing++;
    }
  }
  if (missing === 0) {
    pass(`${label}: ${refs.length} asset trong HTML đều tồn tại`);
  }
}

function listJsChunks(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
}

console.log("\n=== Smoke: tải Phòng Đọc (không chặn Home) ===\n");

const appTsx = path.join(ROOT, "src", "App.tsx");
const gateTsx = path.join(ROOT, "src", "components", "ReaderViewGate.tsx");

if (!fs.existsSync(appTsx)) {
  fail("Không tìm thấy src/App.tsx");
} else {
  const src = readText(appTsx);
  const usesReaderViewGate = /ReaderViewGate/.test(src);
  const usesReaderViewLazyOrImport = /import\s*\(\s*["'].*ReaderView["']\s*\)|lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*["'].*ReaderView["']/.test(
    src
  );

  if (usesReaderViewGate || usesReaderViewLazyOrImport) {
    pass("App.tsx tải ReaderView theo kiểu tách chunk (gate/lazy)");
  } else if (/import\s+ReaderView\s+from\s+["'].*\/ReaderView["']/.test(src)) {
    warn("App.tsx import tĩnh ReaderView — có thể không có chunk ReaderView-*.js (ổn với F1)");
  } else {
    warn("App.tsx chưa nhận diện rõ cách tải ReaderView — bỏ qua kiểm tra strict");
  }
  if (/preloadReaderView/.test(src)) {
    warn("App.tsx preload ReaderView sớm — có thể chặn cảm ứng Home trên APK");
  } else {
    pass("App.tsx không preload ReaderView lúc mở app (Home phản hồi trước)");
  }
}

// ReaderViewGate là tùy chọn (F1 có thể không dùng)
if (fs.existsSync(gateTsx)) {
  const gate = readText(gateTsx);
  if (/import\s*\(\s*["'].*ReaderView["']\s*\)/.test(gate)) {
    pass("ReaderViewGate.tsx có import() động ReaderView (tùy chọn)");
  }
}

const readerStrings = path.join(ROOT, "src", "components", "readerStrings.ts");
if (fs.existsSync(readerStrings)) {
  pass("readerStrings.ts tồn tại");
} else {
  warn("Thiếu readerStrings.ts");
}

console.log("\n=== Smoke: dist/ sau build ===\n");

const distIndex = path.join(DIST, "index.html");
if (!fs.existsSync(distIndex)) {
  warn("Chưa có dist/index.html — chạy: npm run build");
} else {
  verifyHtmlAssets(distIndex, DIST, "dist");

  const distJs = listJsChunks(DIST_ASSETS);
  const readerChunks = distJs.filter((f) => /^ReaderView-/.test(f));
  // Nếu App dùng gate/lazy thì mới bắt buộc chunk ReaderView tồn tại.
  const appSrc = fs.existsSync(appTsx) ? readText(appTsx) : "";
  const needsReaderChunk = /ReaderViewGate/.test(appSrc) || /import\s*\(\s*["'].*ReaderView["']/.test(appSrc);

  if (needsReaderChunk) {
    if (readerChunks.length === 0) {
      fail("dist/assets thiếu chunk ReaderView-*.js — Phòng Đọc sẽ kẹt khi mở tab");
    } else {
      pass(`dist/assets có chunk Phòng Đọc: ${readerChunks.join(", ")}`);
    }
  } else {
    if (readerChunks.length === 0) {
      warn("Không thấy chunk ReaderView-*.js trong dist (nhưng có thể đúng với F1 import tĩnh)");
    } else {
      pass(`dist/assets có chunk ReaderView-*: ${readerChunks.join(", ")}`);
    }
  }

  const mainJs = distJs
    .filter((f) => f.startsWith("index-") && !f.includes("legacy"))
    .map((f) => ({
      name: f,
      bytes: fs.statSync(path.join(DIST_ASSETS, f)).size,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  if (mainJs.length > 0) {
    const largest = mainJs[0];
  if (largest.bytes > 750_000) {
      warn(
        `Bundle chính ${largest.name} vẫn lớn (${Math.round(largest.bytes / 1024)} KB) — có thể chậm trên WebView`
      );
    } else {
      pass(`Bundle chính ${largest.name} ~${Math.round(largest.bytes / 1024)} KB`);
    }
  }
}

console.log("\n=== Smoke: Capacitor public/ sau cap sync ===\n");

const androidIndex = path.join(ANDROID_PUBLIC, "index.html");
if (!fs.existsSync(androidIndex)) {
  warn("Chưa có android/.../public/index.html — chạy: npx cap sync android (từ thư mục gốc repo)");
} else {
  verifyHtmlAssets(androidIndex, ANDROID_PUBLIC, "android public");
  if (fs.existsSync(distIndex)) {
    const distRefs = extractAssetRefs(readText(distIndex)).sort().join("\n");
    const andRefs = extractAssetRefs(readText(androidIndex)).sort().join("\n");
    if (distRefs !== andRefs) {
      warn("index.html dist và android/public khác tham chiếu — nên cap sync lại");
    } else {
      pass("android/public/index.html khớp dist/index.html");
    }
  }

  if (fs.existsSync(DIST_ASSETS) && fs.existsSync(ANDROID_ASSETS)) {
    const distJs = listJsChunks(DIST_ASSETS);
    const missingOnAndroid = distJs.filter(
      (f) => !fs.existsSync(path.join(ANDROID_ASSETS, f))
    );
    if (missingOnAndroid.length > 0) {
        const appSrcForChunkCheck = readText(appTsx);
        const needsReaderChunkOnAndroid =
          /ReaderViewGate/.test(appSrcForChunkCheck) ||
          /import\s*\(\s*["'].*ReaderView["']\s*\)/.test(appSrcForChunkCheck) ||
          /lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*["'].*ReaderView["']/.test(appSrcForChunkCheck);
      // Với ReaderView (lazy/gate), thiếu chunk sẽ kẹt Suspense => fail phát hành ngay.
      const missingReader = missingOnAndroid.some((f) => /^ReaderView-/.test(f));
      if (missingReader && needsReaderChunkOnAndroid) {
        fail(
          `android/assets thiếu chunk ReaderView (*.js). Thiếu: ${missingOnAndroid.filter((f) => /^ReaderView-/.test(f)).join(", ")} — chạy lại: npx cap sync android (từ thư mục gốc repo)`
        );
      } else {
        warn(
          `android/assets thiếu ${missingOnAndroid.length} file JS (vd. ${missingOnAndroid.slice(0, 3).join(", ")}) — chạy: npx cap sync android`
        );
      }
    } else {
      pass(`android/assets khớp đủ ${distJs.length} file JS từ dist`);
    }
  }
}

console.log("\n=== Tổng kết smoke ===\n");
console.log(`  Failed: ${failed}`);
console.log(`  Warnings: ${warned}`);

if (failed > 0) {
  process.exit(1);
}

console.log("  Smoke: OK (xem warnings trước khi build APK)\n");
