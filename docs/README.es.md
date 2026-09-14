# Margen — lectura inteligente

**Lee, escucha, anota y convierte tus EPUB en conocimiento conectado.**

[English](../README.md) · [Contribuir](../CONTRIBUTING.md) · [Privacidad](data-and-privacy.md)

Margen reúne lector EPUB, voz del navegador, notas contextuales, flashcards, actividades de estudio y una pizarra de conexiones. Su interfaz está principalmente en español. La IA es opcional y utiliza el fragmento seleccionado y contexto relevante del libro.

Es una **primera versión pública**, nacida de un flujo personal de lectura. Este repositorio contiene el programa; no contiene libros, notas personales ni la configuración de la cuenta privada del mantenedor.

## Probarlo

Instala Node.js 22.13 o posterior y ejecuta:

```sh
git clone https://github.com/David55512345/margen.git
cd margen
npm ci
npm run db:local
npm run dev
```

Abre la dirección local indicada por el servidor. `npm run demo:epub` genera un EPUB temporal de prueba con texto original. No necesitas una cuenta de Cloudflare ni clave de OpenAI para probar el lector y el motor local limitado. Para IA generativa configura tu propia clave de servidor en `.dev.vars`, como explica [el README principal](../README.md#optional-ai). El uso de la API puede tener costo.

## Funciones principales

- Lectura por página o scroll, temas, tamaño de texto y atajos sin duplicados.
- Notas flotantes, subrayados y referencias al fragmento original.
- Flashcards editables, repaso y exportación para Anki.
- Conversión entre notas y flashcards conservando el original y su vínculo de procedencia.
- Pizarra para conectar ambos tipos de anotaciones.
- Voz, pausa, reanudación, volumen, velocidad y dictado según navegador.
- Actividades por capítulo y asistencia contextual opcional.
- Copias en una carpeta elegida por el usuario en navegadores compatibles.

La instalación local guarda su base y libros emulados en `.wrangler/state`. No se conecta automáticamente a tu cuenta de Sites ni al teléfono. La carpeta elegida, los datos del navegador y la base local son ubicaciones distintas: consulta [datos y privacidad](data-and-privacy.md).

## Desarrollo y límites

Ejecuta `npm test` antes de proponer cambios. Aún faltan más pruebas en móvil, mejoras de accesibilidad y una integración de autenticación portable para alojamiento fuera de Sites. No expongas el servidor de desarrollo a internet. [Detalles técnicos](development.md) · [Hoja de ruta](roadmap.md).

Licencia [MIT](../LICENSE). Aceptamos contribuciones y reportes en español o inglés.
