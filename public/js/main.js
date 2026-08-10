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
   3. BARRA: siempre visible, con fondo al hacer scroll
   ============================================ */
   (function barraScroll() {
    const barra = document.getElementById('barra');
    if (!barra) return;
  
    const ALTURA_ACTIVACION = 40;
    let pendiente = false;
  
    function actualizar() {
      barra.classList.toggle('barra--scrolled', window.scrollY > ALTURA_ACTIVACION);
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

/* ============================================
   8. CARRUSEL DE PROYECTO
   ============================================ */
   (function carruseles() {
    const todosCarruseles = document.querySelectorAll('[data-carrusel]');
    if (!todosCarruseles.length) return;
  
    todosCarruseles.forEach((carrusel) => {
      const pista = carrusel.querySelector('[data-carrusel-pista]');
      const items = Array.from(pista.children);
      const botonPrev = carrusel.querySelector('[data-carrusel-prev]');
      const botonNext = carrusel.querySelector('[data-carrusel-next]');
      const puntos = Array.from(carrusel.querySelectorAll('[data-carrusel-puntos] button'));
      let indice = 0;
  
      function irA(nuevoIndice) {
        indice = (nuevoIndice + items.length) % items.length;
        pista.style.transform = `translateX(-${indice * 100}%)`;
        puntos.forEach((punto, i) => punto.classList.toggle('carrusel__punto--activo', i === indice));
      }
  
      botonPrev.addEventListener('click', () => irA(indice - 1));
      botonNext.addEventListener('click', () => irA(indice + 1));
      puntos.forEach((punto, i) => punto.addEventListener('click', () => irA(i)));
  
      // Deslizar con el dedo en movil
      let xInicio = null;
      pista.addEventListener('touchstart', (evento) => {
        xInicio = evento.touches[0].clientX;
      }, { passive: true });
  
      pista.addEventListener('touchend', (evento) => {
        if (xInicio === null) return;
        const diferencia = xInicio - evento.changedTouches[0].clientX;
        if (Math.abs(diferencia) > 40) irA(diferencia > 0 ? indice + 1 : indice - 1);
        xInicio = null;
      });
  
      // Flechas del teclado cuando el carrusel tiene el foco
      carrusel.addEventListener('keydown', (evento) => {
        if (evento.key === 'ArrowLeft') irA(indice - 1);
        if (evento.key === 'ArrowRight') irA(indice + 1);
      });
    });
  })();


  /* ============================================
   9. DIAGRAMA AMPLIABLE
   ============================================ */
(function diagramas() {
  const disparadores = document.querySelectorAll('[data-diagrama-abrir]');
  if (!disparadores.length) return;

  disparadores.forEach((disparador) => {
    const seccion = disparador.closest('.seccion-diagrama');
    const overlay = seccion ? seccion.querySelector('[data-diagrama-overlay]') : null;
    if (!overlay) return;

    // Se mueve al final del <body> para que "position: fixed" cubra
    // toda la pantalla, sin que el transform de .reveal lo encajone.
    document.body.appendChild(overlay);

    const botonCerrar = overlay.querySelector('[data-diagrama-cerrar]');

    function abrir() {
      overlay.classList.add('diagrama__overlay--visible');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      botonCerrar.focus();
    }

    function cerrar() {
      overlay.classList.remove('diagrama__overlay--visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      disparador.focus();
    }

    disparador.addEventListener('click', abrir);
    botonCerrar.addEventListener('click', cerrar);

    overlay.addEventListener('click', (evento) => {
      if (evento.target === overlay) cerrar();
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && overlay.classList.contains('diagrama__overlay--visible')) cerrar();
    });
  });
})();


/* ============================================
   10. HERO: IMAN EN EL NOMBRE + FOCO QUE SIGUE EL CURSOR
   Se desactiva por completo si el usuario prefiere menos movimiento.
   La foto del avatar no se mueve, solo el foco de fondo y las letras.
   ============================================ */
(function heroInteractivo() {
  const hero = document.getElementById('hero');
  const nombre = document.getElementById('hero-nombre');
  const spotlight = document.getElementById('hero-spotlight');
  if (!hero || !nombre || !spotlight) return;

  const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefiereMenosMovimiento) return;

  // Separa "Alejandro" en letras sueltas para poder moverlas una a una
  const texto = nombre.textContent;
  nombre.innerHTML = texto
    .split('')
    .map((letra) => `<span class="hero__letra">${letra}</span>`)
    .join('');
  const letras = Array.from(nombre.querySelectorAll('.hero__letra'));

  const RADIO_IMAN = 70; // px: distancia a la que una letra empieza a moverse
  const FUERZA_IMAN = 14; // px: cuanto se desplaza como maximo
  const offsetSpotlightX = spotlight.offsetWidth / 2;
  const offsetSpotlightY = spotlight.offsetHeight / 2;

  function mover(evento) {
    const rect = hero.getBoundingClientRect();
    const x = evento.clientX - rect.left;
    const y = evento.clientY - rect.top;

    spotlight.style.transform = `translate(${x - offsetSpotlightX}px, ${y - offsetSpotlightY}px)`;

    letras.forEach((letra) => {
      const r = letra.getBoundingClientRect();
      const lx = r.left + r.width / 2 - rect.left;
      const ly = r.top + r.height / 2 - rect.top;
      const dx = x - lx;
      const dy = y - ly;
      const distancia = Math.sqrt(dx * dx + dy * dy);

      if (distancia < RADIO_IMAN) {
        const fuerza = (1 - distancia / RADIO_IMAN) * FUERZA_IMAN;
        letra.style.transform = `translate(${(-dx / distancia) * fuerza || 0}px, ${(-dy / distancia) * fuerza || 0}px)`;
      } else {
        letra.style.transform = 'translate(0, 0)';
      }
    });
  }

  hero.addEventListener('mouseenter', () => hero.classList.add('hero--spotlight-activo'));
  hero.addEventListener('mousemove', mover);
  hero.addEventListener('mouseleave', () => {
    hero.classList.remove('hero--spotlight-activo');
    letras.forEach((letra) => {
      letra.style.transform = 'translate(0, 0)';
    });
  });
})();