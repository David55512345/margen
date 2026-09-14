import assert from "node:assert/strict";
import test from "node:test";
import { assignShortcut, findShortcutConflict, restoreShortcuts } from "../app/shortcut-bindings.ts";

const defaults = { mode_reading: "", mode_highlight: "", play_pause: "Space", voice_input: "KeyV", speed_boost: "KeyA" };

test("a duplicate shortcut is rejected without changing either action", () => {
  const current = assignShortcut(defaults, "mode_reading", "KeyL");
  assert.equal(findShortcutConflict(current, "mode_highlight", "KeyL"), "mode_reading");
  assert.equal(assignShortcut(current, "mode_highlight", "KeyL"), current);
  assert.equal(current.mode_highlight, "");
  assert.equal(current.mode_reading, "KeyL");
  assert.equal(assignShortcut(current, "mode_highlight", "Space"), current);
});

test("distinct modifiers, the current binding, and unassigned actions remain valid", () => {
  const current = assignShortcut(defaults, "mode_reading", "KeyL");
  const updated = assignShortcut(current, "mode_highlight", "Ctrl+KeyL");
  assert.equal(updated.mode_highlight, "Ctrl+KeyL");
  assert.equal(findShortcutConflict(updated, "mode_reading", "KeyL"), undefined);
  assert.equal(assignShortcut(updated, "mode_reading", "KeyL"), updated);
  assert.equal(findShortcutConflict(defaults, "mode_reading", ""), undefined);
  const cleared = assignShortcut(updated, "mode_reading", "");
  assert.equal(assignShortcut(cleared, "mode_highlight", "KeyL").mode_highlight, "KeyL");
});

test("old stored duplicates keep the previously active function and survive reload", () => {
  const saved = { ...defaults, mode_reading: "KeyL", mode_highlight: "KeyL", voice_input: "Space" };
  const restored = restoreShortcuts(defaults, saved);
  assert.equal(restored.mode_reading, "KeyL");
  assert.equal(restored.mode_highlight, "");
  assert.equal(restored.play_pause, "Space");
  assert.equal(restored.voice_input, "");
  assert.equal(restored.speed_boost, "KeyA");
  assert.deepEqual(restoreShortcuts(defaults, JSON.parse(JSON.stringify(restored))), restored);
  assert.equal(saved.mode_highlight, "KeyL");
});

test("malformed or partial preferences restore known actions safely", () => {
  for (const value of [null, [], "bad data", 42]) assert.deepEqual(restoreShortcuts(defaults, value), defaults);
  assert.deepEqual(restoreShortcuts(defaults, { play_pause: null, unknown_action: "KeyV", mode_reading: "KeyL" }), { ...defaults, mode_reading: "KeyL" });
});
