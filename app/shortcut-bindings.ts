export function findShortcutConflict<Action extends string>(
  shortcuts: Record<Action, string>,
  action: Action,
  shortcut: string,
): Action | undefined {
  if (!shortcut) return undefined;
  return (Object.keys(shortcuts) as Action[])
    .find((candidate) => candidate !== action && shortcuts[candidate] === shortcut);
}

export function assignShortcut<Action extends string>(
  shortcuts: Record<Action, string>,
  action: Action,
  shortcut: string,
): Record<Action, string> {
  if (findShortcutConflict(shortcuts, action, shortcut) || shortcuts[action] === shortcut) return shortcuts;
  return { ...shortcuts, [action]: shortcut };
}

export function restoreShortcuts<Action extends string>(
  defaults: Record<Action, string>,
  saved: unknown,
): Record<Action, string> {
  const values = saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved as Record<string, unknown>
    : {};
  const restored = { ...defaults };
  const assigned = new Set<string>();
  for (const action of Object.keys(defaults) as Action[]) {
    const value = Object.prototype.hasOwnProperty.call(values, action) && typeof values[action] === "string"
      ? values[action] as string
      : defaults[action];
    // Preserve the first binding: it is the action the reader previously ran.
    restored[action] = value && assigned.has(value) ? "" : value;
    if (value) assigned.add(value);
  }
  return restored;
}
