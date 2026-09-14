"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { AnnotationActions, type AnnotationActionsProps } from "./annotation-tools";
import { conversionEdges } from "./annotation-conversion";
import { boardConnectionPath, layoutBoardNodes, type BoardPosition } from "./board-layout";
import type { ReaderNote } from "./study-contract";
import { hydrateSyncedDocument, saveSyncedDocument, type DeviceSyncStatus } from "./device-sync";

type BoardEdge = { id: string; from: string; to: string };
type MetaNote = { id: string; text: string };

type WhiteboardPageProps = AnnotationActionsProps & {
  open: boolean;
  bookKey: string;
  bookTitle: string;
  notes: ReaderNote[];
  onClose: () => void;
  onOpenNote: (note: ReaderNote) => void;
  onSyncStatusChange?: (status: DeviceSyncStatus) => void;
};

type StoredBoard = { positions: Record<string, BoardPosition>; edges: BoardEdge[]; metaNotes: MetaNote[] };

export function WhiteboardPage(props: WhiteboardPageProps) {
  if (!props.open) return null;
  return <WhiteboardWorkspace key={props.bookKey} {...props} />;
}

function WhiteboardWorkspace(props: WhiteboardPageProps) {
  const [storedBoard] = useState<StoredBoard>(() => {
    if (typeof window === "undefined" || !props.bookKey) return { positions: {}, edges: [], metaNotes: [] };
    try {
      const saved = window.localStorage.getItem(`lector-whiteboard:${props.bookKey}`);
      const value = saved ? JSON.parse(saved) as Partial<StoredBoard> : {};
      return { positions: value.positions ?? {}, edges: value.edges ?? [], metaNotes: value.metaNotes ?? [] };
    } catch { return { positions: {}, edges: [], metaNotes: [] }; }
  });
  const [positions, setPositions] = useState<Record<string, BoardPosition>>(storedBoard.positions);
  const [edges, setEdges] = useState<BoardEdge[]>(storedBoard.edges);
  const [metaNotes, setMetaNotes] = useState<MetaNote[]>(storedBoard.metaNotes);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [newMeta, setNewMeta] = useState("");
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const nodes = useMemo(() => [
    ...props.notes.filter((note) => note.kind === "comment").map((note) => ({ id: `note-${note.id}`, title: note.anchorLabel || note.chapterTitle, text: note.back, note })),
    ...metaNotes.map((meta) => ({ id: meta.id, title: "Metanota", text: meta.text, note: null })),
    ...props.notes.filter((note) => note.kind === "flashcard").map((note) => ({ id: `note-${note.id}`, title: note.front, text: note.back, note })),
  ], [props.notes, metaNotes]);
  const origins = useMemo(() => conversionEdges(props.notes), [props.notes]);
  const layout = useMemo(() => layoutBoardNodes(nodes.map((node) => ({ id: node.id, sourceId: origins.find((edge) => edge.to === node.id)?.from })), positions), [nodes, origins, positions]);
  // Remember new nodes once, so later edits or conversions cannot rearrange them.
  if (syncReady && nodes.some((node) => !positions[node.id])) setPositions(layout);
  const boardSize = { width: Math.max(1800, ...Object.values(layout).map((point) => point.x + 350)), height: Math.max(1200, ...Object.values(layout).map((point) => point.y + 360)) };
  const boardSnapshot = useRef({ positions: layout, edges, metaNotes });

  useEffect(() => {
    if (!props.open || !props.bookKey) return;
    let active = true;
    void hydrateSyncedDocument(props.bookKey, "whiteboard", storedBoard, props.onSyncStatusChange).then((synced) => {
      if (!active) return;
      if (synced && typeof synced === "object" && !Array.isArray(synced)) {
        const board = synced as Partial<StoredBoard>;
        setPositions(board.positions ?? {});
        setEdges(Array.isArray(board.edges) ? board.edges : []);
        setMetaNotes(Array.isArray(board.metaNotes) ? board.metaNotes : []);
      }
      setSyncReady(true);
    });
    return () => { active = false; };
    // La hidratación debe ejecutarse una sola vez al abrir esta pizarra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bookKey, props.open]);

  useEffect(() => {
    if (!props.open || !props.bookKey || !syncReady) return;
    const board = { positions: layout, edges, metaNotes };
    boardSnapshot.current = board;
    try { window.localStorage.setItem(`lector-whiteboard:${props.bookKey}`, JSON.stringify(board)); } catch { /* la copia remota sigue disponible */ }
    const timer = window.setTimeout(() => {
      void saveSyncedDocument(props.bookKey, "whiteboard", board, props.onSyncStatusChange);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [edges, metaNotes, layout, props.bookKey, props.onSyncStatusChange, props.open, syncReady]);

  useEffect(() => {
    if (!syncReady) return;
    // Closing immediately after drawing must not drop the last connection.
    return () => { void saveSyncedDocument(props.bookKey, "whiteboard", boardSnapshot.current, props.onSyncStatusChange); };
  }, [props.bookKey, props.onSyncStatusChange, syncReady]);

  const positionFor = (id: string) => {
    return layout[id] ?? { x: 100, y: 100 };
  };

  const chooseNode = (id: string, note: ReaderNote | null) => {
    if (!syncReady) return;
    if (connectMode && !connectFrom) { setConnectFrom(id); return; }
    if (connectMode && connectFrom && connectFrom !== id) {
      const pair = [connectFrom, id].sort().join(":");
      setEdges((current) => current.some((edge) => [edge.from, edge.to].sort().join(":") === pair) ? current : [...current, { id: `edge-${Date.now()}`, from: connectFrom, to: id }]);
      setConnectFrom(null);
      setConnectMode(false);
      return;
    }
    if (connectMode && connectFrom === id) { setConnectFrom(null); return; }
    if (note) props.onOpenNote(note);
  };

  const startDrag = (event: React.PointerEvent, id: string) => {
    if (!syncReady) return;
    const position = positionFor(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
  };
  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPositions({ ...layout, [drag.id]: { x: Math.max(20, drag.originX + (event.clientX - drag.startX) / zoom), y: Math.max(20, drag.originY + (event.clientY - drag.startY) / zoom) } });
  };

  const addMeta = () => {
    const text = newMeta.trim();
    if (!text) return;
    const id = `meta-${Date.now()}`;
    setMetaNotes((current) => [...current, { id, text }]);
    setPositions((current) => ({ ...current, [id]: { x: 180 + metaNotes.length * 30, y: 150 + metaNotes.length * 26 } }));
    setNewMeta(""); setShowMetaForm(false);
  };

  return (
    <div className="knowledge-page whiteboard-workspace" role="dialog" aria-modal="true" aria-label="Pizarra de notas y flashcards">
      <header className="whiteboard-header"><button type="button" onClick={props.onClose}><Icon name="arrowLeft" size={14} /> Lector</button><div><span>NOTAS Y FLASHCARDS · LAS FLECHAS INDICAN EL ORIGEN</span><h1>{props.bookTitle || "Pizarra de ideas"}</h1></div><div><button type="button" disabled={!syncReady} onClick={() => setShowMetaForm(true)}><Icon name="plus" size={13} /> Metanota</button><button type="button" disabled={!syncReady} className={connectMode ? "active" : ""} onClick={() => { setConnectMode((current) => !current); setConnectFrom(null); }}><Icon name="link" size={14} /> {connectFrom ? "Elige el destino" : connectMode ? "Elige el origen" : "Conectar"}</button><button type="button" onClick={() => setZoom((current) => Math.max(.7, current - .1))} aria-label="Reducir zoom"><Icon name="minus" size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((current) => Math.min(1.5, current + .1))} aria-label="Ampliar zoom"><Icon name="plus" size={14} /></button></div></header>
      <div className="whiteboard-canvas">
        <div className="whiteboard-surface" style={{ ...boardSize, transform: `scale(${zoom})` }}>
          <svg className="whiteboard-connections" width={boardSize.width} height={boardSize.height} aria-label="Conexiones entre anotaciones">
            <defs><marker id="conversion-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
            {edges.filter((edge) => nodes.some((node) => node.id === edge.from) && nodes.some((node) => node.id === edge.to)).map((edge) => <path key={edge.id} d={boardConnectionPath(positionFor(edge.from), positionFor(edge.to)).path} className="board-manual-edge" tabIndex={0} role="button" aria-label="Eliminar conexión manual" onClick={() => syncReady && setEdges((current) => current.filter((item) => item.id !== edge.id))} onKeyDown={(event) => { if (event.key === "Enter" && syncReady) setEdges((current) => current.filter((item) => item.id !== edge.id)); }}><title>Conexión manual · clic para eliminar</title></path>)}
{origins.map((edge) => { const line = boardConnectionPath(positionFor(edge.from), positionFor(edge.to)); const label = edge.source.kind === "comment" ? "Nota → Flashcard" : "Flashcard → Nota"; return <g key={edge.id} className="board-origin-edge" tabIndex={0} role="button" aria-label={`Ver origen: ${label}`} onClick={() => props.onShowOrigin(edge.target)} onKeyDown={(event) => { if (event.key === "Enter") props.onShowOrigin(edge.target); }}><title>{`${label} · ver el original de esta conversión`}</title><path d={line.path} markerEnd="url(#conversion-arrow)" /><text x={line.x} y={line.y} textAnchor="middle">{label}</text></g>; })}
          </svg>
          {nodes.map((node, index) => { const position = positionFor(node.id); return <article key={node.id} className={`whiteboard-node ${node.note?.kind === "flashcard" ? "flashcard-node" : node.note ? "note-node" : "meta-node"} tone-${index % 4} ${connectFrom === node.id ? "is-connecting" : ""}`} style={{ left: position.x, top: position.y }}><header onPointerDown={(event) => startDrag(event, node.id)} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}><span>{node.note?.kind === "flashcard" ? "FLASHCARD" : node.note ? "NOTA" : "METANOTA"}</span><b><Icon name="grip" size={13} /></b></header><button type="button" disabled={!syncReady} onClick={() => chooseNode(node.id, node.note)}><strong>{node.title}</strong><p>{node.text}</p><small>{connectMode ? connectFrom ? "Conectar aquí" : "Usar como origen" : node.note?.kind === "flashcard" ? "Abrir flashcard" : node.note ? "Abrir nota" : "Idea de síntesis"} <Icon name="arrowRight" size={12} /></small></button>{node.note && !connectMode && <AnnotationActions note={node.note} onConvert={props.onConvert} onShowOrigin={props.onShowOrigin} />}</article>; })}
          {!nodes.length && <div className="whiteboard-empty"><span><Icon name="board" size={20} /></span><h2>Tu pizarra está lista</h2><p>Crea notas o flashcards en el lector o añade una metanota para comenzar a conectar ideas.</p><button type="button" onClick={() => setShowMetaForm(true)}>Crear la primera metanota</button></div>}
        </div>
      </div>
      {showMetaForm && <div className="knowledge-dialog-backdrop"><section className="knowledge-dialog" role="dialog" aria-modal="true" aria-label="Crear metanota"><header><div><span>SÍNTESIS</span><h2>Nueva metanota</h2></div><button type="button" onClick={() => setShowMetaForm(false)} aria-label="Cerrar creación de metanota"><Icon name="close" size={14} /></button></header><label>Idea que conecta varias notas<textarea value={newMeta} onChange={(event) => setNewMeta(event.target.value)} rows={7} placeholder="Escribe una síntesis, pregunta o conexión…" /></label><footer><button type="button" onClick={() => setShowMetaForm(false)}>Cancelar</button><button className="primary" type="button" onClick={addMeta} disabled={!newMeta.trim()}>Añadir a la pizarra</button></footer></section></div>}
    </div>
  );
}
