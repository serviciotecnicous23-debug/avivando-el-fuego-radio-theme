/* ============================================================================
   AVIVANDO EL FUEGO — Tema AzuraCast (público) · v13
   LA MISMA PÁGINA del v8 (fondo morado, visualizador, botones, reproductor,
   modales) — solo cambian LAS LETRAS del logo: en lugar de la geometría 3D
   de Three.js, tipografía monumental (Anton) pintada en FUEGO por un shader
   (la técnica nueva). Las letras arden solas con un soplo que las recorre,
   y si pasas la mano/dedo, arden más donde tocas.
     · Más liviano que v8 (sin Three.js) y más nítido.
     · Audio intocable · Media Session · FPS limitado · pausa en oculto.
   Va en: AzuraCast Admin → Branding → "Custom JS for Public Pages".
   ========================================================================== */
(function () {
  'use strict';
  if (window.__afThemeV13) return;
  window.__afThemeV13 = true;

  var CFG = {
    ministryUrl: 'https://ministerioavivandoelfuego.com/',
    station: 'Avivando el Fuego Radio',
    tagline: 'Radio cristiana · Adoración y fuego 24/7',
    word1: 'AVIVANDO', word2: 'EL FUEGO',
    fontHref: 'https://fonts.googleapis.com/css2?family=Anton&display=swap'
  };

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); window.__afInstallPrompt = e;
    var b = document.getElementById('af-install-btn'); if (b) b.classList.add('ready');
  });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || /[?&]afmobile=1/.test(location.search);
  var FORCE = /[?&]afforce=1/.test(location.search);   // solo dev

  (function () { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CFG.fontHref; document.head.appendChild(l); })();

  /* ======================================================================
     LAS LETRAS · tipografía en fuego (shader; la palabra es la máscara)
     ====================================================================== */
  var FireText = (function () {
    var canvas, gl, prog, tex, raf = 0, running = false, born = 0, lastDraw = 0;
    var uTime, uTrail, uAspect, uBoost;
    var stage, trail = [], lastMove = 0, boost = 0.75, boostT = 0.75;
    var N = 12, flat = new Float32Array(N * 3);
    var frameMin = 1000 / (isMobile ? 20 : 30);
    var TEXW = 1408, TEXH = 704;

    var VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';
    var FRAG = [
      'precision highp float;',
      'varying vec2 vUv;',
      'uniform sampler2D uMask;',
      'uniform float uTime;',
      'uniform float uAspect;',
      'uniform float uBoost;',
      'uniform vec3 uTrail[' + N + '];',
      'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
      ' float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));',
      ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
      'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+1.7;a*=0.5;}return v;}',
      'float M(vec2 uv){return texture2D(uMask,vec2(uv.x,1.0-uv.y)).a;}',
      'void main(){',
      ' vec2 uv=vUv;',
      ' float t=uTime;',
      ' float m=M(uv);',
      // rastro de calor (cursor/dedo) — suma de gaussianas con decaimiento
      ' float th=0.0;',
      ' for(int i=0;i<' + N + ';i++){vec3 p=uTrail[i];vec2 d=(uv-p.xy)*vec2(uAspect,1.0);th+=p.z*exp(-dot(d,d)*120.0);}',
      ' th=clamp(th,0.0,1.6)*uBoost;',
      // turbulencia ascendente
      ' float n=fbm(vec2(uv.x*6.0, uv.y*3.0 - t*1.1));',
      ' float n2=fbm(vec2(uv.x*12.0+7.0, uv.y*6.0 - t*1.9));',
      // las letras arden solas (brasa viva) y más donde pasa la mano
      ' float smolder=m*(0.44+0.18*n2+0.07*sin(t*1.3+uv.x*9.0));',
      ' float ign=m*th*(0.95+0.6*n);',
      // llamas: la máscara muestreada desde abajo asciende con el calor
      ' float up=(0.06+th*0.16)*n + 0.02*n2;',
      ' float lick=M(uv+vec2((n-0.5)*0.05,-up));',
      ' float lick2=M(uv+vec2((n2-0.5)*0.09,-up*1.9));',
      ' float fl=(lick*0.85+lick2*0.38)*n*(0.30+th*1.1);',
      ' float cloud=th*0.20*n;',
      ' float heat=clamp(smolder+ign+fl+cloud,0.0,1.55);',
      // rampa para fondo morado: granate → rojo → naranja → oro → blanco
      ' vec3 col=vec3(0.0);',
      ' col=mix(col,vec3(0.30,0.02,0.02),smoothstep(0.03,0.19,heat));',
      ' col=mix(col,vec3(0.82,0.11,0.01),smoothstep(0.16,0.42,heat));',
      ' col=mix(col,vec3(1.0,0.36,0.02),smoothstep(0.38,0.66,heat));',
      ' col=mix(col,vec3(1.0,0.71,0.16),smoothstep(0.62,0.94,heat));',
      ' col=mix(col,vec3(1.0,0.97,0.83),smoothstep(0.94,1.30,heat));',
      // chispas ascendentes
      ' float sp=step(0.9955,hash(floor(vec2(uv.x*130.0,(uv.y - t*0.5)*80.0))))*smoothstep(0.10,0.5,heat);',
      ' col+=sp*vec3(1.0,0.8,0.42)*0.9;',
      ' float alpha=clamp(heat*1.6+sp,0.0,1.0);',
      ' gl_FragColor=vec4(col,alpha);',
      '}'
    ].join('\n');

    function drawMask() {
      var c = document.createElement('canvas'); c.width = TEXW; c.height = TEXH;
      var x = c.getContext('2d'); x.clearRect(0, 0, TEXW, TEXH);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      function fit(text, maxW, startFs) {
        var fs = startFs; x.font = fs + 'px Anton, "Arial Black", sans-serif';
        while (x.measureText(text).width > maxW && fs > 30) { fs -= 6; x.font = fs + 'px Anton, "Arial Black", sans-serif'; }
        return fs;
      }
      var f1 = fit(CFG.word1, TEXW * 0.97, 340);
      x.fillText(CFG.word1, TEXW / 2, f1 * 0.98);
      var f2 = fit(CFG.word2, TEXW * 0.60, 260);
      x.fillText(CFG.word2, TEXW / 2, f1 * 1.02 + f2 * 0.98);
      return c;
    }
    function compile(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[af13]', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function init(mount) {
      stage = mount;
      canvas = document.createElement('canvas'); canvas.id = 'af-firetext-canvas';
      mount.appendChild(canvas);
      gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
      if (!gl) return false;
      var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      uTime = gl.getUniformLocation(prog, 'uTime');
      uTrail = gl.getUniformLocation(prog, 'uTrail');
      uAspect = gl.getUniformLocation(prog, 'uAspect');
      uBoost = gl.getUniformLocation(prog, 'uBoost');
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawMask());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(prog, 'uMask'), 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      resize(); window.addEventListener('resize', resize, { passive: true });
      // si Anton llega después, redibujamos la máscara con la fuente buena
      if (document.fonts && document.fonts.addEventListener) {
        document.fonts.addEventListener('loadingdone', function () {
          if (gl && tex) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawMask()); }
        });
      }
      function feed(cx, cy) {
        var r = stage.getBoundingClientRect();
        var x = (cx - r.left) / r.width, y = 1 - (cy - r.top) / r.height;
        if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) return;
        trail.unshift({ x: x, y: y, s: 1.0 });
        if (trail.length > N) trail.length = N;
        lastMove = performance.now();
      }
      window.addEventListener('pointermove', function (e) { feed(e.clientX, e.clientY); }, { passive: true });
      window.addEventListener('touchmove', function (e) { var t0 = e.touches[0]; if (t0) feed(t0.clientX, t0.clientY); }, { passive: true });
      return true;
    }
    function resize() {
      if (!canvas) return;
      var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75);
      var w = canvas.clientWidth || 700, h = canvas.clientHeight || 350;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uAspect) { gl.useProgram(prog); gl.uniform1f(uAspect, w / h); }
    }
    function frame(now) {
      if (!running) return;
      if (FORCE) raf = setTimeout(function () { frame(performance.now()); }, 50);
      else raf = requestAnimationFrame(frame);
      if (!FORCE && now - lastDraw < frameMin) return;
      lastDraw = now;
      if (!born) born = now;
      var t = (now - born) / 1000;
      boost += (boostT - boost) * 0.06;
      // soplo fantasma: el fuego respira solo si nadie toca (y en móvil)
      if (now - lastMove > 2200) {
        trail.unshift({ x: 0.5 + 0.38 * Math.sin(t * 0.5), y: 0.62 + 0.18 * Math.sin(t * 0.33 + 1.7), s: 0.6 });
        if (trail.length > N) trail.length = N;
      }
      for (var i = 0; i < N; i++) {
        var p = trail[i];
        if (p) { p.s *= 0.945; flat[i * 3] = p.x; flat[i * 3 + 1] = p.y; flat[i * 3 + 2] = p.s; }
        else { flat[i * 3 + 2] = 0; }
      }
      gl.uniform1f(uTime, t);
      gl.uniform1f(uBoost, boost);
      gl.uniform3fv(uTrail, flat);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function play() { if (running || !gl) return; running = true; lastDraw = 0; if (FORCE) raf = setTimeout(function () { frame(performance.now()); }, 30); else raf = requestAnimationFrame(frame); }
    function pause() { if (FORCE) return; running = false; if (raf) { cancelAnimationFrame(raf); clearTimeout(raf); } raf = 0; }
    function still() { if (!gl) return; gl.uniform1f(uTime, 6.0); gl.uniform1f(uBoost, 0.9); flat[0] = 0.5; flat[1] = 0.6; flat[2] = 0.9; gl.uniform3fv(uTrail, flat); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    return {
      mount: function (el) {
        var ok = false;
        var go = function () { if (ok) return; ok = true; if (!init(el)) { el.classList.add('af-firetext-fallback'); el.innerHTML = '<span>' + CFG.word1 + '</span><span>' + CFG.word2 + '</span>'; return; } if (reduceMotion) still(); else play(); };
        if (document.fonts && document.fonts.load) {
          document.fonts.load('400 200px Anton').then(go, go);
          setTimeout(go, 2500);
        } else go();
      },
      play: function () { if (!reduceMotion) play(); },
      pause: pause,
      setIntensity: function (v) { boostT = 0.55 + Math.max(0, Math.min(1, v)) * 0.75; }
    };
  })();

  /* ======================================================================
     VISUALIZADOR sintético (jamás toca el audio) — igual que v8
     ====================================================================== */
  var Viz = (function () {
    var BARS = 28, bars = [], wrap, raf = 0, running = false, synthT = 0;
    function build(mount) { wrap = document.createElement('div'); wrap.id = 'af-viz'; for (var i = 0; i < BARS; i++) { var b = document.createElement('span'); b.className = 'af-viz-bar'; wrap.appendChild(b); bars.push(b); } mount.appendChild(wrap); }
    function tick() {
      if (!running) return; var sum = 0;
      synthT += 0.06;
      for (var i = 0; i < BARS; i++) { var s = 0.45 + 0.4 * Math.sin(synthT + i * 0.5) * Math.sin(synthT * 0.7 + i); s = 0.15 + Math.abs(s) * 0.85; bars[i].style.transform = 'scaleY(' + s.toFixed(3) + ')'; sum += s; }
      FireText.setIntensity(sum / BARS);
      if (FORCE) raf = setTimeout(tick, 90); else raf = requestAnimationFrame(tick);
    }
    return { mount: function (el) { build(el); }, play: function () { if (running) return; running = true; tick(); }, pause: function () { if (FORCE) return; running = false; if (raf) { cancelAnimationFrame(raf); clearTimeout(raf); } raf = 0; } };
  })();

  /* ======================================================================
     DOM — idéntico al v8 (la página que te gusta)
     ====================================================================== */
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  var HERO_HTML =
    '<header id="af-hero">' +
      '<span id="af-live"><i></i>EN VIVO · 24/7</span>' +
      '<div id="af-firetext"></div>' +
      '<p id="af-tagline">' + CFG.tagline + '</p>' +
      '<div id="af-viz-mount"></div>' +
      '<div id="af-hero-actions">' +
        '<a id="af-cta-ministry" href="' + CFG.ministryUrl + '" target="_blank" rel="noopener">Sitio del Ministerio</a>' +
        '<button id="af-cta-install" type="button">Instalar app</button>' +
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
      '<span>Instalar app</span></button>';

  function detectPlatform() { var u = navigator.userAgent; if (/iPhone|iPad|iPod/i.test(u)) return 'ios'; if (/Android/i.test(u)) return 'android'; return 'desktop'; }

  function inject() {
    if (document.getElementById('af-hero')) return;
    var target = document.querySelector('main') || document.querySelector('.public-page') || document.body;
    target.insertAdjacentElement('afterbegin', el(HERO_HTML));
    document.body.appendChild(el(MODAL_NP)); document.body.appendChild(el(MODAL_INSTALL)); document.body.appendChild(el(INSTALL_FAB));
    FireText.mount(document.getElementById('af-firetext'));
    Viz.mount(document.getElementById('af-viz-mount')); if (!reduceMotion) Viz.play();
    var p = detectPlatform();
    var dt = document.querySelector('.af-tab[data-tab="' + p + '"]'); var dp = document.querySelector('.af-pane[data-pane="' + p + '"]');
    if (dt) dt.classList.add('active'); if (dp) dp.classList.add('active');
    bind(); setupMediaSession();
  }

  function readNP() { function txt(s) { var n = document.querySelector(s); return n ? (n.innerText || '').trim() : ''; } var img = document.querySelector('img.album_art'); return { title: txt('.now-playing-title'), artist: txt('.now-playing-artist'), art: img ? img.src : '' }; }
  function fillNP() { var d = readNP(); document.getElementById('af-np-art').src = d.art || ''; document.getElementById('af-np-title').textContent = d.title || '—'; document.getElementById('af-np-artist').textContent = d.artist || ''; }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return; var last = '';
    setInterval(function () { var d = readNP(); var key = d.title + '|' + d.artist; if (!d.title || key === last) return; last = key;
      try { navigator.mediaSession.metadata = new window.MediaMetadata({ title: d.title, artist: d.artist || CFG.station, album: CFG.station, artwork: d.art ? [{ src: d.art, sizes: '512x512', type: 'image/jpeg' }] : [] }); } catch (e) {} }, 4000);
  }

  function openOverlay(id) { var o = document.getElementById(id); if (!o) return; if (id === 'af-np') { fillNP(); if (window.__afNPT) clearInterval(window.__afNPT); window.__afNPT = setInterval(fillNP, 1500); } o.classList.add('show'); document.body.style.overflow = 'hidden'; }
  function closeOverlay(id) { var o = document.getElementById(id); if (!o) return; o.classList.remove('show'); document.body.style.overflow = ''; if (id === 'af-np' && window.__afNPT) { clearInterval(window.__afNPT); window.__afNPT = null; } }
  function openInstall() { if (window.__afInstallPrompt) { window.__afInstallPrompt.prompt(); window.__afInstallPrompt.userChoice.then(function () { window.__afInstallPrompt = null; }); } openOverlay('af-inst'); }
  function bind() {
    document.addEventListener('click', function (e) {
      var art = e.target.closest && e.target.closest('a.album-art'); if (art) { e.preventDefault(); openOverlay('af-np'); return; }
      if (e.target.closest && (e.target.closest('#af-install-btn') || e.target.closest('#af-cta-install'))) { e.preventDefault(); openInstall(); return; }
      var c = e.target.getAttribute && e.target.getAttribute('data-close'); if (c) { closeOverlay(c); return; }
      if (e.target.classList && e.target.classList.contains('af-overlay')) { closeOverlay(e.target.id); return; }
      var tab = e.target.getAttribute && e.target.getAttribute('data-tab');
      if (tab) { document.querySelectorAll('.af-tab').forEach(function (t) { t.classList.remove('active'); }); document.querySelectorAll('.af-pane').forEach(function (p) { p.classList.remove('active'); }); e.target.classList.add('active'); var pn = document.querySelector('.af-pane[data-pane="' + tab + '"]'); if (pn) pn.classList.add('active'); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeOverlay('af-np'); closeOverlay('af-inst'); } });
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) { FireText.pause(); Viz.pause(); } else { FireText.play(); if (!reduceMotion) Viz.play(); } });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
