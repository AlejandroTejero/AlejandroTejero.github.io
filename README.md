# Portfolio · Alejandro Tejero de la Morena

Portfolio personal generado con un build propio en Node (sin frameworks ni
dependencias). Genera HTML estatico en dos idiomas (ES/EN) con modo claro y
oscuro.

## Poner en marcha

Necesitas Node 18 o superior.

```bash
npm run build     # genera la carpeta dist/
npm run serve     # sirve dist/ en http://localhost:3000
```

O en un solo paso:

```bash
npm run dev
```

**Importante:** el sitio usa rutas absolutas (`/css/style.css`, `/es/proyectos/`),
asi que hay que abrirlo con un servidor. Si abres `dist/es/index.html` haciendo
doble clic no cargaran los estilos. Alternativa sin npm:

```bash
cd dist && python3 -m http.server 8000
```

Y entra en `http://localhost:8000`.

Si estas sin conexion o GitHub te limita las peticiones:

```bash
npm run build:offline
```

## Estructura

```
content/          Contenido en JSON (lo que editas normalmente)
  site.json         Datos personales, bio, badges, valores, setup
  proyectos.json    Proyectos destacados con descripcion y enlaces
  repositorios.json Repos academicos de la carrera
  skills.json       Competencias tecnicas por categoria
  timeline.json     Hitos de la trayectoria
  charlas.json      Charlas y ponencias
  lenguajes-cache.json  Cache de lenguajes de GitHub (se regenera solo)

i18n/             Traducciones de la interfaz (es.json / en.json)
templates/        Plantillas de pagina
partials/         Piezas reutilizables (nav, menu, tarjetas, pie)
public/           Assets copiados tal cual a dist/
  css/              Se concatenan en dist/css/style.css
  js/main.js        Menu overlay, scroll reveal, tema, filtros
  img/              Imagenes (ver public/img/LEEME.txt)
  cv/               PDFs del CV (ver public/cv/LEEME.txt)
build.js          Generador
dist/             Salida del build (no se edita a mano)
```

## Como esta hecho el diseno

**Navegacion.** Barra superior minima: nombre, idioma, tema y un boton `Menu`.
Al pulsarlo se abre un panel a pantalla completa cuyos enlaces entran
escalonados, cada uno con una descripcion corta de la seccion. El boton pasa de
`Menu` a `Cerrar` y las dos lineas se convierten en aspa.

**Entrada del hero.** La pagina arranca practicamente vacia y el titular, el rol
y los botones aparecen por lineas con un revelado por mascara (cada linea es una
ventana con `overflow: hidden` y su contenido sube desde abajo). Esta animacion es
solo CSS: si el JavaScript falla, el contenido se ve igual.

**Scroll.** Cada seccion aparece al entrar en pantalla mediante
`IntersectionObserver`, con escalonado en las rejillas. El estado oculto se aplica
solo si hay JS (clase `.js` en `<html>`), asi que sin JavaScript nada queda
invisible.

**Paletas.**

| Rol       | Modo oscuro | Modo claro |
| --------- | ----------- | ---------- |
| Fondo     | `#242933`   | `#EDE7D9`  |
| Tarjetas  | `#3B4252`   | `#DDD5C1`  |
| Acento    | `#88C0D0`   | `#2F4A6B`  |
| Texto     | `#ECEFF4`   | `#0F0F0E`  |

Se cambian en `public/css/variables.css`. El tema se aplica en el `<head>` antes
de pintar, asi que no hay parpadeo de color al cargar.

**Tipografia.** Bricolage Grotesque para titulares, Instrument Sans para texto y
JetBrains Mono para etiquetas, indices y datos tecnicos. Se cargan desde Google
Fonts en `templates/layout.html`.

## Detalles utiles

- **Campos a medio rellenar.** Cualquier valor que empiece por `PENDIENTE` o
  `PENDING` en los JSON se trata como vacio y su bloque se oculta, en vez de
  imprimirse en la web. La seccion "Mi setup" aparece sola en cuanto rellenes
  los valores en `content/site.json`.
- **Imagenes que aun no existen.** Si la ruta de una portada no esta en
  `public/`, el build pone un monograma tipografico en su lugar. Al anadir la
  imagen real se usa automaticamente.
- **Lenguajes de los repos.** Se consultan en la API de GitHub durante el build.
  Si la API falla, se usa `content/lenguajes-cache.json`, que se actualiza cada
  vez que la consulta funciona.
- **Accesibilidad.** Enlace de salto al contenido, foco visible, foco atrapado
  dentro del menu abierto, cierre con `Escape` y `prefers-reduced-motion`
  respetado (desactiva todas las animaciones).
- **SEO.** El build genera `sitemap.xml`, `robots.txt`, canonical y `hreflang`
  para cada pagina en ambos idiomas.

## Pendiente de rellenar

- Fotos de perfil y portadas de proyecto en `public/img/`
- PDFs del CV en `public/cv/`
- Valores de `setup` en `content/site.json`
- Lugar y enlaces de la charla seLIA en `content/charlas.json`
- Descripciones de los repos marcados como `PENDIENTE` en `content/repositorios.json`
- Cambiar `BASE_URL` en `build.js` por tu dominio real
