/* ============================================
   1. MENU OVERLAY
   Abre y cierra el panel a pantalla completa, bloquea el scroll
   del fondo, cierra con Escape y mantiene el foco dentro del menu.
   ============================================ */
(function menuOverlay() {
  const boton = document.getElementById('boton-menu');
  const menu = document.getElementById('menu-overlay');
  if (!boton || !menu) return;

  const cuerpo = document.body;
  const DURACION_CIERRE = 700; // debe coincidir con --dur-menu del CSS
  let abierto = false;

  function elementosEnfocables() {
    return Array.from(menu.querySelectorAll('a[href], button:not([disabled])'))
      .filter((el) => el.offsetParent !== null);
  }

  function abrir() {
    abierto = true;
    menu.classList.add('abierto');
    menu.setAttribute('aria-hidden', 'false');
    cuerpo.classList.add('menu-abierto');
    boton.setAttribute('aria-expanded', 'true');

    // El foco entra en el menu una vez terminada la animacion de apertura
    window.setTimeout(() => {
      const primero = elementosEnfocables()[0];
      if (primero && abierto) primero.focus({ preventScroll: true });
    }, 380);
  }

  function cerrar(devolverFoco = true) {
    abierto = false;
    menu.classList.remove('abierto');
    menu.setAttribute('aria-hidden', 'true');
    cuerpo.classList.remove('menu-abierto');
    boton.setAttribute('aria-expanded', 'false');
    if (devolverFoco) boton.focus({ preventScroll: true });
  }

  boton.addEventListener('click', () => {
    if (abierto) cerrar();
    else abrir();
  });

  // Al pulsar un enlace, se cierra el menu antes de navegar
  menu.querySelectorAll('.menu__enlace').forEach((enlace) => {
    enlace.addEventListener('click', (evento) => {
      const destino = enlace.getAttribute('href');
      const esMismaPagina = destino === window.location.pathname;

      if (esMismaPagina) {
        evento.preventDefault();
        cerrar();
        return;
      }

      evento.preventDefault();
      cerrar(false);
      window.setTimeout(() => {
        window.location.href = destino;
      }, DURACION_CIERRE * 0.45);
    });
  });

  document.addEventListener('keydown', (evento) => {
    if (!abierto) return;

    if (evento.key === 'Escape') {
      cerrar();
      return;
    }

    // Ciclo de tabulacion encerrado dentro del menu
    if (evento.key === 'Tab') {
      const enfocables = elementosEnfocables();
      if (!enfocables.length) return;

      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activo = document.activeElement;

      if (evento.shiftKey && (activo === primero || activo === boton)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }
  });
})();


/* ============================================
   2. MARCAR LA PAGINA ACTIVA EN EL MENU
   ============================================ */
(function marcarActivo() {
  const rutaActual = window.location.pathname;
  const enlaces = document.querySelectorAll('.menu__enlace');

  enlaces.forEach((enlace) => {
    const destino = enlace.getAttribute('href');
    const esHome = /^\/(es|en)\/$/.test(destino);
    const coincide = esHome ? rutaActual === destino : rutaActual.startsWith(destino);

    if (coincide) enlace.classList.add('activo');
  });
})();


/* ============================================
   3. BARRA: se oculta al bajar, reaparece al subir
   ============================================ */
(function barraScroll() {
  const barra = document.getElementById('barra');
  if (!barra) return;

  const UMBRAL = 8;
  const ALTURA_ACTIVACION = 40;
  let ultimoScroll = window.scrollY;
  let pendiente = false;

  function actualizar() {
    const actual = window.scrollY;
    const diferencia = actual - ultimoScroll;

    if (actual <= ALTURA_ACTIVACION) {
      barra.classList.remove('barra--oculta', 'barra--scrolled');
    } else {
      barra.classList.add('barra--scrolled');

      if (Math.abs(diferencia) > UMBRAL && !document.body.classList.contains('menu-abierto')) {
        barra.classList.toggle('barra--oculta', diferencia > 0);
        ultimoScroll = actual;
      }
    }

    if (actual <= ALTURA_ACTIVACION) ultimoScroll = actual;
    pendiente = false;
  }

  window.addEventListener('scroll', () => {
    if (!pendiente) {
      window.requestAnimationFrame(actualizar);
      pendiente = true;
    }
  }, { passive: true });
})();


/* ============================================
   4. TEMA CLARO / OSCURO
   El tema inicial ya se aplica en el <head> para evitar el parpadeo.
   ============================================ */
(function toggleTema() {
  const boton = document.getElementById('toggle-tema');
  if (!boton) return;

  const CLAVE = 'portfolio-tema';

  boton.addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro';
    const nuevo = actual === 'claro' ? 'oscuro' : 'claro';

    document.documentElement.setAttribute('data-tema', nuevo);

    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch (error) {
      // Si el navegador bloquea el almacenamiento, el tema solo dura esta visita
    }
  });
})();


/* ============================================
   5. REVELADO AL HACER SCROLL
   ============================================ */
(function scrollReveal() {
  const elementos = document.querySelectorAll('.reveal');
  if (!elementos.length) return;

  if (!('IntersectionObserver' in window)) {
    elementos.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('is-visible');
        observador.unobserve(entrada.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });

  elementos.forEach((el) => observador.observe(el));
})();


/* ============================================
   6. FILTRO DE CATEGORIAS EN PROYECTOS
   ============================================ */
(function filtroCategorias() {
  const botones = document.querySelectorAll('.filtro__btn');
  const cards = document.querySelectorAll('#rejilla-proyectos .project-card');
  const aviso = document.getElementById('sin-resultados');
  if (!botones.length || !cards.length) return;

  botones.forEach((boton) => {
    boton.addEventListener('click', () => {
      const filtro = boton.dataset.filtro;
      let visibles = 0;

      botones.forEach((b) => b.classList.remove('filtro__btn--activo'));
      boton.classList.add('filtro__btn--activo');

      cards.forEach((card) => {
        const categorias = (card.dataset.categorias || '').split(' ');
        const mostrar = filtro === 'todos' || categorias.includes(filtro);

        card.hidden = !mostrar;
        if (mostrar) {
          visibles++;
          card.classList.add('is-visible');
        }
      });

      if (aviso) aviso.hidden = visibles > 0;
    });
  });
})();


/* ============================================
   7. CONTACTO FLOTANTE
   ============================================ */
(function contactoFlotante() {
  const boton = document.getElementById('contacto-flotante-toggle');
  const menu = document.getElementById('contacto-flotante-menu');
  if (!boton || !menu) return;

  function cerrar() {
    menu.classList.remove('abierto');
    boton.setAttribute('aria-expanded', 'false');
  }

  boton.addEventListener('click', (evento) => {
    evento.stopPropagation();
    const abierto = menu.classList.toggle('abierto');
    boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  });

  document.addEventListener('click', (evento) => {
    if (!menu.contains(evento.target) && evento.target !== boton) cerrar();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') cerrar();
  });
})();
