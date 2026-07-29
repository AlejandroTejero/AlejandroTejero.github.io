const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURACION GENERAL
// ============================================
const BASE_URL = 'https://tudominio.com';
const IDIOMAS = ['es', 'en'];
const RAIZ = __dirname;
const DIST = path.join(RAIZ, 'dist');

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
  const orden = ['variables.css', 'base.css', 'layout.css', 'componentes.css', 'paginas.css'];
  const contenido = orden
    .map((archivo) => fs.readFileSync(path.join(RAIZ, 'public/css', archivo), 'utf-8'))
    .join('\n\n');

  escribirArchivo('css/style.css', contenido);
}

function reemplazar(plantilla, datos) {
  return plantilla.replace(/{{\s*([\w.]+)\s*}}/g, (coincidenciaCompleta, ruta) => {
    const valor = ruta.split('.').reduce((obj, clave) => (obj ? obj[clave] : undefined), datos);
    return valor !== undefined && valor !== null ? valor : '';
  });
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
  footer: leerHTML('partials/footer.html'),
  projectCard: leerHTML('partials/project-card.html'),
  repoCard: leerHTML('partials/repo-card.html'),
  skillGroup: leerHTML('partials/skill-group.html'),
  timelineItem: leerHTML('partials/timeline-item.html'),
  filtroCategorias: leerHTML('partials/filtro-categorias.html'),
  charlaCard: leerHTML('partials/charla-card.html'),
  contactoFlotante: leerHTML('partials/contacto-flotante.html'),
  valorCard: leerHTML('partials/valor-card.html'), // CAMBIO: nuevo partial cargado
};

// ============================================
// GITHUB API: RELLENAR LENGUAJES DE REPOSITORIOS
// ============================================
async function obtenerLenguajes(nombreRepo) {
  const url = `https://api.github.com/repos/AlejandroTejero/${nombreRepo}/languages`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) return [];

  const datos = await respuesta.json();
  const total = Object.values(datos).reduce((suma, bytes) => suma + bytes, 0);

  return Object.entries(datos).map(([nombre, bytes]) => ({
    nombre,
    porcentaje: Math.round((bytes / total) * 100),
  }));
}

async function enriquecerRepositorios() {
  for (const repo of repositorios) {
    console.log(`Consultando lenguajes de ${repo.nombre}...`);
    repo.lenguajes = await obtenerLenguajes(repo.nombre);
  }
}

// ============================================
// COLORES PARA LA BARRA DE LENGUAJES
// ============================================
const COLORES_LENGUAJE = {
  Python: '#3776AB', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  'C++': '#f34b7d', C: '#555555', SQL: '#e38c00', HTML: '#e34c26',
  CSS: '#563d7c', Pascal: '#E3F171', Shell: '#89e051',
};
function colorLenguaje(nombre) {
  return COLORES_LENGUAJE[nombre] || 'var(--color-borde)';
}

// ============================================
// RENDERIZADO DE PIEZAS REPETIBLES (partials)
// ============================================
function renderizarProjectCard(proyecto, ctx) {
  const tech = proyecto.tecnologias.map((t) => `<li>${t}</li>`).join('');
  return reemplazar(partials.projectCard, {
    ...ctx,
    proyecto: {
      ...proyecto,
      titulo: proyecto.titulo,
      resumen: proyecto.resumen[ctx.idioma],
      categorias_espacio: proyecto.categorias.join(' '),
    },
    lista_tecnologias: tech,
  });
}

function renderizarRepoCard(repo, ctx) {
  const barra = (repo.lenguajes || [])
    .map((l) => `<div style="width:${l.porcentaje}%; background:${colorLenguaje(l.nombre)}" title="${l.nombre} ${l.porcentaje}%"></div>`)
    .join('');

  return reemplazar(partials.repoCard, {
    ...ctx,
    repo: {
      ...repo,
      asignatura: repo.asignatura[ctx.idioma],
      descripcion: repo.descripcion[ctx.idioma],
    },
    barra_lenguajes: barra,
  });
}

function renderizarSkillGroup(categoria, ctx) {
  const items = categoria.items.map((i) => `<li>${i}</li>`).join('');
  const nivelClase = (categoria.nivel || '').toLowerCase();

  return reemplazar(partials.skillGroup, {
    ...ctx,
    categoria: {
      nombre: categoria.nombre[ctx.idioma],
      nivel: categoria.nivel || '',
      nivel_clase: nivelClase,
    },
    lista_items: items,
  });
}

function renderizarTimelineItem(hito, ctx) {
  const institucion = hito.institucion ? `<p class="timeline-item__institucion">${hito.institucion}</p>` : '';
  const descripcion = hito.descripcion ? `<p class="timeline-item__descripcion">${hito.descripcion[ctx.idioma]}</p>` : '';

  return reemplazar(partials.timelineItem, {
    ...ctx,
    hito: {
      ...hito,
      titulo: hito.titulo[ctx.idioma],
    },
    institucion_si_existe: institucion,
    descripcion_si_existe: descripcion,
  });
}

function renderizarCharlaCard(charla, ctx) {
  return reemplazar(partials.charlaCard, {
    ...ctx,
    charla: {
      ...charla,
      titulo: charla.titulo[ctx.idioma],
      rol: charla.rol[ctx.idioma],
      resumen: charla.resumen[ctx.idioma],
      fecha_formateada: formatearFecha(charla.fecha, ctx.idioma),
    },
  });
}

function formatearFecha(fechaISO, idioma) {
  const fecha = new Date(fechaISO);
  const locale = idioma === 'es' ? 'es-ES' : 'en-US';
  return fecha.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderizarFiltroCategorias(ctx) {
  const categoriasUnicas = [...new Set(proyectos.flatMap((p) => p.categorias))];
  const botones = categoriasUnicas
    .map((cat) => `<button class="filtro-categorias__btn" data-filtro="${cat}">${cat}</button>`)
    .join('');

  return reemplazar(partials.filtroCategorias, { ...ctx, lista_botones_categoria: botones });
}

function renderizarContactoFlotante(ctx) {
  return reemplazar(partials.contactoFlotante, { ...ctx });
}

// CAMBIO: nuevas funciones de renderizado para el home ampliado
function renderizarBadges(badges, ctx) {
  return badges
    .map((b) => `<span class="badge">${b[ctx.idioma]}</span>`)
    .join('');
}

function renderizarBioParrafos(parrafos, ctx) {
  return parrafos[ctx.idioma]
    .map((p) => `<p>${p}</p>`)
    .join('');
}

function renderizarValorCard(valor, ctx) {
  return reemplazar(partials.valorCard, {
    ...ctx,
    valor: {
      icono: valor.icono,
      titulo: valor.titulo[ctx.idioma],
      descripcion: valor.descripcion[ctx.idioma],
    },
  });
}

// ============================================
// NAV Y FOOTER
// ============================================
function renderizarNav(ctx) {
  const idiomaAlterno = ctx.idioma === 'es' ? 'en' : 'es';
  return reemplazar(partials.nav, {
    ...ctx,
    url_idioma_alterno: `/${idiomaAlterno}${ctx.rutaSinIdioma || '/'}`,
    idioma_alterno_label: idiomaAlterno.toUpperCase(),
  });
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
    nav: renderizarNav({ ...ctx, rutaSinIdioma: meta.rutaSinIdioma }),
    footer: renderizarFooter(ctx),
    contacto_flotante: renderizarContactoFlotante(ctx),
    titulo_pagina: meta.titulo,
    meta_descripcion: meta.descripcion,
    url_canonica: `${BASE_URL}/${ctx.idioma}${meta.rutaSinIdioma}`,
    url_alternativa_es: `${BASE_URL}/es${meta.rutaSinIdioma}`,
    url_alternativa_en: `${BASE_URL}/en${meta.rutaSinIdioma}`,
    og_imagen: meta.imagen || `${BASE_URL}/img/og-default.png`,
  });
}

// ============================================
// GENERACION DE CADA PAGINA
// ============================================
function generarHome(ctx) {
  // CAMBIO: se generan los 3 huecos nuevos del home ampliado
  const badgesHtml = renderizarBadges(site.badges, ctx);
  const bioHtml = renderizarBioParrafos(site.bio_parrafos, ctx);
  const valoresHtml = site.valores.map((v) => renderizarValorCard(v, ctx)).join('');

  const contenido = reemplazar(plantillas.home, {
    ...ctx,
    site: {
      ...site,
      cv_pdf: site.cv_pdf[ctx.idioma],
    },
    hero: { rol: site.hero_rol[ctx.idioma] },
    lista_badges: badgesHtml,
    lista_bio_parrafos: bioHtml,
    lista_valores: valoresHtml,
  });

  return envolverEnLayout(contenido, {
    titulo: site.nombre,
    descripcion: site.bio_parrafos[ctx.idioma][0], // CAMBIO: usa el primer parrafo como meta description
    rutaSinIdioma: '/',
  }, ctx);
}

function generarProyectosLista(ctx) {
  const filtro = renderizarFiltroCategorias(ctx);
  const cardsProyectos = proyectos.map((p) => renderizarProjectCard(p, ctx)).join('');
  const cardsRepos = repositorios.map((r) => renderizarRepoCard(r, ctx)).join('');
  const gruposSkills = skills.categorias.map((c) => renderizarSkillGroup(c, ctx)).join('');

  const contenido = reemplazar(plantillas.proyectosLista, {
    ...ctx,
    filtro_categorias: filtro,
    lista_todos_los_proyectos: cardsProyectos,
    lista_repos_academicos: cardsRepos,
    lista_skill_groups: gruposSkills,
  });

  return envolverEnLayout(contenido, {
    titulo: ctx.i18n.proyectos_titulo,
    descripcion: ctx.i18n.proyectos_intro,
    rutaSinIdioma: '/proyectos/',
  }, ctx);
}

function generarProyectoDetalle(proyecto, ctx) {
  const tech = proyecto.tecnologias.map((t) => `<li>${t}</li>`).join('');

  const enlaces = Object.entries(proyecto.enlaces || {})
    .map(([tipo, url]) => `<a href="${url}" target="_blank" rel="noopener" class="btn btn--secundario">${tipo}</a>`)
    .join('');

  const relacionados = proyectos
    .filter((p) => p.id !== proyecto.id && p.categorias.some((c) => proyecto.categorias.includes(c)))
    .slice(0, 2)
    .map((p) => renderizarProjectCard(p, ctx))
    .join('');

  const notaAcademica = proyecto.nota_academica ? `<span>${proyecto.nota_academica}</span>` : '';

  const contenido = reemplazar(plantillas.proyectoDetalle, {
    ...ctx,
    proyecto: {
      ...proyecto,
      resumen: proyecto.resumen[ctx.idioma],
      descripcion: proyecto.descripcion[ctx.idioma],
    },
    lista_tecnologias: tech,
    lista_enlaces: enlaces,
    lista_proyectos_relacionados: relacionados,
    nota_academica_si_existe: notaAcademica,
  });

  return envolverEnLayout(contenido, {
    titulo: proyecto.titulo,
    descripcion: proyecto.resumen[ctx.idioma],
    imagen: `${BASE_URL}${proyecto.imagen}`,
    rutaSinIdioma: `/proyectos/${proyecto.id}/`,
  }, ctx);
}

function generarTrayectoria(ctx) {
  // CAMBIO: orden invertido, de mas reciente (2026) a mas antiguo (2021)
  const timelineOrdenado = [...timeline].sort((a, b) => {
    return `${b.anio}${b.mes || '00'}`.localeCompare(`${a.anio}${a.mes || '00'}`);
  });
  const itemsTimeline = timelineOrdenado.map((h) => renderizarTimelineItem(h, ctx)).join('');

  const charlasOrdenadas = [...charlas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const cardsCharlas = charlasOrdenadas.map((c) => renderizarCharlaCard(c, ctx)).join('');

  const contenido = reemplazar(plantillas.trayectoria, {
    ...ctx,
    lista_timeline_items: itemsTimeline,
    lista_charlas: cardsCharlas,
  });

  return envolverEnLayout(contenido, {
    titulo: ctx.i18n.trayectoria_titulo,
    descripcion: ctx.i18n.trayectoria_intro,
    rutaSinIdioma: '/trayectoria/',
  }, ctx);
}

function generarCharlaDetalle(charla, ctx) {
  const enlaces = Object.entries(charla.enlaces || {})
    .filter(([, url]) => url)
    .map(([tipo, url]) => `<a href="${url}" target="_blank" rel="noopener" class="btn btn--secundario">${tipo}</a>`)
    .join('');

  let proyectoRelacionadoHtml = '';
  if (charla.proyecto_relacionado) {
    const proyecto = proyectos.find((p) => p.id === charla.proyecto_relacionado);
    if (proyecto) proyectoRelacionadoHtml = renderizarProjectCard(proyecto, ctx);
  }

  const contenido = reemplazar(plantillas.charlaDetalle, {
    ...ctx,
    charla: {
      ...charla,
      titulo: charla.titulo[ctx.idioma],
      rol: charla.rol[ctx.idioma],
      resumen: charla.resumen[ctx.idioma],
      fecha_formateada: formatearFecha(charla.fecha, ctx.idioma),
    },
    lista_enlaces_charla: enlaces,
    proyecto_relacionado_si_existe: proyectoRelacionadoHtml,
  });

  return envolverEnLayout(contenido, {
    titulo: charla.titulo[ctx.idioma],
    descripcion: charla.resumen[ctx.idioma],
    rutaSinIdioma: `/trayectoria/charlas/${charla.id}/`,
  }, ctx);
}

// ============================================
// FUNCION PRINCIPAL
// ============================================
async function build() {
  console.log('Iniciando build...\n');

  fs.rmSync(DIST, { recursive: true, force: true });

  await enriquecerRepositorios();

  for (const idioma of IDIOMAS) {
    const ctx = { idioma, site, i18n: i18n[idioma] };

    escribirArchivo(`${idioma}/index.html`, generarHome(ctx));
    escribirArchivo(`${idioma}/proyectos/index.html`, generarProyectosLista(ctx));
    escribirArchivo(`${idioma}/trayectoria/index.html`, generarTrayectoria(ctx));

    for (const proyecto of proyectos) {
      escribirArchivo(`${idioma}/proyectos/${proyecto.id}/index.html`, generarProyectoDetalle(proyecto, ctx));
    }

    for (const charla of charlas) {
      escribirArchivo(`${idioma}/trayectoria/charlas/${charla.id}/index.html`, generarCharlaDetalle(charla, ctx));
    }

    console.log(`Paginas generadas para: ${idioma}`);
  }

  fs.cpSync(path.join(RAIZ, 'public'), DIST, { recursive: true });
  concatenarCSS();

  escribirArchivo('index.html', `<meta http-equiv="refresh" content="0; url=/es/">`);

  console.log('\nBuild completado. Revisa la carpeta dist/');
}

build().catch((error) => {
  console.error('Error durante el build:', error);
  process.exit(1);
});