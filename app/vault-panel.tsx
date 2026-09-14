"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import {
  authorizeVault, chooseVault, copyCloudLibraryToVault, disconnectVault, getVaultServerStatus,
  getVaultStatus, openVaultEpub, restoreBookFromVault, restoreVaultPreferences, subscribeVault, vaultSupported,
} from "./vault-store";
import type { VaultBook } from "./vault-core";

type Props = { open: boolean; onClose: () => void; onOpenBook: (file: File) => Promise<void>; onCreate: () => Promise<void> };
const subscribeCapability = () => () => undefined;

export function VaultPanel({ open, onClose, onOpenBook, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useSyncExternalStore(subscribeVault, getVaultStatus, getVaultServerStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<VaultBook | null>(null);
  const available = useSyncExternalStore(subscribeCapability, vaultSupported, () => false);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "No se pudo completar la operación."); }
    finally { setBusy(false); }
  }
  const connected = status.state !== "unlinked" && status.name;
  return <dialog ref={dialog} className="vault-dialog" aria-labelledby="vault-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    <header><div><small>TUS ARCHIVOS</small><h2 id="vault-title">Carpeta de Margen</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar carpeta de Margen"><Icon name="close" /></button></header>
    <div className="vault-body">
      <p>Una carpeta tuya, con tus libros y tu trabajo. Puedes copiarla, trasladarla a otro disco y volver a abrirla en Margen.</p>
      <div className={`vault-state vault-${status.state}`} role="status"><Icon name={status.state === "error" || status.state === "permission" ? "alert" : "archive"} /><div><strong>{connected ? status.name : "Elige dónde guardar tu biblioteca"}</strong><span>{status.message}{status.savedAt && ` · ${new Date(status.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span></div></div>
      {!available ? <p>La carpeta local necesita Chrome en tu computadora. Aquí puedes seguir usando la biblioteca sincronizada; tus archivos llegarán a la carpeta cuando la actualices desde la computadora.</p> : <div className="vault-actions">
        <button type="button" disabled={busy || status.state === "saving"} onClick={() => void run(async () => {
          await chooseVault(true);
          if (!getVaultStatus().books.length) { await onCreate(); await copyCloudLibraryToVault(); }
          setMessage("Carpeta conectada. Tus cambios se guardarán aquí mientras Margen esté abierto.");
        })}><Icon name="plus" size={14} />Crear / elegir carpeta</button>
        <button type="button" disabled={busy || status.state === "saving"} onClick={() => void run(async () => { await chooseVault(false); setMessage("Carpeta abierta. Elige un libro para continuar o recupera sus datos en tu cuenta."); })}><Icon name="archive" size={14} />Abrir carpeta existente</button>
        {status.state === "permission" && <button type="button" disabled={busy} onClick={() => void run(authorizeVault)}>Autorizar carpeta</button>}
      </div>}
      {connected && status.state !== "permission" && <>
        <h3>Libros en esta carpeta <span>{status.books.length}</span></h3>
        <div className="vault-books">{status.books.map((book) => <div key={book.id}>
          <button type="button" disabled={busy} onClick={() => void run(async () => { const file = await openVaultEpub(book.id); if (file) { await onOpenBook(file); onClose(); } })}><Icon name="bookOpen" /><span><strong>{book.title}</strong><small>{book.author}</small></span></button>
          <button type="button" className="vault-recover" disabled={busy} title="Recuperar las anotaciones de esta carpeta en tu cuenta" onClick={() => setRestoreTarget(book)}>Recuperar datos</button>
        </div>)}</div>
        {!status.books.length && <p>No hay libros todavía. Los EPUB que abras se guardarán en esta carpeta.</p>}
        {restoreTarget && <div className="vault-confirm" role="alert"><p>Recuperar <strong>{restoreTarget.title}</strong> añadirá sus anotaciones a tu cuenta. No eliminará las actuales ni reemplazará ediciones más recientes. Una copia antigua puede recuperar notas que habías borrado.</p><button type="button" disabled={busy} onClick={() => void run(async () => { await restoreBookFromVault(restoreTarget); setRestoreTarget(null); setMessage("Datos recuperados. Abre el libro para continuar."); })}>Recuperar este libro</button><button type="button" disabled={busy} onClick={() => setRestoreTarget(null)}>Cancelar</button></div>}
        <details><summary>Contenido y recuperación</summary><p>EPUB originales, notas, flashcards, subrayados, chats, pizarra, repasos, actividades guardadas y posición de lectura. Cada libro tiene su archivo de datos y una copia anterior. Los ajustes están separados.</p><p>Los archivos no contienen contraseñas ni claves de IA. El índice de búsqueda y otros datos temporales se reconstruyen.</p><button type="button" disabled={busy} onClick={() => void run(async () => { await restoreVaultPreferences(); setMessage("Ajustes recuperados. Cierra y vuelve a abrir Margen para aplicarlos."); })}>Recuperar ajustes de esta carpeta</button></details>
        <div className="vault-secondary"><button type="button" disabled={busy || status.state === "saving"} onClick={() => void run(async () => { await copyCloudLibraryToVault(); setMessage("Biblioteca actualizada en tu carpeta."); })}><Icon name="redo" size={13} />Traer cambios de otros dispositivos</button><button type="button" disabled={busy || status.state === "saving"} onClick={() => void run(disconnectVault)}>Desconectar sin borrar archivos</button></div>
      </>}
      {(message || busy) && <p className="vault-message" role="status">{busy ? "Guardando archivos. Mantén esta ventana abierta…" : message}</p>}
    </div>
    <footer>La carpeta se actualiza mientras Margen está abierto y tiene permiso. La IA y la sincronización siguen necesitando internet.</footer>
  </dialog>;
}
