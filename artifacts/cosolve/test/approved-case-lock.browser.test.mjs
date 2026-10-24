import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const chromium = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
const testUrl =
  process.env.COSOLVE_BROWSER_TEST_URL ||
  "http://localhost:80/test/approved-case-lock.html";

test("approved compensation case-screen lock behaves correctly in Chromium", () => {
  const dom = execFileSync(
    chromium,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--no-first-run",
      "--virtual-time-budget=10000",
      "--dump-dom",
      testUrl,
    ],
    { encoding: "utf8", timeout: 45_000, maxBuffer: 8 * 1024 * 1024 },
  );
  assert.match(dom, /PASS: approved compensation case-screen browser regression/);
  assert.doesNotMatch(dom, /FAIL:/);
});
