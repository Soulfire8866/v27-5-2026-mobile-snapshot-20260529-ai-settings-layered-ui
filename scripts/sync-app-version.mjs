/**
 * Ghi android/version.properties từ ngày build hiện tại (Rev DD.MM.YYYY).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { formatRevVersion } from "./lib/app-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const { versionName, versionCode, builtAt } = formatRevVersion();

const propsPath = path.join(root, "android", "version.properties");
const content = `# Tự sinh bởi npm run version:sync — không sửa tay
versionName=${versionName}
versionCode=${versionCode}
builtAt=${builtAt}
`;

fs.writeFileSync(propsPath, content, "utf8");
console.log(`Phiên bản app: ${versionName} (code ${versionCode})`);
console.log("Đã ghi", propsPath);
