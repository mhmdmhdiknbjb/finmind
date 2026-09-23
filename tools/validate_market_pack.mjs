// Sanity gate for a freshly-exported market_pack.json before it's allowed to replace the live one.
// Exists because a silent upstream discovery bug (tsetmc-crawler.mjs's paperTypes filter excluding
// almost all mutual funds) once produced a market_pack with equity_fund/fixed_income_fund at 0%
// finite — a file that "exported successfully" (exit 0) but was actually broken. This catches that
// class of failure before daily_refresh.ps1 lets it become the file the server actually reads.
//
// usage: node tools/validate_market_pack.mjs <path-to-staged-pack.json>
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node tools/validate_market_pack.mjs <path>");
  process.exit(2);
}
const pack = JSON.parse(fs.readFileSync(path, "utf8"));

const MIN_FINITE_FRACTION = 0.9; // each series must be at least this complete over the exported window
let failures = [];

for (const [name, arr] of Object.entries(pack.series || {})) {
  const finite = arr.filter((x) => x !== null).length;
  const frac = arr.length ? finite / arr.length : 0;
  if (frac < MIN_FINITE_FRACTION) {
    failures.push(`series "${name}": only ${(frac * 100).toFixed(1)}% finite (${finite}/${arr.length}) — need >= ${MIN_FINITE_FRACTION * 100}%`);
  }
}

if (!pack.meta?.asof) failures.push("meta.asof missing");
if (!Object.keys(pack.regime || {}).length) failures.push("regime block is empty");
if (!pack.forward_baseline_b2) failures.push("forward_baseline_b2 missing");

if (failures.length) {
  console.error(`INVALID market pack (${path}):`);
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}

console.log(`OK: ${path} — as-of ${pack.meta.asof}, ${Object.keys(pack.series).length} series, all >= ${MIN_FINITE_FRACTION * 100}% finite.`);
