/* ============================================
   ESCENA DE FONDO — "red de señal"
   ============================================
   Fondo Three.js real, ligado al scroll, que vive detrás del
   contenido en Home (modo narrativo: la cámara avanza capítulo
   a capítulo con las secciones reales de la página) y en
   Proyectos (modo ambiental: un campo que respira despacio
   detrás de la rejilla de tarjetas, sin competir con el filtro).

   Principios de esta implementación:
   - Cero UI propia (sin botones de "modo", sin overlay de debug).
     La única entrada del usuario es el interruptor de tema que
     ya existe en la barra de navegación (#toggle-tema).
   - Cero color hardcodeado: todo se lee en vivo de las custom
     properties reales de variables.css, así que si el día de
     mañana se retoca la paleta del sitio, la escena la sigue
     automáticamente sin tocar este fichero.
   - Se apaga solo si: WebGL no está disponible, el usuario pide
     "reducir movimiento", o la pestaña está en segundo plano.
   ============================================ */

(function () {
  'use strict';

  var envoltorio = document.getElementById('escena-fondo');
  if (!envoltorio) return; // esta página no lleva escena (build.js no la incluyó)

  var canvas = document.getElementById('escena-fondo-canvas');
  if (!canvas || !window.THREE) {
    document.documentElement.classList.add('sin-webgl');
    return;
  }

  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOVIL = window.innerWidth < 760;
  var TIPO = window.__ESCENA_TIPO__ === 'ambiental' ? 'ambiental' : 'narrativo';
  var PROYECTOS = Array.isArray(window.__ESCENA_PROYECTOS__) ? window.__ESCENA_PROYECTOS__ : [];

  // ---------- Lectura en vivo de la paleta real del sitio ----------
  function leerVar(nombre, valorPorDefecto) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nombre);
    v = v ? v.trim() : '';
    return v || valorPorDefecto;
  }

  function hexANumero(hex) {
    if (!hex) return 0xffffff;
    return parseInt(hex.replace('#', ''), 16);
  }

  function temaActual() {
    return document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro';
  }

  function leerPaleta() {
    var tema = temaActual();
    var categorias = [1, 2, 3, 4, 5, 6, 7].map(function (n) {
      return hexANumero(leerVar('--c-cat-' + n, tema === 'claro' ? '#2F4A6B' : '#88C0D0'));
    });
    return {
      tema: tema,
      fondo: hexANumero(leerVar('--c-fondo', tema === 'claro' ? '#EDE7D9' : '#242933')),
      acento: hexANumero(leerVar('--c-acento', tema === 'claro' ? '#2F4A6B' : '#88C0D0')),
      categorias: categorias
    };
  }

  var paleta = leerPaleta();

  // bloomFuerza y bloomUmbral bajados respecto a la version anterior:
  // con el fondo unificado hay mas nodos brillantes visibles a la vez
  // en pantalla, y el resplandor se acumulaba demasiado y dejaba el
  // texto blanco dificil de leer encima. Umbral mas alto = solo brilla
  // lo realmente intenso (pulsos), no cualquier nodo normal.
  var AJUSTES_TEMA = {
    oscuro: { bloomFuerza: 0.5, bloomRadio: 0.4, bloomUmbral: 0.38, multNodo: 1.4, multPulso: 2, opacidadLinea: 0.26 },
    claro: { bloomFuerza: 0.16, bloomRadio: 0.32, bloomUmbral: 0.62, multNodo: 1.1, multPulso: 1.5, opacidadLinea: 0.4 }
  };

  // ---------- Setup del renderer ----------
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  } catch (error) {
    document.documentElement.classList.add('sin-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOVIL ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(paleta.fondo, 1);
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(paleta.fondo, TIPO === 'ambiental' ? 0.028 : 0.038);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 260);
  camera.position.set(0, 0, 9);

  // ---------- Luces ----------
  var luzAmbiente = new THREE.AmbientLight(paleta.acento, 0.3);
  scene.add(luzAmbiente);
  var puntoLuz = new THREE.PointLight(paleta.acento, 1.5, 60);
  puntoLuz.position.set(0, 4, 4);
  scene.add(puntoLuz);
  var luzContorno = new THREE.PointLight(paleta.acento, 0.85, 40);
  scene.add(luzContorno);

  // ---------- Postprocesado: bloom (se omite en móvil por coste) ----------
  var usaBloom = !MOVIL && !REDUCE && !!(THREE.EffectComposer && THREE.UnrealBloomPass);
  var composer = null, passBloom = null;
  if (usaBloom) {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    var ajusteInicial = AJUSTES_TEMA[paleta.tema];
    passBloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      ajusteInicial.bloomFuerza, ajusteInicial.bloomRadio, ajusteInicial.bloomUmbral
    );
    composer.addPass(passBloom);
    var passCopia = new THREE.ShaderPass(THREE.CopyShader);
    passCopia.renderToScreen = true;
    composer.addPass(passCopia);
  }

  // ---------- Registro para re-temizar en caliente ----------
  // Cada entrada sabe si su color viene de una categoría de skills
  // (índice 0-6, sigue la paleta --c-cat-*) o del acento real de un
  // proyecto (oscuro/claro, tomado directamente de proyectos.json).
  var registroMateriales = []; // { material, catIdx? , acento? , esLinea? }

  function colorParaEntrada(entrada, p) {
    if (entrada.acento) return hexANumero(entrada.acento[p.tema] || entrada.acento.oscuro);
    var idx = (entrada.catIdx || 0) % p.categorias.length;
    return p.categorias[idx];
  }

  function registrar(material, meta) {
    registroMateriales.push(Object.assign({ material: material }, meta));
    return material;
  }

  // ---------- Construcción de la red ----------
  var grupoRed = new THREE.Group();
  scene.add(grupoRed);
  var nodosGrupo = new THREE.Group();
  var lineasGrupo = new THREE.Group();
  grupoRed.add(lineasGrupo);
  grupoRed.add(nodosGrupo);

  var geoNodo = new THREE.IcosahedronGeometry(0.06, 0);
  var puntosLinea = []; // rutas para animar pulsos: { puntos, meta }

  function trazoOrtogonal(a, b) {
    var medio = new THREE.Vector3(b.x, a.y, a.z + (b.z - a.z) * 0.5);
    return [a, medio, new THREE.Vector3(b.x, b.y, medio.z), b];
  }

  function nuevoNodo(pos, meta, escala) {
    var mat = registrar(new THREE.MeshBasicMaterial({ color: colorParaEntrada(meta, paleta) }), meta);
    var mesh = new THREE.Mesh(geoNodo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(escala || 1);
    mesh.userData.escalaBase = escala || 1;
    nodosGrupo.add(mesh);
    return mesh;
  }

  function nuevaLinea(puntos, meta, opacidad) {
    var geo = new THREE.BufferGeometry().setFromPoints(puntos);
    var mat = registrar(new THREE.LineBasicMaterial({
      color: colorParaEntrada(meta, paleta), transparent: true, opacity: opacidad
    }), Object.assign({ esLinea: true, opacidadBase: opacidad }, meta));
    var linea = new THREE.Line(geo, mat);
    lineasGrupo.add(linea);
    puntosLinea.push({ puntos: puntos, meta: meta });
  }

  // Cada "capítulo" coloca sus nodos con una composición distinta,
  // pensada para lo que se está leyendo en pantalla en ese tramo real:
  //
  //  portada      → plano general, la red completa a lo lejos.
  //  identidad    → núcleo denso y compacto (quién soy / base sólida).
  //  competencias → 7 anillos concéntricos, uno por categoría de skill real.
  //  proyectos    → un clúster por proyecto destacado, con SU color de acento real.
  //  trayectoria  → los nodos se alinean formando un eje (la red se hace línea de tiempo).
  //  contacto     → la red se abre en una apertura amplia, la cámara sale por el centro.
  var PROFUNDIDAD_TRAMO = 15;

  function construirCapituloPortada(zBase) {
    var n = MOVIL ? 16 : 26;
    var puntos = [];
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 3 + Math.random() * 4.5;
      var pos = new THREE.Vector3(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.55, zBase - Math.random() * PROFUNDIDAD_TRAMO);
      var meta = { catIdx: i % 7 };
      nuevoNodo(pos, meta, 0.6 + Math.random());
      puntos.push(pos);
    }
    for (var j = 0; j < puntos.length - 1; j++) {
      if (Math.random() < 0.55) nuevaLinea(trazoOrtogonal(puntos[j], puntos[j + 1]), { catIdx: j % 7 }, 0.22);
    }
  }

  // ---------- Constructor único: "red dispersa" ----------
  // Todos los capítulos usan la misma composición base — nodos
  // repartidos con dispersión aleatoria dentro de un anillo de
  // radios, conectados por trazos ortogonales sueltos — así el
  // fondo se lee siempre como UNA red continua a lo largo de
  // todo el scroll, sin cambiar de "forma" (nada de anillos
  // concéntricos, ejes rectos ni conos de apertura).
  function construirRedDispersa(zBase, opciones) {
    var n = MOVIL ? opciones.nMovil : opciones.nEscritorio;
    var puntos = [];
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = opciones.radioMin + Math.random() * (opciones.radioMax - opciones.radioMin);
      var pos = new THREE.Vector3(
        Math.cos(ang) * rad,
        Math.sin(ang) * rad * (opciones.achatado || 0.6),
        zBase - Math.random() * (opciones.profundidad || PROFUNDIDAD_TRAMO)
      );
      var meta = opciones.colorPara ? opciones.colorPara(i) : { catIdx: i % 7 };
      nuevoNodo(pos, meta, opciones.escalaMin + Math.random() * opciones.escalaVar);
      puntos.push({ pos: pos, meta: meta });
    }
    for (var j = 0; j < puntos.length - 1; j++) {
      if (Math.random() < (opciones.probLinea || 0.5)) {
        nuevaLinea(trazoOrtogonal(puntos[j].pos, puntos[j + 1].pos), puntos[j].meta, opciones.opacidadLinea || 0.26);
      }
    }
  }

  function construirCapituloPortada(zBase) {
    construirRedDispersa(zBase, {
      nMovil: 16, nEscritorio: 26, radioMin: 3, radioMax: 7.5,
      escalaMin: 0.6, escalaVar: 1, probLinea: 0.55, opacidadLinea: 0.22,
      colorPara: function (i) { return { catIdx: i % 7 }; }
    });
  }

  function construirCapituloIdentidad(zBase) {
    construirRedDispersa(zBase, {
      nMovil: 14, nEscritorio: 22, radioMin: 0.8, radioMax: 3, achatado: 0.7,
      profundidad: PROFUNDIDAD_TRAMO * 0.8,
      escalaMin: 0.7, escalaVar: 0.8, probLinea: 0.6, opacidadLinea: 0.3,
      colorPara: function () { return { catIdx: 0 }; }
    });
  }

  function construirCapituloProyectos(zBase) {
    var lista = PROYECTOS.length ? PROYECTOS : [{ acento: { oscuro: '#88C0D0', claro: '#2F4A6B' } }];
    var nClusters = lista.length;
    lista.forEach(function (proyecto, idx) {
      var angBase = (idx / nClusters) * Math.PI * 2;
      var cx = Math.cos(angBase) * 3.6;
      var cy = Math.sin(angBase) * 1.6;
      var cz = zBase - (idx / nClusters) * PROFUNDIDAD_TRAMO;
      var n = MOVIL ? 6 : 10;
      var puntosCluster = [];
      for (var i = 0; i < n; i++) {
        var pos = new THREE.Vector3(
          cx + (Math.random() - 0.5) * 2.2,
          cy + (Math.random() - 0.5) * 1.6,
          cz + (Math.random() - 0.5) * 3
        );
        var meta = { acento: proyecto.acento };
        nuevoNodo(pos, meta, 0.7 + Math.random() * 0.9);
        puntosCluster.push(pos);
      }
      for (var j = 0; j < puntosCluster.length - 1; j++) {
        nuevaLinea(trazoOrtogonal(puntosCluster[j], puntosCluster[j + 1]), { acento: proyecto.acento }, 0.3);
      }
    });
  }

  function construirCapituloTrayectoria(zBase) {
    construirRedDispersa(zBase, {
      nMovil: 16, nEscritorio: 24, radioMin: 1, radioMax: 4.5,
      escalaMin: 0.5, escalaVar: 0.5, probLinea: 0.5, opacidadLinea: 0.3,
      colorPara: function (i) { return { catIdx: i % 7 }; }
    });
  }

  function construirCapituloContacto(zBase) {
    construirRedDispersa(zBase, {
      nMovil: 12, nEscritorio: 18, radioMin: 3, radioMax: 8,
      escalaMin: 0.8, escalaVar: 0.7, probLinea: 0.45, opacidadLinea: 0.28,
      colorPara: function (i) { return { catIdx: i % 7 }; }
    });
  }

  function construirCapituloAmbiental(zBase, idx) {
    var lista = PROYECTOS.length ? PROYECTOS : [{ acento: { oscuro: '#88C0D0', claro: '#2F4A6B' } }];
    var proyecto = lista[idx % lista.length];
    var n = MOVIL ? 8 : 14;
    var puntos = [];
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 3 + Math.random() * 6;
      var pos = new THREE.Vector3(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.5, zBase - Math.random() * PROFUNDIDAD_TRAMO);
      var meta = Math.random() < 0.4 ? { acento: proyecto.acento } : { catIdx: (idx + i) % 7 };
      nuevoNodo(pos, meta, 0.5 + Math.random() * 0.7);
      puntos.push(pos);
    }
    for (var j = 0; j < puntos.length - 1; j++) {
      if (Math.random() < 0.4) nuevaLinea(trazoOrtogonal(puntos[j], puntos[j + 1]), { catIdx: (idx + j) % 7 }, 0.18);
    }
  }

  // "sobre mí" y "trayectoria" comparten capítulo: en el home nuevo
  // van seguidos como una sola sección larga (identidad + timeline),
  // así que usan la misma composición de red para no cortar la
  // continuidad visual del fondo entre ambas.
  var CAPITULOS_HOME = ['portada', 'identidad', 'trayectoria', 'proyectos', 'contacto'];
  var CONSTRUCTORES = {
    portada: construirCapituloPortada,
    identidad: construirCapituloIdentidad,
    proyectos: construirCapituloProyectos,
    trayectoria: construirCapituloTrayectoria,
    contacto: construirCapituloContacto
  };

  var totalCapitulos;
  if (TIPO === 'narrativo') {
    totalCapitulos = CAPITULOS_HOME.length;
    CAPITULOS_HOME.forEach(function (nombre, i) {
      CONSTRUCTORES[nombre](8 - i * PROFUNDIDAD_TRAMO);
    });
  } else {
    totalCapitulos = 3;
    for (var c = 0; c < totalCapitulos; c++) {
      construirCapituloAmbiental(6 - c * PROFUNDIDAD_TRAMO * 0.7, c);
    }
  }

  // ---------- Pulsos de datos viajando por las trazas ----------
  var geoPulso = new THREE.SphereGeometry(0.05, 8, 8);
  var pulsos = [];
  if (!REDUCE && puntosLinea.length) {
    var numPulsos = MOVIL ? 10 : 22;
    for (var p = 0; p < numPulsos; p++) {
      var ref = puntosLinea[Math.floor(Math.random() * puntosLinea.length)];
      var mat = registrar(new THREE.MeshBasicMaterial({
        color: colorParaEntrada(ref.meta, paleta), transparent: true, opacity: 0.95
      }), Object.assign({ esPulso: true }, ref.meta));
      var mesh = new THREE.Mesh(geoPulso, mat);
      scene.add(mesh);
      pulsos.push({ mesh: mesh, ref: ref, t: Math.random(), vel: 0.14 + Math.random() * 0.22 });
    }
  }

  function puntoEnCamino(puntos, t) {
    var segLong = [], total = 0, i;
    for (i = 0; i < puntos.length - 1; i++) {
      var d = puntos[i].distanceTo(puntos[i + 1]);
      segLong.push(d);
      total += d;
    }
    var objetivo = t * total;
    for (i = 0; i < segLong.length; i++) {
      if (objetivo <= segLong[i] || i === segLong.length - 1) {
        var localT = segLong[i] > 0 ? objetivo / segLong[i] : 0;
        return new THREE.Vector3().lerpVectors(puntos[i], puntos[i + 1], Math.min(localT, 1));
      }
      objetivo -= segLong[i];
    }
    return puntos[puntos.length - 1];
  }

  // ---------- Partículas ambiente ----------
  var numParticulas = MOVIL ? 160 : 380;
  var posPart = new Float32Array(numParticulas * 3);
  for (var pi = 0; pi < numParticulas; pi++) {
    posPart[pi * 3] = (Math.random() - 0.5) * 22;
    posPart[pi * 3 + 1] = (Math.random() - 0.5) * 15;
    posPart[pi * 3 + 2] = -Math.random() * totalCapitulos * PROFUNDIDAD_TRAMO;
  }
  var geoPart = new THREE.BufferGeometry();
  geoPart.setAttribute('position', new THREE.BufferAttribute(posPart, 3));
  var matPart = registrar(new THREE.PointsMaterial({ color: paleta.acento, size: 0.026, transparent: true, opacity: 0.45 }), { esAcentoBase: true });
  var particulas = new THREE.Points(geoPart, matPart);
  scene.add(particulas);

  // ---------- Recorrido de cámara ligado al scroll real de la página ----------
  var secciones = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  var totalWaypoints = Math.max(secciones.length, 1);

  function waypointCamara(i, progresoLocal) {
    var iClamp = Math.min(i, totalCapitulos - 1);
    var z = 8 - (iClamp + progresoLocal) * PROFUNDIDAD_TRAMO * (TIPO === 'narrativo' ? 0.62 : 0.4);
    var x = Math.sin((iClamp + progresoLocal) * 0.85) * (TIPO === 'narrativo' ? 1.1 : 0.5);
    var y = Math.cos((iClamp + progresoLocal) * 0.65) * (TIPO === 'narrativo' ? 0.6 : 0.3);
    return new THREE.Vector3(x, y, z);
  }

  var progresoGlobal = 0;
  var progresoSuavizado = 0;

  function actualizarProgreso() {
    var alturaDoc = document.documentElement.scrollHeight - window.innerHeight;
    var scrollT = alturaDoc > 0 ? window.scrollY / alturaDoc : 0;
    progresoGlobal = scrollT * (totalWaypoints - 1);
  }

  // ---------- Cambio de tema en caliente ----------
  function retemizar() {
    paleta = leerPaleta();
    renderer.setClearColor(paleta.fondo, 1);
    scene.fog.color.setHex(paleta.fondo);
    puntoLuz.color.setHex(paleta.acento);
    luzContorno.color.setHex(paleta.acento);
    luzAmbiente.color.setHex(paleta.acento);
    matPart.color.setHex(paleta.acento);

    var ajuste = AJUSTES_TEMA[paleta.tema];
    registroMateriales.forEach(function (entrada) {
      var color = colorParaEntrada(entrada, paleta);
      if (entrada.esLinea) {
        entrada.material.color.setHex(color);
        entrada.material.opacity = entrada.opacidadBase * (ajuste.opacidadLinea / AJUSTES_TEMA.oscuro.opacidadLinea);
      } else if (entrada.esPulso) {
        entrada.material.color.set(new THREE.Color(color).multiplyScalar(ajuste.multPulso));
      } else {
        entrada.material.color.set(new THREE.Color(color).multiplyScalar(ajuste.multNodo));
      }
    });

    if (passBloom) {
      passBloom.strength = ajuste.bloomFuerza;
      passBloom.radius = ajuste.bloomRadio;
      passBloom.threshold = ajuste.bloomUmbral;
    }
  }
  retemizar(); // aplica los multiplicadores de tema a los materiales recien creados

  var observadorTema = new MutationObserver(function (mutaciones) {
    for (var i = 0; i < mutaciones.length; i++) {
      if (mutaciones[i].attributeName === 'data-tema') { retemizar(); break; }
    }
  });
  observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

  // ---------- Bucle de render ----------
  var reloj = new THREE.Clock();
  var enPausa = document.hidden;
  var rafId = null;

  function frame() {
    rafId = requestAnimationFrame(frame);
    if (enPausa) return;

    var dt = reloj.getDelta();
    var tiempo = reloj.elapsedTime;

    actualizarProgreso();
    progresoSuavizado += (progresoGlobal - progresoSuavizado) * (REDUCE ? 1 : 0.07);

    var i = Math.floor(progresoSuavizado);
    var frac = progresoSuavizado - i;
    var destino = waypointCamara(i, frac);

    camera.position.lerp(destino, REDUCE ? 1 : 0.14);
    camera.lookAt(destino.x * 0.6, destino.y * 0.6, destino.z - 6);
    if (!REDUCE) {
      camera.position.x += Math.sin(tiempo * (TIPO === 'narrativo' ? 0.35 : 0.14)) * 0.02;
      camera.position.y += Math.cos(tiempo * (TIPO === 'narrativo' ? 0.3 : 0.11)) * 0.015;
    }

    luzContorno.position.set(camera.position.x + 2, camera.position.y + 1.5, camera.position.z + 3);

    if (!REDUCE) {
      pulsos.forEach(function (pu) {
        pu.t += dt * pu.vel;
        if (pu.t > 1) {
          pu.t = 0;
          pu.ref = puntosLinea[Math.floor(Math.random() * puntosLinea.length)];
          var ajuste = AJUSTES_TEMA[paleta.tema];
          pu.mesh.material.color.set(new THREE.Color(colorParaEntrada(pu.ref.meta, paleta)).multiplyScalar(ajuste.multPulso));
        }
        pu.mesh.position.copy(puntoEnCamino(pu.ref.puntos, pu.t));
      });

      nodosGrupo.children.forEach(function (n, idx) {
        var s = 0.85 + Math.sin(tiempo * 1.5 + idx) * 0.15;
        n.scale.setScalar(s * n.userData.escalaBase);
      });

      particulas.rotation.y += 0.0004;
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  frame();

  // ---------- Visibilidad de pestaña: pausa para ahorrar batería/GPU ----------
  document.addEventListener('visibilitychange', function () {
    enPausa = document.hidden;
    if (!enPausa) reloj.getDelta(); // evita un salto de dt al volver
  });

  // ---------- Resize ----------
  var resizePendiente = false;
  window.addEventListener('resize', function () {
    if (resizePendiente) return;
    resizePendiente = true;
    requestAnimationFrame(function () {
      resizePendiente = false;
      var w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
      if (passBloom) passBloom.setSize(w, h);
    });
  });
})();
