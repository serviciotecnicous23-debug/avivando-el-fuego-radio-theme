/* ============================================================================
   AVIVANDO EL FUEGO — Tema AzuraCast (público)  ·  v6
   Reconstrucción limpia y profesional.

   Qué hace (en orden):
     1. Inyecta el HERO con logo de FUEGO 3D en WebGL (no es una imagen).
     2. Visualizador audio-reactivo (Web Audio API) con respaldo sintético seguro.
     3. Modal "ahora sonando" y modal "instalar app" (PWA).
     4. Media Session API → controles en pantalla de bloqueo + audio de fondo.
     5. Pausa TODO el render cuando la pestaña está oculta  → arregla la lentitud
        en segundo plano. Respeta prefers-reduced-motion.

   Va pegado en: AzuraCast Admin → Branding → "Custom JS for Public Pages".
   ========================================================================== */
(function () {
  'use strict';
  if (window.__afThemeV6) return;
  window.__afThemeV6 = true;

  /* ---- Configuración / identidad ---------------------------------------- */
  var CFG = {
    ministryUrl: 'https://ministerioavivandoelfuego.com/',
    appUrl: 'https://ministerioavivandoelfuego.com/radio',
    station: 'Avivando el Fuego Radio',
    tagline: 'Radio cristiana · Adoración y fuego 24/7'
  };

  /* Capturamos el prompt de instalación PWA lo antes posible. */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__afInstallPrompt = e;
    var b = document.getElementById('af-install-btn');
    if (b) b.classList.add('ready');
  });

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================================================================
     1. MOTOR DE FUEGO  ·  WebGL fragment shader
     Una llama calculada en la GPU. Muy liviana: un solo quad a pantalla,
     ruido fbm que fluye hacia arriba, coloreado con rampa de fuego.
     Se pausa cuando la pestaña se oculta y respeta reduce-motion.
     ====================================================================== */
  var Fire = (function () {
    var canvas, gl, prog, buf, raf = 0, start = 0, running = false;
    var uRes, uTime, uIntensity, aPos;
    var intensity = 0.45;       // nivel base (sube con el audio)
    var targetIntensity = 0.45;

    var VERT =
      'attribute vec2 p;varying vec2 vUv;' +
      'void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

    var FRAG = [
      'precision highp float;',
      'varying vec2 vUv;',
      'uniform vec2 uRes;',
      'uniform float uTime;',
      'uniform float uIntensity;',
      // hash + value noise + fbm
      'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
      ' float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));',
      ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
      'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+1.7;a*=0.5;}return v;}',
      'void main(){',
      ' vec2 uv=vUv;',
      ' float t=uTime*0.45;',
      ' vec2 p=vec2(uv.x-0.5, uv.y);',
      ' float h=clamp(uv.y,0.0,1.0);',
      // turbulencia que asciende (convección) + lenguas rápidas en la punta
      ' float n=fbm(vec2(p.x*3.2, p.y*2.8 - t*2.4));',
      ' float licks=fbm(vec2(p.x*6.0+5.0, p.y*5.0 - t*3.6));',
      // balanceo sutil que crece con la altura
      ' float sway=(n-0.5)*0.20*(0.12+h*1.0);',
      ' float ax=abs(p.x - sway);',
      // perfil de lagrima: senoidal (cierra en base y punta) + base redondeada anclada
      ' float prof=sin(pow(h,0.72)*3.14159);',
      ' float width=0.30*prof + 0.085*(1.0-smoothstep(0.0,0.22,h));',
      ' float body=smoothstep(width,width*0.15,ax);',
      ' float inten=0.6+uIntensity*0.8;',
      // brillo del cuerpo + lenguas; al cerrar el perfil arriba no deja hilo
      ' float flame=clamp((body*(0.85-h*0.5)+licks*body*0.5)*inten*1.9,0.0,1.0);',
      // rampa de color de fuego: rojo → naranja → ámbar → oro → blanco
      ' vec3 col=vec3(0.02,0.0,0.02);',
      ' col=mix(col,vec3(0.80,0.07,0.0),smoothstep(0.0,0.30,flame));',
      ' col=mix(col,vec3(1.0,0.27,0.0),smoothstep(0.18,0.50,flame));',
      ' col=mix(col,vec3(1.0,0.53,0.0),smoothstep(0.40,0.68,flame));',
      ' col=mix(col,vec3(1.0,0.84,0.25),smoothstep(0.62,0.85,flame));',
      ' col=mix(col,vec3(1.0,0.98,0.85),smoothstep(0.82,1.0,flame));',
      // halo suave + chispas
      ' float spark=step(0.985,hash(floor(vec2(p.x*40.0,(p.y-t*1.5)*40.0))))*flame;',
      ' col+=spark*vec3(1.0,0.8,0.4)*0.6;',
      ' float alpha=clamp(flame*1.25,0.0,1.0);',
      ' gl_FragColor=vec4(col,alpha);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[af-fire] shader:', gl.getShaderInfoLog(s)); return null;
      }
      return s;
    }

    function init(mount) {
      canvas = document.createElement('canvas');
      canvas.id = 'af-fire-canvas';
      mount.appendChild(canvas);
      gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: true });
      if (!gl) return false;
      var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      aPos = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'uRes');
      uTime = gl.getUniformLocation(prog, 'uTime');
      uIntensity = gl.getUniformLocation(prog, 'uIntensity');
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      resize();
      window.addEventListener('resize', resize, { passive: true });
      return true;
    }

    function resize() {
      if (!canvas) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth || 320, h = canvas.clientHeight || 360;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function frame(now) {
      if (!running) return;
      if (!start) start = now;
      intensity += (targetIntensity - intensity) * 0.08;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uIntensity, intensity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (running || !gl) return;
      running = true; raf = requestAnimationFrame(frame);
    }
    function pause() {
      running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    }
    function renderStill() {           // un fotograma fijo para reduce-motion
      if (!gl) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, 12.0);
      gl.uniform1f(uIntensity, 0.5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function setIntensity(v) { targetIntensity = 0.30 + Math.max(0, Math.min(1, v)) * 0.9; }

    return {
      mount: function (el) {
        if (!init(el)) { el.classList.add('af-fire-fallback'); return false; }
        if (reduceMotion) { renderStill(); } else { play(); }
        return true;
      },
      play: function () { if (!reduceMotion) play(); },
      pause: pause,
      setIntensity: setIntensity,
      ok: function () { return !!gl; }
    };
  })();

  /* ======================================================================
     2. VISUALIZADOR audio-reactivo (con respaldo sintético seguro)
     Nunca interrumpe el audio: si el AnalyserNode no se puede usar (CORS,
     elemento ya tomado, etc.) cae a un movimiento sintético suave.
     ====================================================================== */
  var Viz = (function () {
    var BARS = 28, bars = [], wrap, raf = 0, running = false;
    var analyser = null, data = null, ctx = null, synthT = 0;

    function build(mount) {
      wrap = document.createElement('div');
      wrap.id = 'af-viz';
      for (var i = 0; i < BARS; i++) {
        var b = document.createElement('span');
        b.className = 'af-viz-bar';
        wrap.appendChild(b); bars.push(b);
      }
      mount.appendChild(wrap);
    }

    function tryAudio() {
      if (analyser) return true;
      var audio = document.querySelector('audio');
      if (!audio) return false;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = ctx || new AC();
        var src = audio.__afSrc || ctx.createMediaElementSource(audio);
        audio.__afSrc = src;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        src.connect(ctx.destination);   // garantiza que el audio sigue sonando
        src.connect(analyser);          // rama de análisis (no afecta la salida)
        data = new Uint8Array(analyser.frequencyBinCount);
        return true;
      } catch (e) { analyser = null; return false; }
    }

    function tick() {
      if (!running) return;
      var sum = 0;
      if (analyser) {
        analyser.getByteFrequencyData(data);
        for (var i = 0; i < BARS; i++) {
          var v = (data[i % data.length] || 0) / 255;
          bars[i].style.transform = 'scaleY(' + (0.12 + v * 0.95).toFixed(3) + ')';
          sum += v;
        }
        if (sum < 0.02) { analyser = null; }   // datos vacíos (CORS) → sintético
      } else {
        synthT += 0.06;
        for (var j = 0; j < BARS; j++) {
          var s = 0.45 + 0.4 * Math.sin(synthT + j * 0.5) * Math.sin(synthT * 0.7 + j);
          s = 0.15 + Math.abs(s) * 0.85;
          bars[j].style.transform = 'scaleY(' + s.toFixed(3) + ')';
          sum += s;
        }
      }
      Fire.setIntensity(sum / BARS);
      raf = requestAnimationFrame(tick);
    }

    return {
      mount: function (el) { build(el); },
      play: function () { if (running) return; running = true; tryAudio(); raf = requestAnimationFrame(tick); },
      pause: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
      hookPlay: function () { tryAudio(); }
    };
  })();

  /* ======================================================================
     3. DOM:  hero + visualizador + modales + botón instalar
     ====================================================================== */
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  var HERO_HTML =
    '<header id="af-hero">' +
      '<div id="af-fire-stage"><div id="af-fire-mount"></div></div>' +
      '<div id="af-hero-body">' +
        '<span id="af-live"><i></i>EN VIVO · 24/7</span>' +
        '<h1 id="af-title"><span>AVIVANDO</span><strong>EL&nbsp;FUEGO</strong></h1>' +
        '<p id="af-tagline">' + CFG.tagline + '</p>' +
        '<div id="af-viz-mount"></div>' +
        '<div id="af-hero-actions">' +
          '<a id="af-cta-ministry" href="' + CFG.ministryUrl + '" target="_blank" rel="noopener">Sitio del Ministerio</a>' +
          '<button id="af-cta-install" type="button">Instalar app</button>' +
        '</div>' +
      '</div>' +
    '</header>';

  var MODAL_NP =
    '<div id="af-np" class="af-overlay"><div class="af-sheet"><button class="af-x" data-close="af-np">&times;</button>' +
      '<span class="af-np-live"><i></i>EN VIVO</span>' +
      '<img id="af-np-art" alt=""/><h3 id="af-np-title">—</h3><p id="af-np-artist"></p>' +
      '<div id="af-np-grid">' +
        '<div><span>Estación</span><b>' + CFG.station + '</b></div>' +
        '<div><span>Señal</span><b class="af-on">Transmitiendo 24/7</b></div>' +
      '</div>' +
    '</div></div>';

  var MODAL_INSTALL =
    '<div id="af-inst" class="af-overlay"><div class="af-sheet af-sheet-left"><button class="af-x" data-close="af-inst">&times;</button>' +
      '<h3>Llévate la radio como app</h3><p class="af-muted">Sin tienda, sin descargas pesadas. Queda como una app más en tu pantalla.</p>' +
      '<div id="af-tabs"><button class="af-tab" data-tab="ios">iPhone</button><button class="af-tab" data-tab="android">Android</button><button class="af-tab" data-tab="desktop">PC</button></div>' +
      '<div class="af-pane" data-pane="ios"><ol><li>Abre esta página en <strong>Safari</strong>.</li><li>Toca <strong>Compartir</strong> (cuadro con flecha ↑).</li><li>Elige <strong>Añadir a pantalla de inicio</strong>.</li><li>Toca <strong>Añadir</strong>.</li></ol></div>' +
      '<div class="af-pane" data-pane="android"><ol><li>Abre esta página en <strong>Chrome</strong>.</li><li>Menú <strong>⋮</strong> arriba a la derecha.</li><li><strong>Instalar app</strong> / Añadir a pantalla principal.</li><li>Confirma con <strong>Instalar</strong>.</li></ol></div>' +
      '<div class="af-pane" data-pane="desktop"><ol><li>Mira la <strong>barra de direcciones</strong>.</li><li>Icono <strong>Instalar</strong> (monitor con flecha).</li><li>O menú <strong>⋮ → Instalar</strong>.</li><li>Confirma.</li></ol></div>' +
    '</div></div>';

  var INSTALL_FAB =
    '<button id="af-install-btn" type="button" aria-label="Instalar app">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M5 20h14"/></svg>' +
      '<span>Instalar app</span>' +
    '</button>';

  function detectPlatform() {
    var u = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(u)) return 'ios';
    if (/Android/i.test(u)) return 'android';
    return 'desktop';
  }

  function inject() {
    if (document.getElementById('af-hero')) return;
    var target = document.querySelector('main') ||
      document.querySelector('.public-page') || document.body;
    target.insertAdjacentElement('afterbegin', el(HERO_HTML));
    document.body.appendChild(el(MODAL_NP));
    document.body.appendChild(el(MODAL_INSTALL));
    document.body.appendChild(el(INSTALL_FAB));

    Fire.mount(document.getElementById('af-fire-mount'));
    Viz.mount(document.getElementById('af-viz-mount'));
    if (!reduceMotion) Viz.play();

    // pestaña activa por defecto en el modal de instalación
    var p = detectPlatform();
    var dt = document.querySelector('.af-tab[data-tab="' + p + '"]');
    var dp = document.querySelector('.af-pane[data-pane="' + p + '"]');
    if (dt) dt.classList.add('active');
    if (dp) dp.classList.add('active');

    bind();
    setupMediaSession();
  }

  /* ======================================================================
     4. Ahora sonando: leemos el DOM nativo de AzuraCast
     ====================================================================== */
  function readNP() {
    function txt(s) { var n = document.querySelector(s); return n ? (n.innerText || '').trim() : ''; }
    var img = document.querySelector('img.album_art');
    var pb = document.querySelector('.progress-bar');
    var prog = 0;
    if (pb && pb.style.width) { var m = pb.style.width.match(/([0-9.]+)%/); if (m) prog = parseFloat(m[1]); }
    return {
      title: txt('.now-playing-title'),
      artist: txt('.now-playing-artist'),
      art: img ? img.src : '',
      time: txt('.time-display-played'),
      dur: txt('.time-display-total'),
      progress: prog
    };
  }

  function fillNP() {
    var d = readNP();
    document.getElementById('af-np-art').src = d.art || '';
    document.getElementById('af-np-title').textContent = d.title || '—';
    document.getElementById('af-np-artist').textContent = d.artist || '';
  }

  /* ======================================================================
     5. Media Session API → controles de bloqueo / audio de fondo
     ====================================================================== */
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var last = '';
    setInterval(function () {
      var d = readNP();
      var key = d.title + '|' + d.artist;
      if (!d.title || key === last) return;
      last = key;
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: d.title, artist: d.artist || CFG.station, album: CFG.station,
          artwork: d.art ? [{ src: d.art, sizes: '512x512', type: 'image/jpeg' }] : []
        });
      } catch (e) {}
    }, 4000);
  }

  /* ======================================================================
     6. Eventos
     ====================================================================== */
  function openOverlay(id) {
    var o = document.getElementById(id); if (!o) return;
    if (id === 'af-np') { fillNP(); if (window.__afNPT) clearInterval(window.__afNPT); window.__afNPT = setInterval(fillNP, 1000); }
    o.classList.add('show'); document.body.style.overflow = 'hidden';
  }
  function closeOverlay(id) {
    var o = document.getElementById(id); if (!o) return;
    o.classList.remove('show'); document.body.style.overflow = '';
    if (id === 'af-np' && window.__afNPT) { clearInterval(window.__afNPT); window.__afNPT = null; }
  }
  function openInstall() {
    if (window.__afInstallPrompt) {
      window.__afInstallPrompt.prompt();
      window.__afInstallPrompt.userChoice.then(function () { window.__afInstallPrompt = null; });
    }
    openOverlay('af-inst');
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var art = e.target.closest && e.target.closest('a.album-art');
      if (art) { e.preventDefault(); openOverlay('af-np'); return; }
      if (e.target.closest && (e.target.closest('#af-install-btn') || e.target.closest('#af-cta-install'))) {
        e.preventDefault(); openInstall(); return;
      }
      var c = e.target.getAttribute && e.target.getAttribute('data-close');
      if (c) { closeOverlay(c); return; }
      if (e.target.classList && e.target.classList.contains('af-overlay')) {
        closeOverlay(e.target.id); return;
      }
      var tab = e.target.getAttribute && e.target.getAttribute('data-tab');
      if (tab) {
        document.querySelectorAll('.af-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.af-pane').forEach(function (p) { p.classList.remove('active'); });
        e.target.classList.add('active');
        var pn = document.querySelector('.af-pane[data-pane="' + tab + '"]');
        if (pn) pn.classList.add('active');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeOverlay('af-np'); closeOverlay('af-inst'); }
    });

    // Cuando empieza la reproducción, enganchamos el analizador de audio.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button')) setTimeout(function () { Viz.hookPlay(); }, 400);
    }, true);
  }

  /* ======================================================================
     7. Rendimiento: pausar TODO cuando la pestaña está oculta
        (esto es lo que evita que el teléfono se ralentice en segundo plano)
     ====================================================================== */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { Fire.pause(); Viz.pause(); }
    else { Fire.play(); if (!reduceMotion) Viz.play(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
