// T-S20-02: extrae los diagramas Mermaid de los capítulos de docs/tecnica/, valida su sintaxis y su catálogo,
// y exporta cada uno a build/diagramas/<ID>.svg y <ID>.png con el tema de marca.
// Fuente única (D4 del Sprint 20): el bloque ```mermaid del capítulo, cuya primera línea es «%% <ID>: <título>».
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const MERMAID = join(TOOLS, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const THEME = JSON.parse(readFileSync(join(TOOLS, 'mermaid-theme.json'), 'utf8'));
const ID = /^%%\s*(D\d{2}[a-z]?):\s*(\S.*?)\s*$/;
const SKIP = new Set(['build', 'tools', 'node_modules']);

/** Capítulos Markdown de docs/tecnica/, sin build/ ni tools/. */
function chapters(docs) {
  return readdirSync(docs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !relative(docs, file).split('/').some((part) => SKIP.has(part)))
    .sort();
}

/** Bloques ```mermaid con su identificador, archivo y línea; los errores de formato se acumulan. */
export function extractDiagrams(docs) {
  const diagrams = [];
  const errors = [];
  for (const file of chapters(docs)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const where = (index) => `${relative(docs, file)}:${index + 1}`;
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^```mermaid\s*$/.test(lines[i])) continue;
      const start = i;
      const body = [];
      for (i += 1; i < lines.length && !/^```\s*$/.test(lines[i]); i += 1) body.push(lines[i]);
      if (i >= lines.length) {
        errors.push(`${where(start)}: bloque mermaid sin cerrar`);
        break;
      }
      const header = ID.exec(body[0] ?? '');
      if (header === null) {
        errors.push(`${where(start + 1)}: la primera línea debe ser «%% Dxx: título»`);
        continue;
      }
      diagrams.push({ id: header[1], title: header[2], code: body.join('\n'), where: where(start + 1) });
    }
  }
  return { diagrams, errors };
}

/** Identificadores y títulos de la tabla «Catálogo de diagramas» del índice. */
export function readCatalog(docs) {
  const catalog = new Map();
  for (const line of readFileSync(join(docs, 'README.md'), 'utf8').split('\n')) {
    const row = /^\|\s*(D\d{2}[a-z]?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (row !== null) catalog.set(row[1], row[2]);
  }
  return catalog;
}

/** Compara los bloques con el catálogo: identificadores únicos, sin faltantes ni sobrantes. */
export function checkCatalog(diagrams, catalog) {
  const errors = [];
  const seen = new Map();
  for (const diagram of diagrams) {
    if (seen.has(diagram.id)) errors.push(`${diagram.where}: ${diagram.id} repetido (ya está en ${seen.get(diagram.id)})`);
    else seen.set(diagram.id, diagram.where);
    if (!catalog.has(diagram.id)) errors.push(`${diagram.where}: ${diagram.id} no está en el catálogo de README.md`);
  }
  for (const id of catalog.keys()) {
    if (!seen.has(id)) errors.push(`README.md: ${id} está en el catálogo pero ningún capítulo lo contiene`);
  }
  return errors;
}

/** Abre Chromium con Mermaid y el tema de marca; render() devuelve el SVG normalizado o el error de sintaxis. */
export async function openRenderer() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0;background:#fff}#out{display:inline-block;padding:16px;background:#fff}</style>'
    + '</head><body><div id="out"></div></body></html>');
  await page.addScriptTag({ path: MERMAID });
  await page.evaluate((config) => window.mermaid.initialize(config), THEME);

  async function render(diagram) {
    return page.evaluate(async ({ id, code }) => {
      try {
        await window.mermaid.parse(code);
        const { svg } = await window.mermaid.render(`diagram-${id}`, code);
        const out = document.getElementById('out');
        out.innerHTML = svg;
        const element = out.querySelector('svg');
        const box = element.viewBox.baseVal;
        // Mermaid deja el fondo de las etiquetas de flecha desalineado y semitransparente cuando no usa HTML:
        // se ajusta al texto para que la línea nunca lo tache, sin recurrir a foreignObject (SVG portable).
        for (const label of element.querySelectorAll('.edgeLabel')) {
          const text = label.querySelector('text');
          const background = label.querySelector('rect.background');
          if (text === null || background === null || text.textContent.trim() === '') continue;
          const bounds = text.getBBox();
          background.setAttribute('x', String(bounds.x - 4));
          background.setAttribute('y', String(bounds.y - 2));
          background.setAttribute('width', String(bounds.width + 8));
          background.setAttribute('height', String(bounds.height + 4));
          background.setAttribute('style', 'fill:#ffffff;opacity:1');
        }
        element.removeAttribute('style');
        element.setAttribute('width', String(Math.ceil(box.width)));
        element.setAttribute('height', String(Math.ceil(box.height)));
        return { svg: new XMLSerializer().serializeToString(element) };
      } catch (error) {
        return { error: String(error?.message ?? error).split('\n').slice(0, 4).join(' ') };
      }
    }, diagram);
  }

  async function png() {
    return page.locator('#out').screenshot({ type: 'png' });
  }

  return { render, png, close: () => browser.close() };
}

/** Valida y exporta todos los diagramas a <docs>/build/diagramas/; devuelve los diagramas y los errores. */
export async function exportDiagrams(docs) {
  const out = join(docs, 'build', 'diagramas');
  const { diagrams, errors } = extractDiagrams(docs);
  diagrams.sort((a, b) => a.id.localeCompare(b.id));
  errors.push(...checkCatalog(diagrams, readCatalog(docs)));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const renderer = await openRenderer();
  try {
    for (const diagram of diagrams) {
      const result = await renderer.render(diagram);
      if (result.error !== undefined) {
        errors.push(`${diagram.where}: ${diagram.id} con sintaxis inválida: ${result.error}`);
        continue;
      }
      writeFileSync(join(out, `${diagram.id}.svg`), `<?xml version="1.0" encoding="UTF-8"?>\n${result.svg}\n`);
      writeFileSync(join(out, `${diagram.id}.png`), await renderer.png());
      console.log(`✓ ${diagram.id}  ${diagram.title}`);
    }
  } finally {
    await renderer.close();
  }
  return { diagrams, errors };
}

/** Imprime los errores y termina con código 1 si hay alguno. */
export function failOnErrors(errors) {
  if (errors.length === 0) return;
  console.error(`\n${errors.length} error(es):`);
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

async function main() {
  const docs = process.argv[2] ?? join(TOOLS, '..');
  const { diagrams, errors } = await exportDiagrams(docs);
  failOnErrors(errors);
  console.log(`\n${diagrams.length} diagramas válidos en build/diagramas/ (SVG y PNG).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
