// T-S20-07: compila el PDF formal de docs/tecnica/ en tamaño Carta.
// 1. Valida y exporta los diagramas (diagrams.mjs): la misma fuente única que GitHub.
// 2. Ensambla un HTML con portada, «Acerca de este documento», índice general, índice de figuras y los capítulos en el
//    orden de la sección «Capítulos» de README.md.
// 3. Pagina con Paged.js en Chromium (encabezados, pies, numeración, índices con target-counter y páginas horizontales
//    para los diagramas de secuencia anchos) y guarda build/Banco-de-Talentos-Documentacion-Tecnica.pdf.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { chromium } from 'playwright';
import { exportDiagrams, failOnErrors } from './diagrams.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const PAGED = join(TOOLS, 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js');
/** Diagramas de secuencia que solo caben legibles en una página horizontal (aprobado en T-S20-02). */
const HORIZONTALES = new Set(['D06', 'D07', 'D09', 'D10']);
const PDF_NAME = 'Banco-de-Talentos-Documentacion-Tecnica.pdf';

const docs = resolve(process.argv[2] ?? join(TOOLS, '..'));
const brand = resolve(process.argv[3] ?? join(docs, '..', '..', 'frontend', 'public', 'brand'));
const build = join(docs, 'build');
const out = join(build, 'pdf');

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

/** Mismo criterio que GitHub para las anclas de los títulos. */
function slug(text) {
  return text.trim().toLowerCase().replace(/[`*]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Partes, capítulos y ADRs, en el orden de la sección «Capítulos» de README.md. */
function readOutline() {
  const readme = readFileSync(join(docs, 'README.md'), 'utf8');
  const section = readme.split(/^## Capítulos$/m)[1].split(/^## /m)[0];
  const parts = [];
  for (const line of section.split('\n')) {
    const part = /^\d+\. \*\*(.+)\*\*\s*$/.exec(line);
    const chapter = /^ {3}\d+\. (?:\[(.+?)\]\((.+?)\)|(.+?))\s*$/.exec(line);
    const adr = /^ {6}- \[(.+?)\]\((.+?)\)\s*$/.exec(line);
    if (part) parts.push({ title: part[1], chapters: [] });
    else if (chapter) parts.at(-1).chapters.push({ title: chapter[1] ?? chapter[3], file: chapter[2] ?? null, adrs: [] });
    else if (adr) parts.at(-1).chapters.at(-1).adrs.push({ title: adr[1], file: adr[2] });
  }
  return parts;
}

/** Identificador de sección para un archivo de capítulo (relativo a docs/tecnica). */
const sectionId = (file) => `cap-${file.replace(/\.md$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

/**
 * Convierte un capítulo: quita el título y la navegación de GitHub, sustituye cada bloque Mermaid por su SVG ya
 * exportado, desplaza los títulos y reescribe los enlaces (internos a anclas; los de fuera de docs/tecnica, a ruta).
 */
function renderChapter(file, offset, figures) {
  const id = sectionId(file);
  let text = readFileSync(join(docs, file), 'utf8');
  const title = /^# (.+)$/m.exec(text)[1];
  text = text.replace(/^# .+\n/, '').replace(/^\[Índice de la documentación técnica\].*\n/m, '');

  text = text.replace(/^```mermaid\n%% (D\d{2}[a-z]?): (.+)\n[\s\S]*?^```$/gm, (_match, figure, caption) => {
    figures.push({ id: figure, caption, section: id });
    const html = `<figure class="diagrama" id="fig-${figure}"><img src="../diagramas/${figure}.svg" alt="${escapeHtml(caption)}">`
      + `<figcaption><strong>Figura ${figure}.</strong> ${escapeHtml(caption)}</figcaption></figure>`;
    return `\n${HORIZONTALES.has(figure) ? `<section class="horizontal">${html}</section>` : html}\n`;
  });

  let html = md.render(text);
  html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, inner) => {
    const plain = inner.replace(/<[^>]+>/g, '');
    const next = Math.min(6, Number(level) + offset);
    return `<h${next} id="${id}--${slug(plain)}">${inner}</h${next}>`;
  });
  html = html.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (_match, href, inner) => rewriteLink(file, href, inner));
  return { id, title, html };
}

function rewriteLink(file, href, inner) {
  if (/^https?:\/\//.test(href)) return `<a class="externo" href="${href}">${inner}</a>`;
  const [path, anchor] = href.split('#');
  const from = posix.dirname(file);
  if (!path) return `<a href="#${sectionId(file)}--${anchor}">${inner}</a>`;
  const target = posix.normalize(posix.join(from, path));
  if (!target.startsWith('..') && target.endsWith('.md') && existsSync(join(docs, target))) {
    if (target === 'README.md') return inner;
    return `<a href="#${sectionId(target)}${anchor ? `--${anchor}` : ''}">${inner}</a>`;
  }
  // Fuera de docs/tecnica (runbook, sprints, diseño) o un archivo que no es capítulo: se nombra su ruta en el repositorio.
  const repoPath = posix.normalize(posix.join('docs/tecnica', from, path));
  const plain = inner.replace(/<[^>]+>/g, '');
  return plain.includes(repoPath) || plain === `\`${repoPath}\`` ? inner : `${inner} <span class="ruta">(<code>${repoPath}</code>)</span>`;
}

function tocEntry(level, href, number, title) {
  return `<li class="nivel-${level}"><a href="#${href}"><span class="texto">${number ? `<span class="numero">${number}</span>` : ''}${escapeHtml(title)}</span><span class="relleno"></span></a></li>`;
}

function assemble(parts, meta) {
  const figures = [];
  const toc = [];
  const body = [];
  let chapters = 0;

  parts.forEach((part, p) => {
    const partNumber = `${p + 1}`;
    const partId = `parte-${partNumber}`;
    toc.push(tocEntry('parte', partId, partNumber, part.title));
    body.push(`<h1 class="parte" id="${partId}" data-numero="${partNumber}">${escapeHtml(part.title)}</h1>`);

    part.chapters.forEach((chapter, c) => {
      const number = `${partNumber}.${c + 1}`;
      if (chapter.file) {
        const rendered = renderChapter(chapter.file, 1, figures);
        chapters += 1;
        toc.push(tocEntry('capitulo', rendered.id, number, rendered.title));
        body.push(`<section class="capitulo" id="${rendered.id}"><h2 class="capitulo" data-numero="${number}">${escapeHtml(rendered.title)}</h2>${rendered.html}</section>`);
        return;
      }
      // Grupo sin archivo propio (los ADRs): un título y un capítulo por cada ADR.
      const groupId = `grupo-${number.replace('.', '-')}`;
      toc.push(tocEntry('capitulo', groupId, number, chapter.title));
      body.push(`<h2 class="capitulo" id="${groupId}" data-numero="${number}">${escapeHtml(chapter.title)}</h2>`);
      chapter.adrs.forEach((adr, a) => {
        const rendered = renderChapter(adr.file, 2, figures);
        chapters += 1;
        const adrNumber = `${number}.${a + 1}`;
        toc.push(tocEntry('adr', rendered.id, adrNumber, rendered.title));
        const continuous = a === 0 ? ' continuo' : '';
        body.push(`<section class="capitulo" id="${rendered.id}"><h3 class="adr${continuous}" data-numero="${adrNumber}">${escapeHtml(rendered.title)}</h3>${rendered.html}</section>`);
      });
    });
  });

  const figureToc = figures.map((figure) => tocEntry('figura', `fig-${figure.id}`, figure.id, figure.caption)).join('');
  const cover = readFileSync(join(docs, 'assets', 'portada.html'), 'utf8')
    .replace('{{LOGO_PLATAFORMA}}', 'logo.png').replace('{{LOGO_SECRETARIA}}', 'sec-economia.png')
    .replace('{{FECHA}}', escapeHtml(meta.date)).replace('{{COMMIT}}', escapeHtml(meta.commit)).replace('{{RAMA}}', escapeHtml(meta.branch))
    .replace('{{CAPITULOS}}', String(chapters)).replace('{{FIGURAS}}', String(figures.length));

  const about = `<section class="acerca"><h2>Acerca de este documento</h2>
<p>Este PDF se genera automáticamente desde los mismos archivos Markdown que GitHub muestra en <code>docs/tecnica/</code>, con <code>sh scripts/docs-pdf.sh pdf</code>. Esos archivos son la fuente única: los diagramas son los bloques Mermaid de cada capítulo, exportados también como SVG y PNG en <code>docs/tecnica/build/diagramas/</code>.</p>
<p>Cada capítulo termina con «Fuentes en el repositorio»: las rutas que respaldan lo que afirma. Las referencias a documentos fuera de <code>docs/tecnica/</code> (runbook, archivos de Sprint, identidad visual) se indican con su ruta en el repositorio.</p>
<p>Los diagramas de secuencia anchos (D06, D07, D09 y D10) ocupan una página horizontal propia para conservar la legibilidad. Los identificadores de AMI, instancia y ejecuciones del piloto son una referencia histórica: cambian en cada despliegue.</p>
<p>Versión: ${escapeHtml(meta.date)} · commit <code>${escapeHtml(meta.commit)}</code> · rama <code>${escapeHtml(meta.branch)}</code>.</p></section>`;

  // El CSS va en línea: Paged.js vuelve a pedir las hojas <link> con fetch(), que Chromium bloquea sobre file://.
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Banco de Talentos — Documentación técnica</title>
<style>${readFileSync(join(docs, 'assets', 'pdf.css'), 'utf8')}</style>
<script>window.PagedConfig = { auto: true, after: () => { window.__paginado = true; } };</script>
<script src="paged.polyfill.js"></script>
</head><body>
${cover}
${about}
<section class="indice"><h2>Contenido</h2><ol>${toc.join('')}</ol></section>
<section class="indice figuras"><h2>Índice de figuras</h2><ol>${figureToc}</ol></section>
${body.join('\n')}
</body></html>`;
  return { html, chapters, figures };
}

async function printPdf(htmlPath, pdfPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error(`Paged.js: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') console.error(`navegador: ${message.text()}`); });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__paginado === true, null, { timeout: 120_000 });
    } catch (error) {
      const progress = await page.evaluate(() => ({ pages: document.querySelectorAll('.pagedjs_page').length, polyfill: typeof window.PagedPolyfill }));
      throw new Error(`Paged.js no terminó de paginar: ${JSON.stringify(progress)}`, { cause: error });
    }
    // Paged.js compone las páginas horizontales con su caja y su área a 11 × 8.5 in, pero deja el contenedor exterior con
    // las medidas verticales (recorta el contenido) y no le indica a Chromium que las imprima así. Estas reglas se agregan
    // después de paginar, fuera de su procesamiento de CSS: no cambian la composición, solo el tamaño de la hoja.
    await page.addStyleTag({
      content: '@page horizontal-impresion { size: 11in 8.5in; margin: 0; }'
        + ' .pagedjs_page.pagedjs_horizontal_page { page: horizontal-impresion; --pagedjs-width: 11in; --pagedjs-height: 8.5in;'
        + ' width: 11in; height: 8.5in; }'
        + ' .pagedjs_horizontal_page .pagedjs_sheet { width: 11in; height: 8.5in; }',
    });
    const pages = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
    const horizontal = await page.evaluate(() => document.querySelectorAll('.pagedjs_horizontal_page').length);
    if (horizontal !== 4) console.error(`Aviso: se esperaban 4 páginas horizontales y hay ${horizontal}.`);
    await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
    return pages;
  } finally {
    await browser.close();
  }
}

async function main() {
  const meta = {
    commit: process.env.DOCS_COMMIT || 'sin-commit',
    branch: process.env.DOCS_BRANCH || 'desconocida',
    date: new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' })
      .format(new Date(`${process.env.DOCS_DATE || new Date().toISOString().slice(0, 10)}T12:00:00Z`)),
  };

  const { errors } = await exportDiagrams(docs);
  failOnErrors(errors);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  copyFileSync(PAGED, join(out, 'paged.polyfill.js'));
  for (const logo of ['logo.png', 'sec-economia.png']) {
    if (!existsSync(join(brand, logo))) failOnErrors([`falta el logotipo ${join(brand, logo)}`]);
    copyFileSync(join(brand, logo), join(out, logo));
  }

  const { html, chapters, figures } = assemble(readOutline(), meta);
  const htmlPath = join(out, 'documento.html');
  writeFileSync(htmlPath, html);

  const pdfPath = join(build, PDF_NAME);
  const pages = await printPdf(htmlPath, pdfPath);
  console.log(`\nPDF: ${relative(docs, pdfPath)} · ${pages} páginas · ${chapters} capítulos · ${figures.length} figuras`);
}

await main();
