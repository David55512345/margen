export type BoardPosition = { x: number; y: number };
type LayoutNode = { id: string; sourceId?: string | null };

export function layoutBoardNodes(nodes: LayoutNode[], saved: Record<string, BoardPosition>) {
  const positions = { ...saved };
  for (const node of nodes) {
    const current = positions[node.id];
    if (current && Number.isFinite(current.x) && Number.isFinite(current.y)) continue;
    const source = node.sourceId ? positions[node.sourceId] : null;
    let position = source ? { x: Math.max(30, source.x + 320), y: Math.max(30, source.y) } : { x: 100, y: 100 };
    const occupied = Object.entries(positions).filter(([id, point]) => id !== node.id && Number.isFinite(point?.x) && Number.isFinite(point?.y)).map(([, point]) => point);
    while (occupied.some((point) => Math.abs(point.x - position.x) < 285 && Math.abs(point.y - position.y) < 290)) {
      position = position.x < 1380 ? { x: position.x + 320, y: position.y } : { x: 100, y: position.y + 320 };
    }
    positions[node.id] = position;
  }
  return positions;
}

export function boardConnectionPath(from: BoardPosition, to: BoardPosition) {
  const forward = to.x >= from.x;
  const x1 = from.x + (forward ? 250 : 0); const y1 = from.y + 110;
  const x2 = to.x + (forward ? 0 : 250); const y2 = to.y + 110;
  const bend = Math.max(50, Math.abs(x2 - x1) * .5) * (forward ? 1 : -1);
  return { path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 10 };
}
