const assert = require("node:assert/strict"),
  fs = require("fs"),
  vm = require("vm"),
  path = require("path");
const storage = new Map(),
  source = fs.readFileSync(path.join(__dirname, "../js/timeline.js"), "utf8");
function app() {
  const c = vm.createContext({
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(source, c);
  return c;
}
let c = app();
const msg = (id, sec) => ({ id, createdAt: "2026-11-15T00:00:" + sec + "Z" }),
  keys = (list) => Array.from(list, (m) => (m.agreement ? "c" + m.agreement.id : "m" + m.id));
const m1 = msg(1, "01"),
  m2 = msg(2, "03"),
  card = { id: "1" };
assert.deepEqual(keys(c.mergeTimeline("2", [m1], [])), ["m1"]);
c.rememberTimelineCard("2", 1);
assert.deepEqual(keys(c.mergeTimeline("2", [m1, m2], [card])), ["m1", "c1", "m2"]);
assert.deepEqual(keys(c.mergeTimeline("2", [m1, m2], [{ ...card, status: "CONFIRMED" }])), [
  "m1",
  "c1",
  "m2",
]);
c = app();
assert.deepEqual(keys(c.mergeTimeline("2", [m1, m2], [card])), ["m1", "c1", "m2"]);
assert.deepEqual(
  keys(c.mergeTimeline("3", [m1, m2], [{ ...card, createdAt: "2026-11-15T00:00:02Z" }])),
  ["m1", "c1", "m2"],
);
assert.deepEqual(keys(c.mergeTimeline("4", [m1], [])), ["m1"]);
assert.deepEqual(keys(c.mergeTimeline("5", [m1, m2], [card])), ["m1", "m2", "c1"]);
assert.deepEqual(
  keys(c.mergeTimeline("5", [m1, m2], [{ ...card, createdAt: "2026-11-15T00:00:02Z" }])),
  ["m1", "c1", "m2"],
);
assert.equal(storage.get("nunchichat.timeline.v1.2"), '["message:1","card:1","message:2"]');
console.log(
  "PASS: mixed timeline, confirmation stability, reload, room isolation, server timestamp precedence, metadata-only storage.",
);
