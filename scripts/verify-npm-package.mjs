// 발행 tarball에 필수 산출물이 포함되는지 dry-run으로 검증한다.
// dist는 gitignore라 빌드 누락 시 빈 패키지가 나가는 것을 막는다.
import { execSync } from "node:child_process";

const out = execSync("npm pack --dry-run --json", { encoding: "utf8" });
const data = JSON.parse(out.slice(out.indexOf("[")));
const files = (data[0]?.files ?? []).map((f) => f.path);

const required = ["dist/index.js"];
const missing = required.filter((r) => !files.some((p) => p === r || p.startsWith(r)));

if (missing.length) {
  console.error(`tarball에 필수 파일 누락: ${JSON.stringify(missing)}`);
  console.error("tarball 파일:", files);
  process.exit(1);
}
console.log(`npm pack tarball OK (${files.length} files), 포함: ${JSON.stringify(required)}`);
