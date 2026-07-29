// ============================================
// 1. RESALTAR EL LINK ACTIVO DEL MENU
// ============================================
(function marcarNavActivo() {
    const rutaActual = window.location.pathname;
    const links = document.querySelectorAll('.nav__links a');
  
    links.forEach((link) => {
      const destino = link.getAttribute('href');
      // Coincide si la ruta actual empieza igual que el href del link
      // (asi "/es/proyectos/webbuilder/" tambien marca activo "Proyectos")
      const esHome = destino.endsWith('/es/') || destino.endsWith('/en/');
      const coincide = esHome
        ? rutaActual === destino
        : rutaActual.startsWith(destino);
  
      if (coincide) {
        link.classList.add('activo');
      }
    });
  })();
  
  
  // ============================================
  // 2. TOGGLE DE TEMA CLARO / OSCURO
  // ============================================
  (function toggleTema() {
    const boton = document.getElementById('toggle-tema');
    if (!boton) return;
  
    const CLAVE_STORAGE = 'portfolio-tema';
  
    function aplicarTema(tema) {
      if (tema === 'claro') {
        document.documentElement.setAttribute('data-tema', 'claro');
        boton.textContent = '☀️';
      } else {
        document.documentElement.removeAttribute('data-tema');
        boton.textContent = '🌙';
      }
    }
  
    // Al cargar la pagina, mira si hay preferencia guardada
    const temaGuardado = localStorage.getItem(CLAVE_STORAGE);
    if (temaGuardado) {
      aplicarTema(temaGuardado);
    } else {
      // Si no hay preferencia guardada, respeta la del sistema operativo
      const prefiereOscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
      aplicarTema(prefiereOscuro ? 'oscuro' : 'claro');
    }
  
    boton.addEventListener('click', () => {
      const temaActual = document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro';
      const nuevoTema = temaActual === 'claro' ? 'oscuro' : 'claro';
      aplicarTema(nuevoTema);
      localStorage.setItem(CLAVE_STORAGE, nuevoTema);
    });
  })();
  
  
  // ============================================
  // 3. EFECTO TERMINAL EN EL HERO
  // ============================================
  (function efectoTerminal() {
    const elemento = document.getElementById('terminal-stack');
    if (!elemento) return;
  
    const palabras = ['Python', 'Django', 'SQL', 'Power BI', 'n8n', 'Linux'];
    let indicePalabra = 0;
    let indiceLetra = 0;
    let borrando = false;
  
    function escribir() {
      const palabraActual = palabras[indicePalabra];
  
      if (!borrando) {
        elemento.textContent = palabraActual.slice(0, indiceLetra + 1);
        indiceLetra++;
  
        if (indiceLetra === palabraActual.length) {
          borrando = true;
          setTimeout(escribir, 1200); // pausa antes de borrar
          return;
        }
      } else {
        elemento.textContent = palabraActual.slice(0, indiceLetra - 1);
        indiceLetra--;
  
        if (indiceLetra === 0) {
          borrando = false;
          indicePalabra = (indicePalabra + 1) % palabras.length;
        }
      }
  
      const velocidad = borrando ? 40 : 90;
      setTimeout(escribir, velocidad);
    }
  
    escribir();
  })();
  
  
  // ============================================
  // 4. FILTRO DE CATEGORIAS EN PROYECTOS
  // ============================================
  (function filtroCategorias() {
    const botones = document.querySelectorAll('.filtro-categorias__btn');
    const cards = document.querySelectorAll('.project-card');
    if (botones.length === 0) return;
  
    botones.forEach((boton) => {
      boton.addEventListener('click', () => {
        const filtro = boton.getAttribute('data-filtro');
  
        // Quita "activo" de todos los botones y se lo pone solo al pulsado
        botones.forEach((b) => b.classList.remove('filtro-categorias__btn--activo'));
        boton.classList.add('filtro-categorias__btn--activo');
  
        cards.forEach((card) => {
          const categorias = card.getAttribute('data-categorias') || '';
  
          if (filtro === 'todos' || categorias.split(' ').includes(filtro)) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  })();


  // ============================================
// 5. CONTACTO FLOTANTE (abrir/cerrar desplegable)
// ============================================
(function contactoFlotante() {
  const boton = document.getElementById('contacto-flotante-toggle');
  const menu = document.getElementById('contacto-flotante-menu');
  if (!boton || !menu) return;

  boton.addEventListener('click', (evento) => {
    evento.stopPropagation(); // evita que el clic "se escape" y cierre el menu inmediatamente
    const estaAbierto = menu.classList.toggle('abierto');
    boton.setAttribute('aria-expanded', estaAbierto ? 'true' : 'false');
  });

  // Cierra el menu si el usuario hace clic en cualquier otro sitio de la pagina
  document.addEventListener('click', (evento) => {
    const clicFuera = !menu.contains(evento.target) && evento.target !== boton;
    if (clicFuera) {
      menu.classList.remove('abierto');
      boton.setAttribute('aria-expanded', 'false');
    }
  });
})();