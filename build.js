const fs = require('fs');
const path = require('path');

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
  trayectoria: leerHTML('templates/trayectoria.html'),
  charlaDetalle: leerHTML('templates/charla-detalle.html'),
};

const partials = {
  nav: leerHTML('partials/nav.html'),
  menuOverlay: leerHTML('partials/menu-overlay.html'),
  footer: leerHTML('partials/footer.html'),
  projectCard: leerHTML('partials/project-card.html'),
  repoCard: leerHTML('partials/repo-card.html'),
  skillGroup: leerHTML('partials/skill-group.html'),
  timelineItem: leerHTML('partials/timeline-item.html'),
  hitoMini: leerHTML('partials/hito-mini.html'),
  filtroCategorias: leerHTML('partials/filtro-categorias.html'),
  charlaCard: leerHTML('partials/charla-card.html'),
  contactoFlotante: leerHTML('partials/contacto-flotante.html'),
  valorCard: leerHTML('partials/valor-card.html'),
};

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

async function obtenerLenguajes(nombreRepo) {
  const url = `https://api.github.com/repos/AlejandroTejero/${nombreRepo}/languages`;

  try {
    const respuesta = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'portfolio-build' },
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
// COLORES PARA LA BARRA DE LENGUAJES
// ============================================
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
function renderizarPortada(titulo, rutaImagen, indice) {
  if (existeEnPublic(rutaImagen)) {
    return `<img src="${rutaImagen}" alt="${escaparHtml(titulo)}" loading="lazy">`;
  }

  // Sin imagen todavia: monograma tipografico en vez de un hueco roto.
  return `<span class="portada-monograma" data-tono="${indice % 4}" aria-hidden="true">${escaparHtml(iniciales(titulo))}</span>`;
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
function renderizarProjectCard(proyecto, ctx, indice = 0) {
  const tech = proyecto.tecnologias.map((t) => `<li>${t}</li>`).join('');
  const nota = limpiar(proyecto.nota_academica);

  return reemplazar(partials.projectCard, {
    ...ctx,
    proyecto: {
      ...proyecto,
      resumen: proyecto.resumen[ctx.idioma],
      estado: proyecto.estado[ctx.idioma],
      categorias_espacio: proyecto.categorias.join(' '),
      indice_formateado: String(indice + 1).padStart(2, '0'),
    },
    portada: renderizarPortada(proyecto.titulo, proyecto.imagen, indice),
    lista_tecnologias: tech,
    nota_academica_si_existe: nota ? `<span class="project-card__nota">${escaparHtml(nota)}</span>` : '',
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

  return reemplazar(partials.repoCard, {
    ...ctx,
    repo: {
      ...repo,
      asignatura: repo.asignatura[ctx.idioma],
    },
    descripcion_si_existe: descripcion ? `<p class="repo-card__descripcion">${escaparHtml(descripcion)}</p>` : '',
    barra_si_existe: barra ? `<div class="repo-card__barra">${barra}</div>` : '',
    lista_lenguajes: etiquetas,
  });
}

function renderizarSkillGroup(categoria, ctx, indice = 0) {
  const items = categoria.items
    .map((item) => (typeof item === 'object' ? item[ctx.idioma] : item))
    .map((i) => `<li>${escaparHtml(i)}</li>`)
    .join('');
  const nivelClave = categoria.nivel_clave || '';
  const nivelTexto = categoria.nivel ? limpiar(categoria.nivel[ctx.idioma]) : '';

  return reemplazar(partials.skillGroup, {
    ...ctx,
    categoria: {
      nombre: categoria.nombre[ctx.idioma],
      nivel_clase: nivelClave,
      indice_formateado: String(indice + 1).padStart(2, '0'),
    },
    nivel_si_existe: nivelTexto ? `<span class="skill-group__nivel skill-group__nivel--${nivelClave}">${escaparHtml(nivelTexto)}</span>` : '',
    lista_items: items,
  });
}

function renderizarHitoMini(hito, ctx) {
  return reemplazar(partials.hitoMini, {
    ...ctx,
    hito: {
      anio: hito.anio,
      titulo: hito.titulo[ctx.idioma],
    },
  });
}

function renderizarTimelineItem(hito, ctx) {
  const institucion = limpiar(hito.institucion);
  const descripcion = hito.descripcion ? limpiar(hito.descripcion[ctx.idioma]) : '';
  const etiquetaTipo = ctx.i18n[`tipo_${hito.tipo}`] || hito.tipo;

  return reemplazar(partials.timelineItem, {
    ...ctx,
    hito: {
      ...hito,
      titulo: hito.titulo[ctx.idioma],
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

function renderizarFiltroCategorias(ctx) {
  const categoriasUnicas = [...new Set(proyectos.flatMap((p) => p.categorias))];
  const botones = categoriasUnicas
    .map((cat) => `<button class="filtro__btn" data-filtro="${cat}">${cat}</button>`)
    .join('');

  return reemplazar(partials.filtroCategorias, { ...ctx, lista_botones_categoria: botones });
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

function renderizarValorCard(valor, ctx, indice = 0) {
  return reemplazar(partials.valorCard, {
    ...ctx,
    valor: {
      titulo: valor.titulo[ctx.idioma],
      descripcion: valor.descripcion[ctx.idioma],
      indice_formateado: String(indice + 1).padStart(2, '0'),
    },
  });
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
  return reemplazar(partials.footer, { ...ctx, anio_actual: new Date().getFullYear() });
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
  });
}

// ============================================
// GENERACION DE CADA PAGINA
// ============================================
function generarHome(ctx) {
  const destacados = proyectos.filter((p) => p.destacado).slice(0, 4);

  const hitosTeaser = [...timeline]
    .filter((h) => h.tipo !== 'proyecto')
    .sort((a, b) => {
      const mesA = /^\d+$/.test(String(a.mes)) ? a.mes : '00';
      const mesB = /^\d+$/.test(String(b.mes)) ? b.mes : '00';
      return `${a.anio}${mesA}`.localeCompare(`${b.anio}${mesB}`);
    })
    .slice(-4);

  const setupEntradas = [
    { etiqueta: ctx.i18n.setup_so, valor: limpiar(site.setup.so) },
    { etiqueta: ctx.i18n.setup_editor, valor: limpiar(site.setup.editor) },
    { etiqueta: ctx.i18n.setup_terminal, valor: limpiar(site.setup.terminal) },
  ].filter((entrada) => entrada.valor);

  const setupHtml = setupEntradas.length
    ? `<section class="seccion seccion--setup reveal">
         <div class="contenedor">
           <p class="etiqueta-seccion">${ctx.i18n.setup_titulo}</p>
           <dl class="setup__lista">
             ${setupEntradas.map((e) => `<div class="setup__fila"><dt>${e.etiqueta}</dt><dd>${escaparHtml(e.valor)}</dd></div>`).join('')}
           </dl>
         </div>
       </section>`
    : '';

  const contenido = reemplazar(plantillas.home, {
    ...ctx,
    site: { ...site, cv_pdf: site.cv_pdf[ctx.idioma] },
    hero: { rol: site.hero_rol[ctx.idioma], titulo: site.titulo[ctx.idioma], intro: site.hero_intro[ctx.idioma] },
    retrato: renderizarFotoPerfil(),
    lista_badges: renderizarBadges(site.badges, ctx),
    lista_bio_parrafos: renderizarBioParrafos(site.bio_parrafos, ctx),
    lista_valores: site.valores.map((v, i) => renderizarValorCard(v, ctx, i)).join(''),
    lista_proyectos_destacados: destacados.map((p, i) => renderizarProjectCard(p, ctx, i)).join(''),
    lista_hitos_mini: hitosTeaser.map((h) => renderizarHitoMini(h, ctx)).join(''),
    seccion_setup: setupHtml,
  });

  return envolverEnLayout(contenido, {
    titulo: site.nombre,
    descripcion: site.bio[ctx.idioma],
    rutaSinIdioma: '/',
    claseBody: 'es-home',
  }, ctx);
}

function generarProyectosLista(ctx) {
  const contenido = reemplazar(plantillas.proyectosLista, {
    ...ctx,
    filtro_categorias: renderizarFiltroCategorias(ctx),
    lista_todos_los_proyectos: proyectos.map((p, i) => renderizarProjectCard(p, ctx, i)).join(''),
    lista_repos_academicos: repositorios.map((r) => renderizarRepoCard(r, ctx)).join(''),
    lista_skill_groups: skills.categorias.map((c, i) => renderizarSkillGroup(c, ctx, i)).join(''),
    total_proyectos: proyectos.length,
    total_repos: repositorios.length,
  });

  return envolverEnLayout(contenido, {
    titulo: ctx.i18n.proyectos_titulo,
    descripcion: ctx.i18n.proyectos_intro,
    rutaSinIdioma: '/proyectos/',
  }, ctx);
}

function generarProyectoDetalle(proyecto, ctx, indice) {
  const tech = proyecto.tecnologias.map((t) => `<li>${t}</li>`).join('');

  const etiquetasEnlace = {
    github: 'GitHub', landing: ctx.i18n.enlace_landing,
    memoria: ctx.i18n.enlace_memoria, slides: ctx.i18n.enlace_slides,
    linkedin: 'LinkedIn', cartel: ctx.i18n.enlace_cartel, video: ctx.i18n.enlace_video,
  };

  const enlaces = Object.entries(proyecto.enlaces || {})
    .filter(([, url]) => limpiar(url))
    .map(([tipo, url]) => `<a href="${url}" target="_blank" rel="noopener" class="btn btn--linea">${etiquetasEnlace[tipo] || tipo}<span aria-hidden="true">↗</span></a>`)
    .join('');

  const relacionados = proyectos
    .filter((p) => p.id !== proyecto.id && p.categorias.some((c) => proyecto.categorias.includes(c)))
    .slice(0, 2)
    .map((p, i) => renderizarProjectCard(p, ctx, i))
    .join('');

  const nota = limpiar(proyecto.nota_academica);

  const contenido = reemplazar(plantillas.proyectoDetalle, {
    ...ctx,
    proyecto: {
      ...proyecto,
      resumen: proyecto.resumen[ctx.idioma],
      descripcion: proyecto.descripcion[ctx.idioma],
      estado: proyecto.estado[ctx.idioma],
    },
    portada: renderizarPortada(proyecto.titulo, proyecto.imagen, indice),
    lista_tecnologias: tech,
    lista_enlaces: enlaces,
    lista_proyectos_relacionados: relacionados,
    nota_academica_si_existe: nota ? `<div class="dato"><dt>${ctx.i18n.nota_academica}</dt><dd>${escaparHtml(nota)}</dd></div>` : '',
    bloque_relacionados: relacionados
      ? `<section class="seccion reveal"><div class="contenedor"><p class="etiqueta-seccion">${ctx.i18n.tambien_te_puede_interesar}</p><div class="rejilla-proyectos rejilla-proyectos--duo">${relacionados}</div></div></section>`
      : '',
  });

  return envolverEnLayout(contenido, {
    titulo: proyecto.titulo,
    descripcion: proyecto.resumen[ctx.idioma],
    imagen: `${BASE_URL}${proyecto.imagen}`,
    rutaSinIdioma: `/proyectos/${proyecto.id}/`,
  }, ctx);
}

function generarTrayectoria(ctx) {
  const timelineOrdenado = [...timeline].sort((a, b) => {
    const mesA = /^\d+$/.test(String(a.mes)) ? a.mes : '00';
    const mesB = /^\d+$/.test(String(b.mes)) ? b.mes : '00';
    return `${b.anio}${mesB}`.localeCompare(`${a.anio}${mesA}`);
  });

  const charlasOrdenadas = [...charlas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const contenido = reemplazar(plantillas.trayectoria, {
    ...ctx,
    lista_timeline_items: timelineOrdenado.map((h) => renderizarTimelineItem(h, ctx)).join(''),
    lista_charlas: charlasOrdenadas.map((c) => renderizarCharlaCard(c, ctx)).join(''),
  });

  return envolverEnLayout(contenido, {
    titulo: ctx.i18n.trayectoria_titulo,
    descripcion: ctx.i18n.trayectoria_intro,
    rutaSinIdioma: '/trayectoria/',
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

// ============================================
// SITEMAP
// ============================================
function generarSitemap() {
  const rutas = ['/'];
  rutas.push('/proyectos/');
  rutas.push('/trayectoria/');
  proyectos.forEach((p) => rutas.push(`/proyectos/${p.id}/`));
  charlas.forEach((c) => rutas.push(`/trayectoria/charlas/${c.id}/`));

  const urls = IDIOMAS.flatMap((idioma) =>
    rutas.map((ruta) => `  <url><loc>${BASE_URL}${prefijoIdioma(idioma)}${ruta}</loc></url>`)
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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

  for (const idioma of IDIOMAS) {
    const prefijo = prefijoIdioma(idioma);
    const ctx = { idioma, prefijo_idioma: prefijo, site, i18n: i18n[idioma] };

    escribirArchivo(rutaArchivo(prefijo, '/index.html'), generarHome(ctx));
    escribirArchivo(rutaArchivo(prefijo, '/proyectos/index.html'), generarProyectosLista(ctx));
    escribirArchivo(rutaArchivo(prefijo, '/trayectoria/index.html'), generarTrayectoria(ctx));

    proyectos.forEach((proyecto, indice) => {
      escribirArchivo(rutaArchivo(prefijo, `/proyectos/${proyecto.id}/index.html`), generarProyectoDetalle(proyecto, ctx, indice));
    });

    for (const charla of charlas) {
      escribirArchivo(rutaArchivo(prefijo, `/trayectoria/charlas/${charla.id}/index.html`), generarCharlaDetalle(charla, ctx));
    }

    console.log(`Paginas generadas para: ${idioma}`);
  }

  fs.cpSync(path.join(RAIZ, 'public'), DIST, { recursive: true });
  concatenarCSS();

  escribirArchivo('sitemap.xml', generarSitemap());
  escribirArchivo('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);

  console.log('\nBuild completado. Revisa la carpeta dist/');
}

build().catch((error) => {
  console.error('Error durante el build:', error);
  process.exit(1);
});