// Small, original EPUB for manual reader regression checks. No user books needed.
import JSZip from "jszip";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const zip = new JSZip();
zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file("OEBPS/content.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">margen-viewport-regression</dc:identifier><dc:title>Prueba del lector</dc:title><dc:language>es</dc:language><dc:creator>Pruebas de Margen</dc:creator><meta property="dcterms:modified">2026-09-12T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file("OEBPS/nav.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contenido</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Lectura de prueba</a></li></ol></nav></body></html>');
const paragraphs = Array.from({ length: 50 }, (_, index) => '<p id="p' + index + '">Párrafo ' + (index + 1) + '. Aprender implica observar con atención, conectar ideas y explicarlas con nuestras propias palabras. Una nota conserva una reflexión sobre el texto. La lectura debe mantener su posición cuando se abren las herramientas, para poder continuar sin perder el hilo de una idea.</p>').join("");
zip.file("OEBPS/chapter.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Lectura de prueba</title></head><body><h1>Lectura de prueba</h1>' + paragraphs + '</body></html>');
const path = join(await mkdtemp(join(tmpdir(), "margen-reader-test-")), "lector.epub");
await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
console.log(path);
