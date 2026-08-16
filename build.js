const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// ============================================
// CONFIGURACION GENERAL
// ============================================
const BASE_URL = 'https://alejandrotejero.github.io';
const IDIOMAS = ['es', 'en'];
// El idioma principal se sirve directamente en la raiz (sin /en/).
// El resto de idiomas van bajo su propio prefijo (/es/, etc.).
const IDIOMA_PRINCIPAL = 'en';
const RAIZ = __dirname;
const DIST = path.join(RAIZ, 'dist');

function prefijoIdioma(idioma) {
  return idioma === IDIOMA_PRINCIPAL ? '' : `/${idioma}`;
}

function rutaArchivo(prefijo, sufijo) {
  return `${prefijo}${sufijo}`.replace(/^\//, '');
}

// Si es true, el build intenta consultar la API de GitHub para los lenguajes
// de cada repositorio. Si no hay red, el build sigue adelante sin romperse.
const CONSULTAR_GITHUB = process.env.SIN_GITHUB !== '1';

// ============================================
// UTILIDADES BASICAS
// ============================================
function leerJSON(rutaRelativa) {
  const contenido = fs.readFileSync(path.join(RAIZ, rutaRelativa), 'utf-8');
  return JSON.parse(contenido);
}

function leerHTML(rutaRelativa) {
  return fs.readFileSync(path.join(RAIZ, rutaRelativa), 'utf-8');
}

function escribirArchivo(rutaRelativaDist, contenido) {
  const rutaCompleta = path.join(DIST, rutaRelativaDist);
  fs.mkdirSync(path.dirname(rutaCompleta), { recursive: true });
  fs.writeFileSync(rutaCompleta, contenido, 'utf-8');
}

function concatenarCSS() {
  const orden = [
    'variables.css',
    'base.css',
    'animaciones.css',
    'layout.css',
    'componentes.css',
    'paginas.css',
    'escena-fondo.css',
  ];

  const contenido = orden
    .map((archivo) => `/* ===== ${archivo} ===== */\n` + fs.readFileSync(path.join(RAIZ, 'public/css', archivo), 'utf-8'))
    .join('\n\n');

  escribirArchivo('css/style.css', contenido);
}

function reemplazar(plantilla, datos) {
  return plantilla.replace(/{{\s*([\w.]+)\s*}}/g, (coincidenciaCompleta, ruta) => {
    const valor = ruta.split('.').reduce((obj, clave) => (obj ? obj[clave] : undefined), datos);
    return valor !== undefined && valor !== null ? valor : '';
  });
}

// Los JSON de contenido tienen campos a medio rellenar marcados como
// "PENDIENTE" / "PENDING". En vez de imprimirlos en la web, se tratan como vacios
// y la plantilla decide si oculta ese bloque.
function limpiar(valor) {
  if (typeof valor !== 'string') return '';
  const normalizado = valor.trim().toUpperCase();
  if (!normalizado) return '';
  if (normalizado.startsWith('PENDIENTE') || normalizado.startsWith('PENDING')) return '';
  return valor.trim();
}

function existeEnPublic(rutaAbsolutaWeb) {
  if (!rutaAbsolutaWeb) return false;
  const relativa = rutaAbsolutaWeb.replace(/^\//, '');
  return fs.existsSync(path.join(RAIZ, 'public', relativa));
}

function existeArchivo(rutaRelativa) {
  return fs.existsSync(path.join(RAIZ, rutaRelativa));
}

function iniciales(texto) {
  return texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0].toUpperCase())
    .join('');
}

function escaparHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================
// CARGA DE CONTENIDO Y PLANTILLAS
// ============================================
const site = leerJSON('content/site.json');
const proyectos = leerJSON('content/proyectos.json');
const repositorios = leerJSON('content/repositorios.json');
const charlas = leerJSON('content/charlas.json');
const experiencias = leerJSON('content/experiencias.json');
const skills = leerJSON('content/skills.json');
const timeline = leerJSON('content/timeline.json');

const i18n = {
  es: leerJSON('i18n/es.json'),
  en: leerJSON('i18n/en.json'),
};

const plantillas = {
  layout: leerHTML('templates/layout.html'),
  home: leerHTML('templates/home.html'),
  proyectosLista: leerHTML('templates/proyectos-lista.html'),
  proyectoDetalle: leerHTML('templates/proyecto-detalle.html'),
  charlaDetalle: leerHTML('templates/charla-detalle.html'),
  experienciaDetalle: leerHTML('templates/experiencia-detalle.html'),
};

const partials = {
  nav: leerHTML('partials/nav.html'),
  menuOverlay: leerHTML('partials/menu-overlay.html'),
  footer: leerHTML('partials/footer.html'),
  projectCard: leerHTML('partials/project-card.html'),
  projectCardHero: leerHTML('partials/project-card-hero.html'),
  repoCard: leerHTML('partials/repo-card.html'),
  skillGroup: leerHTML('partials/skill-group.html'),
  timelineItem: leerHTML('partials/timeline-item.html'),
  charlaCard: leerHTML('partials/charla-card.html'),
  contactoFlotante: leerHTML('partials/contacto-flotante.html'),
  escenaFondo: leerHTML('partials/escena-fondo.html'),
};

// ============================================
// FONDO ANIMADO (Three.js): solo se inyecta en las paginas que
// lo piden explicitamente (Home y Proyectos). El resto de paginas
// no cargan ni un byte de Three.js.
// Los colores de los clusters "proyecto" se generan aqui mismo a
// partir de content/proyectos.json — la escena nunca duplica datos
// a mano, siempre lee el acento real de cada proyecto.
// ============================================
function datosProyectosParaEscena() {
  return proyectos
    .filter((p) => p.destacado)
    .map((p) => ({ id: p.id, acento: p.acento || null }))
    .filter((p) => p.acento);
}

function renderizarFondoEscena(ctx) {
  return reemplazar(partials.escenaFondo, ctx);
}

function renderizarScriptEscena(tipoEscena) {
  const datos = JSON.stringify(datosProyectosParaEscena());
  return `
  <script>
    window.__ESCENA_TIPO__ = '${tipoEscena}';
    window.__ESCENA_PROYECTOS__ = ${datos};
  </script>
  <script src="/js/vendor/three/three.min.js" defer></script>
  <script src="/js/vendor/three/shaders/CopyShader.js" defer></script>
  <script src="/js/vendor/three/shaders/LuminosityHighPassShader.js" defer></script>
  <script src="/js/vendor/three/postprocessing/EffectComposer.js" defer></script>
  <script src="/js/vendor/three/postprocessing/RenderPass.js" defer></script>
  <script src="/js/vendor/three/postprocessing/ShaderPass.js" defer></script>
  <script src="/js/vendor/three/postprocessing/UnrealBloomPass.js" defer></script>
  <script src="/js/escena-red.js" defer></script>`;
}

// ============================================
// GITHUB API: RELLENAR LENGUAJES DE REPOSITORIOS
// ============================================
const RUTA_CACHE = path.join(RAIZ, 'content/lenguajes-cache.json');

function leerCacheLenguajes() {
  try {
    return JSON.parse(fs.readFileSync(RUTA_CACHE, 'utf-8'));
  } catch (error) {
    return {};
  }
}

// Si hay un GITHUB_TOKEN disponible (GitHub Actions lo inyecta solo en cada
// ejecucion), se usa para autenticar las peticiones a la API: el limite sin
// autenticar es de 60/hora por IP, y con token sube a 5000/hora. En local,
// sin token, sigue funcionando igual, solo que con el limite mas bajo.
function cabecerasGitHub(aceptar) {
  const cabeceras = { 'Accept': aceptar, 'User-Agent': 'portfolio-build' };
  if (process.env.GITHUB_TOKEN) {
    cabeceras['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return cabeceras;
}

async function obtenerLenguajes(nombreRepo) {
  const url = `https://api.github.com/repos/AlejandroTejero/${nombreRepo}/languages`;

  try {
    const respuesta = await fetch(url, {
      headers: cabecerasGitHub('application/vnd.github+json'),
    });
    if (!respuesta.ok) return null;

    const datos = await respuesta.json();
    const total = Object.values(datos).reduce((suma, bytes) => suma + bytes, 0);
    if (!total) return null;

    return Object.entries(datos)
      .map(([nombre, bytes]) => ({ nombre, porcentaje: Math.round((bytes / total) * 100) }))
      .sort((a, b) => b.porcentaje - a.porcentaje);
  } catch (error) {
    return null;
  }
}

// Si la API responde, se usa y se refresca el cache. Si falla (sin red o
// limite de peticiones alcanzado), se usa el ultimo dato guardado.
async function enriquecerRepositorios() {
  const cache = leerCacheLenguajes();
  let huboCambios = false;

  for (const repo of repositorios) {
    let lenguajes = null;

    if (CONSULTAR_GITHUB) {
      lenguajes = await obtenerLenguajes(repo.nombre);
    }

    if (lenguajes) {
      cache[repo.nombre] = lenguajes;
      huboCambios = true;
      console.log(`  ${repo.nombre}: ${lenguajes.length} lenguajes (GitHub)`);
    } else {
      lenguajes = cache[repo.nombre] || [];
      const origen = lenguajes.length ? 'cache' : 'sin datos';
      console.log(`  ${repo.nombre}: ${lenguajes.length} lenguajes (${origen})`);
    }

    repo.lenguajes = lenguajes;
  }

  if (huboCambios) {
    fs.writeFileSync(RUTA_CACHE, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  }
}

// ============================================
// GITHUB API: RELLENAR README DE CADA PROYECTO
// Mismo patron que los lenguajes: se intenta traer el README en cada
// build; si falla (sin red, repo privado, limite de peticiones...) se usa
// el ultimo que se guardo en cache, y si nunca hubo ninguno, se omite.
// ============================================
const RUTA_CACHE_README = path.join(RAIZ, 'content/readme-cache.json');

function leerCacheReadme() {
  try {
    return JSON.parse(fs.readFileSync(RUTA_CACHE_README, 'utf-8'));
  } catch (error) {
    return {};
  }
}

function propietarioYRepoDesdeUrl(urlGithub) {
  if (!urlGithub) return null;
  const coincidencia = urlGithub.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!coincidencia) return null;
  return { propietario: coincidencia[1], repo: coincidencia[2].replace(/\.git$/, '') };
}

async function obtenerReadme(propietario, repo) {
  const url = `https://api.github.com/repos/${propietario}/${repo}/readme`;

  try {
    const respuesta = await fetch(url, {
      headers: cabecerasGitHub('application/vnd.github.raw+json'),
    });
    if (!respuesta.ok) return null;

    const markdown = await respuesta.text();
    if (!markdown.trim()) return null;
    return markdown;
  } catch (error) {
    return null;
  }
}

// Convierte rutas relativas de imagenes/enlaces del README (validas dentro
// del repo) a URLs absolutas hacia GitHub, para que no salgan rotas al
// mostrarse fuera del repo.
function absolutizarRutasReadme(markdown, propietario, repo) {
  const baseRaw = `https://raw.githubusercontent.com/${propietario}/${repo}/HEAD/`;
  const baseBlob = `https://github.com/${propietario}/${repo}/blob/HEAD/`;

  return markdown
    .replace(/(!\[[^\]]*]\()(?!https?:\/\/|data:)([^)]+)(\))/g, (m, ini, ruta, fin) => `${ini}${baseRaw}${ruta.replace(/^\.?\//, '')}${fin}`)
    .replace(/(?<!!)(\[[^\]]*]\()(?!https?:\/\/|#|mailto:)([^)]+)(\))/g, (m, ini, ruta, fin) => `${ini}${baseBlob}${ruta.replace(/^\.?\//, '')}${fin}`);
}

async function enriquecerReadmesProyectos() {
  const cache = leerCacheReadme();
  let huboCambios = false;

  for (const proyecto of proyectos) {
    const info = propietarioYRepoDesdeUrl(proyecto.enlaces && proyecto.enlaces.github);
    if (!info) {
      proyecto.readme_html = '';
      continue;
    }

    const clave = `${info.propietario}/${info.repo}`;
    let markdown = null;

    if (CONSULTAR_GITHUB) {
      markdown = await obtenerReadme(info.propietario, info.repo);
    }

    if (markdown) {
      cache[clave] = markdown;
      huboCambios = true;
      console.log(`  ${clave}: README (GitHub)`);
    } else {
      markdown = cache[clave] || null;
      console.log(`  ${clave}: README (${markdown ? 'cache' : 'sin datos'})`);
    }

    if (markdown) {
      const absolutizado = absolutizarRutasReadme(markdown, info.propietario, info.repo);
      proyecto.readme_html = marked.parse(absolutizado);
    } else {
      proyecto.readme_html = '';
    }
  }

  if (huboCambios) {
    fs.writeFileSync(RUTA_CACHE_README, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  }
}


const COLORES_LENGUAJE = {
  Python: '#3776AB', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  'C++': '#f34b7d', C: '#555555', SQL: '#e38c00', HTML: '#e34c26',
  CSS: '#563d7c', Pascal: '#E3F171', Shell: '#89e051', Makefile: '#427819',
  Java: '#b07219', Go: '#00ADD8', Dockerfile: '#384d54',
  Assembly: '#6E4C13', PLpgSQL: '#336790', PLSQL: '#dad8d8', Ruby: '#701516',
  'Jupyter Notebook': '#DA5B0B', TeX: '#3D6117', Batchfile: '#C1F12E',
  PowerShell: '#012456', Vue: '#41b883', PHP: '#4F5D95', Rust: '#dea584',
};
function colorLenguaje(nombre) {
  return COLORES_LENGUAJE[nombre] || 'var(--c-acento)';
}

// ============================================
// PORTADAS: imagen real si existe, monograma si no
// ============================================
function renderizarPortada(titulo, rutaImagen, indice, prioritaria = false) {
  if (existeEnPublic(rutaImagen)) {
    const atributoCarga = prioritaria
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy"';
    return `<img src="${rutaImagen}" alt="${escaparHtml(titulo)}" ${atributoCarga}>`;
  }

  // Sin imagen todavia: monograma tipografico en vez de un hueco roto.
  return `<span class="portada-monograma" data-tono="${indice % 4}" aria-hidden="true">${escaparHtml(iniciales(titulo))}</span>`;
}

function renderizarHeroProyecto(proyecto, ctx) {
  const imagenes = [proyecto.imagen, ...(proyecto.galeria || [])].filter((ruta) => existeEnPublic(ruta));

  if (imagenes.length < 2) {
    return renderizarPortada(proyecto.titulo, proyecto.imagen, 0, true);
  }

  const slides = imagenes
    .map((ruta, i) => `
      <div class="carrusel__item" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${imagenes.length}">
        <img src="${ruta}" alt="${escaparHtml(proyecto.titulo)} — ${ctx.i18n.carrusel_captura} ${i + 1}" ${i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}>
      </div>`)
    .join('');

  const puntos = imagenes
    .map((_, i) => `<button type="button" class="carrusel__punto${i === 0 ? ' carrusel__punto--activo' : ''}" data-indice="${i}" aria-label="${ctx.i18n.carrusel_ir_a} ${i + 1}"></button>`)
    .join('');

  return `<div class="carrusel" data-carrusel tabindex="0" aria-roledescription="carousel" aria-label="${escaparHtml(proyecto.titulo)}">
    <div class="carrusel__viewport">
      <div class="carrusel__pista" data-carrusel-pista>${slides}</div>
    </div>
    <button type="button" class="carrusel__control carrusel__control--prev" data-carrusel-prev aria-label="${ctx.i18n.carrusel_anterior}">
      <svg class="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <button type="button" class="carrusel__control carrusel__control--next" data-carrusel-next aria-label="${ctx.i18n.carrusel_siguiente}">
      <svg class="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    <div class="carrusel__puntos" data-carrusel-puntos>${puntos}</div>
  </div>`;
}

function renderizarDiagramaProyecto(proyecto, ctx) {
  const ruta = proyecto.diagrama;
  if (!ruta || !existeEnPublic(ruta)) return '';

  const alt = `${ctx.i18n.diagrama_alt} — ${escaparHtml(proyecto.titulo)}`;

  return `
  <section class="seccion-diagrama reveal">
    <div class="contenedor">
      <p class="etiqueta-seccion">${ctx.i18n.diagrama_titulo}</p>

      <button type="button" class="diagrama__disparador" data-diagrama-abrir aria-haspopup="dialog">
        <img src="${ruta}" alt="${alt}" loading="lazy">
        <span class="diagrama__pista" aria-hidden="true">${ctx.i18n.diagrama_ampliar}</span>
      </button>

      <div class="diagrama__overlay" data-diagrama-overlay role="dialog" aria-modal="true" aria-label="${alt}" aria-hidden="true">
        <button type="button" class="diagrama__overlay-cerrar" data-diagrama-cerrar aria-label="${ctx.i18n.menu_cerrar}">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5L5 19"/></svg>
        </button>
        <img src="${ruta}" alt="${alt}">
      </div>
    </div>
  </section>`;
}

function renderizarAcentoProyecto(proyecto) {
  const acento = proyecto.acento;
  if (!acento || !acento.oscuro || !acento.claro) return '';
  return `<style>
    [data-tema="oscuro"] .detalle-proyecto { --c-acento: ${acento.oscuro}; }
    [data-tema="claro"] .detalle-proyecto { --c-acento: ${acento.claro}; }
  </style>`;
}

function renderizarFotoPerfil() {
  if (existeEnPublic(site.foto)) {
    return `<img src="${site.foto}" alt="${escaparHtml(site.nombre)}">`;
  }
  return `<span class="retrato__monograma" aria-hidden="true">${escaparHtml(iniciales(site.nombre))}</span>`;
}

// ============================================
// RENDERIZADO DE PIEZAS REPETIBLES (partials)
// ============================================
function renderizarProjectCard(proyecto, ctx, indice = 0, esHero = false, esDuplicado = false) {
  const tech = proyecto.tecnologias.map((t) => `<li>${t}</li>`).join('');
  const nota = limpiar(proyecto.nota_academica);

  return reemplazar(esHero ? partials.projectCardHero : partials.projectCard, {
    ...ctx,
    proyecto: {
      ...proyecto,
      resumen: proyecto.resumen[ctx.idioma],
      estado: proyecto.estado[ctx.idioma],
      categorias_espacio: proyecto.categorias.join(' '),
      indice_formateado: String(indice + 1).padStart(2, '0'),
      clase_extra: esDuplicado ? ' project-card--duplicado' : '',
    },
    portada: renderizarPortada(proyecto.titulo, proyecto.imagen, indice, esHero),
    lista_tecnologias: tech,
    nota_academica_si_existe: nota ? `<span class="project-card__nota">${escaparHtml(nota)}</span>` : '',
    lista_enlaces_hero: esHero ? renderizarEnlacesProyecto(proyecto, ctx, 'project-card--hero__boton') : '',
  });
}

function renderizarRepoCard(repo, ctx) {
  const barra = (repo.lenguajes || [])
    .map((l) => `<span style="width:${l.porcentaje}%; background:${colorLenguaje(l.nombre)}" title="${l.nombre} ${l.porcentaje}%"></span>`)
    .join('');

  const etiquetas = (repo.lenguajes || [])
    .slice(0, 3)
    .map((l) => `<li>${l.nombre}</li>`)
    .join('');

  const descripcion = limpiar(repo.descripcion[ctx.idioma]);
  const asignatura = limpiar(repo.asignatura[ctx.idioma]);

  return reemplazar(partials.repoCard, {
    ...ctx,
    repo: {
      ...repo,
      asignatura,
    },
    descripcion_si_existe: descripcion ? `<p class="repo-card__descripcion">${escaparHtml(descripcion)}</p>` : '',
    barra_si_existe: barra ? `<div class="repo-card__barra">${barra}</div>` : '',
    lista_lenguajes: etiquetas,
  });
}

// Icono SVG (trazo, mismo estilo que el resto del sitio: viewBox 24x24,
// fill="none", stroke="currentColor") por categoria de skill.
// Se busca por el nombre en español para no depender del idioma activo.
const ICONOS_CATEGORIA = {
  'Lenguajes de programación': '<path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/><path d="m13 5-2 14"/>',
  'Backend': '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01"/><path d="M7 17h.01"/>',
  'Bases de datos': '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5V18a8 3 0 0 0 16 0V5.5"/><path d="M4 12a8 3 0 0 0 16 0"/>',
  'Redes': '<path d="M4 20h16"/><path d="M6 20V14"/><path d="M12 20V9"/><path d="M18 20V4"/>',
  'Sistemas': '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  'Herramientas': '<path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2z"/>',
  'Idiomas': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18"/>',
};
const ICONO_CATEGORIA_DEFECTO = '<circle cx="12" cy="12" r="3"/><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/>';

// Clase de color por indice de categoria (definidas en variables.css como
// --c-cat-1 .. --c-cat-7). Si hay mas categorias que colores, se repite el ciclo.
const PALETA_CATEGORIA = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7'];

// Badge de nivel tipo "pill" (sustituye a las barras de antes).
function renderizarBadgeNivel(nivelClave, nivelTexto) {
  if (!nivelClave || !nivelTexto) return '';
  return `<span class="skill-group__nivel skill-group__nivel--${nivelClave}">${escaparHtml(nivelTexto)}</span>`;
}

// Rejilla tipo "bento": las categorias con mas tecnologias ocupan mas
// ancho (2 columnas de 3), en vez de que todas midan lo mismo. El
// umbral de 6 items es el que separa "categoria grande" de "pequena"
// con el contenido real de skills.json; si el contenido cambia mucho,
// se puede ajustar aqui sin tocar la plantilla.
const UMBRAL_CATEGORIA_ANCHA = 6;

function renderizarSkillGroup(categoria, ctx, indice = 0) {
  const items = categoria.items
    .map((item) => (typeof item === 'object' ? item[ctx.idioma] : item))
    .map((i) => `<li>${escaparHtml(i)}</li>`)
    .join('');
  const nivelClave = categoria.nivel_clave || '';
  const nivelTexto = categoria.nivel ? limpiar(categoria.nivel[ctx.idioma]) : '';
  const nombreEs = categoria.nombre.es || categoria.nombre[ctx.idioma];
  const trazos = ICONOS_CATEGORIA[nombreEs] || ICONO_CATEGORIA_DEFECTO;
  const iconoSvg = `<svg class="icono skill-group__icono" viewBox="0 0 24 24" focusable="false">${trazos}</svg>`;
  const colorClase = PALETA_CATEGORIA[indice % PALETA_CATEGORIA.length];
  const totalItems = categoria.items.length;

  return reemplazar(partials.skillGroup, {
    ...ctx,
    categoria: {
      nombre: categoria.nombre[ctx.idioma],
      nivel_clase: nivelClave,
      color_clase: colorClase,
      icono_svg: iconoSvg,
      indice_formateado: String(indice + 1).padStart(2, '0'),
      total_items: totalItems,
      ancho_columnas: totalItems >= UMBRAL_CATEGORIA_ANCHA ? 2 : 1,
    },
    nivel_si_existe: renderizarBadgeNivel(nivelClave, nivelTexto),
    lista_items: items,
  });
}

function renderizarTimelineItem(hito, ctx) {
  const institucion = limpiar(hito.institucion);
  const descripcion = hito.descripcion ? limpiar(hito.descripcion[ctx.idioma]) : '';
  const etiquetaTipo = ctx.i18n[`tipo_${hito.tipo}`] || hito.tipo;
  const tituloTexto = hito.titulo[ctx.idioma];
  const tituloRenderizado = hito.experiencia_relacionada
    ? `<a href="${ctx.prefijo_idioma}/trayectoria/experiencias/${hito.experiencia_relacionada}/" class="timeline-item__enlace">${escaparHtml(tituloTexto)}<span aria-hidden="true"> ↗</span></a>`
    : escaparHtml(tituloTexto);

  return reemplazar(partials.timelineItem, {
    ...ctx,
    hito: {
      ...hito,
      titulo: tituloRenderizado,
      tipo_etiqueta: etiquetaTipo,
    },
    institucion_si_existe: institucion ? `<p class="timeline-item__institucion">${escaparHtml(institucion)}</p>` : '',
    descripcion_si_existe: descripcion ? `<p class="timeline-item__descripcion">${escaparHtml(descripcion)}</p>` : '',
  });
}

function formatearFecha(fechaISO, idioma) {
  const fecha = new Date(fechaISO);
  const locale = idioma === 'es' ? 'es-ES' : 'en-US';
  return fecha.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderizarCharlaCard(charla, ctx) {
  const lugar = limpiar(charla.lugar);

  return reemplazar(partials.charlaCard, {
    ...ctx,
    charla: {
      ...charla,
      titulo: charla.titulo[ctx.idioma],
      rol: charla.rol[ctx.idioma],
      resumen: charla.resumen[ctx.idioma],
      fecha_formateada: formatearFecha(charla.fecha, ctx.idioma),
    },
    lugar_si_existe: lugar ? `<span class="charla-card__lugar">${escaparHtml(lugar)}</span>` : '',
  });
}

function renderizarContactoFlotante(ctx) {
  return reemplazar(partials.contactoFlotante, { ...ctx });
}

function renderizarBadges(badges, ctx) {
  return badges.map((b) => `<li class="badge">${b[ctx.idioma]}</li>`).join('');
}

function renderizarBioParrafos(parrafos, ctx) {
  return parrafos[ctx.idioma].map((p) => `<p>${p}</p>`).join('');
}

// ============================================
// NAV, MENU OVERLAY Y FOOTER
// ============================================
function renderizarNav(ctx, rutaSinIdioma) {
  const idiomaAlterno = ctx.idioma === 'es' ? 'en' : 'es';

  return reemplazar(partials.nav, {
    ...ctx,
    url_idioma_alterno: `${prefijoIdioma(idiomaAlterno)}${rutaSinIdioma || '/'}`,
    idioma_alterno_label: idiomaAlterno.toUpperCase(),
  });
}

function renderizarMenuOverlay(ctx) {
  return reemplazar(partials.menuOverlay, { ...ctx });
}

function renderizarFooter(ctx) {
  return reemplazar(partials.footer, {
    ...ctx,
    site: { ...ctx.site, cv_pdf: ctx.site.cv_pdf[ctx.idioma] },
    anio_actual: new Date().getFullYear(),
  });
}

// ============================================
// ENVOLTORIO FINAL: layout.html
// ============================================
function envolverEnLayout(contenidoHtml, meta, ctx) {
  return reemplazar(plantillas.layout, {
    ...ctx,
    contenido: contenidoHtml,
    nav: renderizarNav(ctx, meta.rutaSinIdioma),
    menu_overlay: renderizarMenuOverlay(ctx),
    footer: renderizarFooter(ctx),
    contacto_flotante: renderizarContactoFlotante(ctx),
    titulo_pagina: meta.titulo,
    meta_descripcion: meta.descripcion,
    url_canonica: `${BASE_URL}${prefijoIdioma(ctx.idioma)}${meta.rutaSinIdioma}`,
    url_alternativa_es: `${BASE_URL}${prefijoIdioma('es')}${meta.rutaSinIdioma}`,
    url_alternativa_en: `${BASE_URL}${prefijoIdioma('en')}${meta.rutaSinIdioma}`,
    og_imagen: meta.imagen || `${BASE_URL}/img/og-default.png`,
    clase_body: meta.claseBody || '',
    fondo_escena: meta.tipoEscena ? renderizarFondoEscena(ctx) : '',
    script_escena: meta.tipoEscena ? renderizarScriptEscena(meta.tipoEscena) : '',
  });
}

// ============================================
// GENERACION DE CADA PAGINA
// ============================================
function generarHome(ctx) {
  const destacados = proyectos.filter((p) => p.destacado).slice(0, 4);
  // Se duplica la lista para que el carrusel pueda desplazarse un 50%
  // y encadenar sin salto visible (bucle infinito con solo CSS).
  const carrusel = [...destacados, ...destacados];

  // La trayectoria completa (timeline + charlas) vive ahora dentro del
  // home en vez de en una pagina propia — mismo contenido y mismo orden
  // que antes tenia /trayectoria/.
  const timelineOrdenado = [...timeline].sort((a, b) => {
    const mesA = /^\d+$/.test(String(a.mes)) ? a.mes : '00';
    const mesB = /^\d+$/.test(String(b.mes)) ? b.mes : '00';
    return `${b.anio}${mesB}`.localeCompare(`${a.anio}${mesA}`);
  });
  const charlasOrdenadas = [...charlas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const contenido = reemplazar(plantillas.home, {
    ...ctx,
    site: { ...site, cv_pdf: site.cv_pdf[ctx.idioma] },
    hero: { titulo: site.titulo[ctx.idioma], intro: site.hero_intro[ctx.idioma] },
    retrato: renderizarFotoPerfil(),
    lista_badges: renderizarBadges(site.badges, ctx),
    lista_bio_parrafos: renderizarBioParrafos(site.bio_parrafos, ctx),
    lista_proyectos_carrusel: carrusel.map((p, i) => renderizarProjectCard(p, ctx, i % destacados.length, false, i >= destacados.length)).join(''),
    lista_timeline_items: timelineOrdenado.map((h) => renderizarTimelineItem(h, ctx)).join(''),
    lista_charlas: charlasOrdenadas.map((c) => renderizarCharlaCard(c, ctx)).join(''),
  });

  return envolverEnLayout(contenido, {
    titulo: site.nombre,
    descripcion: site.bio[ctx.idioma],
    rutaSinIdioma: '/',
    claseBody: 'es-home',
    tipoEscena: 'narrativo',
  }, ctx);
}

function generarProyectosLista(ctx) {
  // El proyecto "protagonista" (marcado con protagonista:true en
  // proyectos.json) sale como tarjeta grande a todo el ancho, arriba del
  // todo; el resto se queda en la rejilla normal. Si nadie lo marca, se usa
  // el primero de la lista como respaldo.
  const indiceProtagonista = Math.max(0, proyectos.findIndex((p) => p.protagonista));
  const protagonista = proyectos[indiceProtagonista];
  const resto = proyectos.filter((_, i) => i !== indiceProtagonista);

  const contenido = reemplazar(plantillas.proyectosLista, {
    ...ctx,
    proyecto_protagonista: renderizarProjectCard(protagonista, ctx, indiceProtagonista, true),
    lista_todos_los_proyectos: resto.map((p, i) => renderizarProjectCard(p, ctx, i === indiceProtagonista ? i + 1 : i)).join(''),
    lista_repos_academicos: repositorios.map((r) => renderizarRepoCard(r, ctx)).join(''),
    lista_skill_groups: skills.categorias.map((c, i) => renderizarSkillGroup(c, ctx, i)).join(''),
    total_proyectos: proyectos.length,
    total_repos: repositorios.length,
  });

  return envolverEnLayout(contenido, {
    titulo: ctx.i18n.proyectos_titulo,
    descripcion: ctx.i18n.proyectos_intro,
    rutaSinIdioma: '/proyectos/',
    claseBody: 'es-proyectos',
    tipoEscena: 'ambiental',
  }, ctx);
}

// Si existe una plantilla propia para este proyecto (templates/proyectos/<id>.html),
// se usa esa en vez de la generica. Permite que cada proyecto tenga su propia
// estructura sin tocar el motor de generacion.
function plantillaParaProyecto(idProyecto) {
  const rutaPropia = `templates/proyectos/${idProyecto}.html`;
  return existeArchivo(rutaPropia) ? leerHTML(rutaPropia) : plantillas.proyectoDetalle;
}

function renderizarSeccionReadme(proyecto, ctx) {
  if (!proyecto.readme_html) return '';
  return `<div class="contenedor">
    <details class="readme-proyecto reveal" open data-readme-key="readme-${proyecto.id}">
      <summary class="readme-proyecto__resumen">
        <span>${ctx.i18n.ver_readme}</span>
        <span class="readme-proyecto__flecha" aria-hidden="true">↓</span>
      </summary>
      <div class="readme-proyecto__cuerpo markdown-body">${proyecto.readme_html}</div>
    </details>
  </div>`;
}

// Genera los botones de enlaces de un proyecto (github, landing, memoria...)
// mas la charla relacionada si existe una en charlas.json que apunte a
// este proyecto (charla.proyecto_relacionado === proyecto.id). Se reutiliza
// tanto en el detalle de proyecto como en la tarjeta destacada de la lista.
function renderizarEnlacesProyecto(proyecto, ctx, claseBtn = 'btn btn--linea') {
  const etiquetasEnlace = {
    github: 'GitHub', landing: ctx.i18n.enlace_landing,
    memoria: ctx.i18n.enlace_memoria, slides: ctx.i18n.enlace_slides,
    linkedin: 'LinkedIn', cartel: ctx.i18n.enlace_cartel, video: ctx.i18n.enlace_video,
  };

  const enlaces = Object.entries(proyecto.enlaces || {})
    .filter(([, url]) => limpiar(url))
    .map(([tipo, url]) => `<a href="${url}" target="_blank" rel="noopener" class="${claseBtn}">${etiquetasEnlace[tipo] || tipo}<span aria-hidden="true">↗</span></a>`)
    .join('');

  const charlaRelacionada = charlas.find((c) => c.proyecto_relacionado === proyecto.id);
  const enlaceCharla = charlaRelacionada
    ? `<a href="${ctx.prefijo_idioma}/trayectoria/charlas/${charlaRelacionada.id}/" class="${claseBtn}">${ctx.i18n.enlace_charla}<span aria-hidden="true">↗</span></a>`
    : '';

  return enlaces + enlaceCharla;
}

function generarProyectoDetalle(proyecto, ctx, indice) {
  const tech = proyecto.tecnologias.map((t) => `<li>${t}</li>`).join('');

  const enlaces = renderizarEnlacesProyecto(proyecto, ctx);

  const nota = limpiar(proyecto.nota_academica);

  const contenido = reemplazar(plantillaParaProyecto(proyecto.id), {
    ...ctx,
    proyecto: {
      ...proyecto,
      resumen: proyecto.resumen[ctx.idioma],
      descripcion: proyecto.descripcion[ctx.idioma],
      estado: proyecto.estado[ctx.idioma],
    },
    portada: renderizarHeroProyecto(proyecto, ctx),
    lista_tecnologias: tech,
    lista_enlaces: enlaces,
    nota_academica_si_existe: nota ? `<div class="dato"><dt>${ctx.i18n.nota_academica}</dt><dd>${escaparHtml(nota)}</dd></div>` : '',
    acento_proyecto: renderizarAcentoProyecto(proyecto),
    diagrama_proyecto: renderizarDiagramaProyecto(proyecto, ctx),
    seccion_readme_si_existe: renderizarSeccionReadme(proyecto, ctx),
  });

  return envolverEnLayout(contenido, {
    titulo: proyecto.titulo,
    descripcion: proyecto.resumen[ctx.idioma],
    imagen: `${BASE_URL}${proyecto.imagen}`,
    rutaSinIdioma: `/proyectos/${proyecto.id}/`,
  }, ctx);
}

function generarCharlaDetalle(charla, ctx) {
  const etiquetasEnlace = {
    github: 'GitHub', linkedin: 'LinkedIn', cartel: ctx.i18n.enlace_cartel,
    slides: ctx.i18n.enlace_slides, video: ctx.i18n.enlace_video,
  };

  const enlaces = Object.entries(charla.enlaces || {})
    .filter(([, url]) => limpiar(url))
    .map(([tipo, url]) => `<a href="${url}" target="_blank" rel="noopener" class="btn btn--linea">${etiquetasEnlace[tipo] || tipo}<span aria-hidden="true">↗</span></a>`)
    .join('');

  let relacionadoHtml = '';
  if (charla.proyecto_relacionado) {
    const proyecto = proyectos.find((p) => p.id === charla.proyecto_relacionado);
    if (proyecto) {
      relacionadoHtml = `<section class="seccion reveal"><div class="contenedor"><p class="etiqueta-seccion">${ctx.i18n.proyecto_relacionado}</p><div class="rejilla-proyectos rejilla-proyectos--duo">${renderizarProjectCard(proyecto, ctx, 0)}</div></div></section>`;
    }
  }

  const lugar = limpiar(charla.lugar);

  const contenido = reemplazar(plantillas.charlaDetalle, {
    ...ctx,
    charla: {
      ...charla,
      titulo: charla.titulo[ctx.idioma],
      rol: charla.rol[ctx.idioma],
      resumen: charla.resumen[ctx.idioma],
      fecha_formateada: formatearFecha(charla.fecha, ctx.idioma),
    },
    lugar_si_existe: lugar ? `<div class="dato"><dt>${ctx.i18n.charla_lugar}</dt><dd>${escaparHtml(lugar)}</dd></div>` : '',
    bloque_enlaces: enlaces ? `<div class="detalle__enlaces">${enlaces}</div>` : '',
    bloque_relacionado: relacionadoHtml,
  });

  return envolverEnLayout(contenido, {
    titulo: charla.titulo[ctx.idioma],
    descripcion: charla.resumen[ctx.idioma],
    rutaSinIdioma: `/trayectoria/charlas/${charla.id}/`,
  }, ctx);
}

function generarExperienciaDetalle(experiencia, ctx) {
  const grupos = (experiencia.grupos || [])
    .map((grupo) => {
      const items = grupo.tareas[ctx.idioma].map((t) => `<li>${escaparHtml(t)}</li>`).join('');
      return `<div class="detalle__grupo"><h3 class="detalle__grupo-titulo">${escaparHtml(grupo.titulo[ctx.idioma])}</h3><ul class="detalle__lista">${items}</ul></div>`;
    })
    .join('');

  const lugar = limpiar(experiencia.lugar);

  const contenido = reemplazar(plantillas.experienciaDetalle, {
    ...ctx,
    experiencia: {
      ...experiencia,
      titulo: experiencia.titulo[ctx.idioma],
    },
    lugar_si_existe: lugar ? `<div class="dato"><dt>${ctx.i18n.charla_lugar}</dt><dd>${escaparHtml(lugar)}</dd></div>` : '',
    lista_grupos: grupos,
  });

  return envolverEnLayout(contenido, {
    titulo: `${experiencia.titulo[ctx.idioma]} — ${experiencia.empresa}`,
    descripcion: experiencia.empresa,
    rutaSinIdioma: `/trayectoria/experiencias/${experiencia.id}/`,
  }, ctx);
}

// ============================================
// SITEMAP
// ============================================
function generarSitemap() {
  const rutas = ['/'];
  rutas.push('/proyectos/');
  proyectos.forEach((p) => rutas.push(`/proyectos/${p.id}/`));
  charlas.forEach((c) => rutas.push(`/trayectoria/charlas/${c.id}/`));
  experiencias.forEach((e) => rutas.push(`/trayectoria/experiencias/${e.id}/`));

  const urls = IDIOMAS.flatMap((idioma) =>
    rutas.map((ruta) => `  <url><loc>${BASE_URL}${prefijoIdioma(idioma)}${ruta}</loc></url>`)
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ============================================
// PAGINA 404 (bilingue, sin fondo 3D)
// ============================================
// GitHub Pages sirve automaticamente /404.html para cualquier ruta que no
// exista, pero solo mira ese archivo en la raiz — no distingue idioma por
// URL. Por eso esta pagina no usa layout.html (que asume un solo idioma)
// y en vez de intentar adivinar el idioma del visitante, muestra las dos
// versiones apiladas, cada una con su propio enlace de vuelta al inicio.
function generarPagina404() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#171A21" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#EDE7D9" media="(prefers-color-scheme: light)">
  <title>404 · ${site.nombre_corto}</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..900&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <script>
    (function () {
      try {
        var guardado = localStorage.getItem('portfolio-tema');
        var prefiereClaro = window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.setAttribute('data-tema', guardado || (prefiereClaro ? 'claro' : 'oscuro'));
      } catch (e) {
        document.documentElement.setAttribute('data-tema', 'oscuro');
      }
    })();
  </script>
</head>
<body class="pagina-404">
  <main class="error-404">
    <p class="error-404__codigo">404</p>

    <div class="error-404__idioma" data-idioma="es">
      <p class="error-404__texto">Lo sentimos, esta pagina no existe o puede que se haya movido de sitio.</p>
      <a href="/es/" class="btn btn--linea">Volver al inicio<span aria-hidden="true">→</span></a>
    </div>

    <div class="error-404__idioma" data-idioma="en">
      <p class="error-404__texto">Sorry, this page doesn't exist, or it may have moved.</p>
      <a href="/" class="btn btn--linea">Back to home<span aria-hidden="true">→</span></a>
    </div>
  </main>

  <script>
    // Detecta el idioma a partir de la URL que se pidio (aunque no exista,
    // el navegador conserva la ruta), y si no da pista ninguna, usa el
    // idioma del navegador. Sin JS, se quedan las dos versiones visibles.
    (function () {
      var ruta = window.location.pathname;
      var idioma;
      if (ruta.indexOf('/es') === 0) {
        idioma = 'es';
      } else if (ruta === '/' || ruta.indexOf('/en') === 0) {
        idioma = 'en';
      } else {
        idioma = (navigator.language || '').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
      }
      document.querySelectorAll('.error-404__idioma').forEach(function (bloque) {
        if (bloque.dataset.idioma !== idioma) bloque.remove();
      });
    })();
  </script>
</body>
</html>
`;
}

// ============================================
// FUNCION PRINCIPAL
// ============================================
async function build() {
  console.log('Iniciando build...\n');

  fs.rmSync(DIST, { recursive: true, force: true });

  console.log('Consultando lenguajes en GitHub:');
  await enriquecerRepositorios();
  console.log('');

  console.log('Consultando READMEs en GitHub:');
  await enriquecerReadmesProyectos();
  console.log('');

  for (const idioma of IDIOMAS) {
    const prefijo = prefijoIdioma(idioma);
    const ctx = { idioma, prefijo_idioma: prefijo, site, i18n: i18n[idioma] };

    escribirArchivo(rutaArchivo(prefijo, '/index.html'), generarHome(ctx));
    escribirArchivo(rutaArchivo(prefijo, '/proyectos/index.html'), generarProyectosLista(ctx));

    proyectos.forEach((proyecto, indice) => {
      escribirArchivo(rutaArchivo(prefijo, `/proyectos/${proyecto.id}/index.html`), generarProyectoDetalle(proyecto, ctx, indice));
    });

    for (const charla of charlas) {
      escribirArchivo(rutaArchivo(prefijo, `/trayectoria/charlas/${charla.id}/index.html`), generarCharlaDetalle(charla, ctx));
    }

    for (const experiencia of experiencias) {
      escribirArchivo(rutaArchivo(prefijo, `/trayectoria/experiencias/${experiencia.id}/index.html`), generarExperienciaDetalle(experiencia, ctx));
    }

    console.log(`Paginas generadas para: ${idioma}`);
  }

  fs.cpSync(path.join(RAIZ, 'public'), DIST, { recursive: true });
  concatenarCSS();

  escribirArchivo('sitemap.xml', generarSitemap());
  escribirArchivo('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
  escribirArchivo('404.html', generarPagina404());

  console.log('\nBuild completado. Revisa la carpeta dist/');
}

build().catch((error) => {
  console.error('Error durante el build:', error);
  process.exit(1);
});