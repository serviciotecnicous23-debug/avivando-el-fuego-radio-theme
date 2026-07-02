/* ============================================================================
   AVIVANDO EL FUEGO — FABLE v10 "La Señal de Fuego" (identidad propia)
   Concepto: el fuego ES la señal de radio. Un horizonte de fuego con forma
   de onda de sonido cruza la pantalla de lado a lado; la tipografía es
   elegante y editorial (serif romana dorada), no letras ardiendo.
     · Un solo shader WebGL crudo (sin Three.js): más liviano que v8/v9.
     · La onda late con intensidad sintética (jamás toca el audio).
     · Brasas que ascienden desde la cresta + suelo incandescente.
     · Media Session, modales, FPS limitado, pausa en pestaña oculta.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__afThemeV10) return;
  window.__afThemeV10 = true;

  var CFG = {
    ministryUrl: 'https://ministerioavivandoelfuego.com/',
    station: 'Avivando el Fuego Radio',
    tagline: 'Adoración · Palabra · Avivamiento',
    fontHref: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;600&display=swap'
  };

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); window.__afInstallPrompt = e;
    var b = document.getElementById('af-install-btn'); if (b) b.classList.add('ready');
  });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || /[?&]afmobile=1/.test(location.search);
  var FORCE = /[?&]afforce=1/.test(location.search);

  // tipografía editorial (Cinzel)
  (function () {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CFG.fontHref;
    document.head.appendChild(l);
  })();

  /* ======================================================================
     LA ONDA DE FUEGO · un solo quad WebGL
     ====================================================================== */
  var Wave = (function () {
    var canvas, gl, prog, raf = 0, running = false, born = 0, lastDraw = 0;
    var uTime, uAmp, uRes;
    var amp = 0.8, ampT = 0.8;
    var frameMin = 1000 / (isMobile ? 24 : 30);

    var VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';
    var FRAG = [
      'precision highp float;',
      'varying vec2 vUv;',
      'uniform float uTime;',
      'uniform float uAmp;',
      'uniform vec2 uRes;',
      'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
      ' float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));',
      ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
      'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+1.7;a*=0.5;}return v;}',
      'void main(){',
      ' vec2 uv=vUv;',
      ' float t=uTime*0.55;',
      // cresta: onda de sonido hecha de ruido — grave (lenta) + agudos (rápidos)
      ' float bass=(fbm(vec2(uv.x*2.2 + t*0.5, t*0.22))-0.5)*0.30;',
      ' float mid=sin(uv.x*14.0 - t*2.6)*0.035*fbm(vec2(uv.x*5.0, t*0.4));',
      ' float treb=sin(uv.x*34.0 + t*4.0)*0.012;',
      ' float ridge=0.34 + (bass+mid+treb)*uAmp;',
      ' float d=uv.y - ridge;',
      // llamas sobre la cresta: fbm ascendiendo, decae con la altura
      ' float n=fbm(vec2(uv.x*7.0, uv.y*3.2 - t*1.4));',
      ' float flame=(0.25+0.85*n)*exp(-max(d,0.0)*7.5);',
      ' flame*=smoothstep(-0.02,0.06,d)+step(d,0.0);',   // pleno bajo la cresta
      // núcleo incandescente justo en la cresta
      ' float core=exp(-abs(d)*26.0)*1.15;',
      // suelo de brasas bajo la cresta
      ' float ground=exp(d*10.0)*step(d,0.0);',
      ' float gn=fbm(vec2(uv.x*16.0, uv.y*10.0+t*0.2));',
      ' float heat=clamp(flame*0.9 + core + ground*(0.35+gn*0.5), 0.0, 1.6);',
      // rampa: granate → rojo → naranja → oro → blanco
      ' vec3 col=vec3(0.0);',
      ' col=mix(col,vec3(0.30,0.02,0.01),smoothstep(0.03,0.20,heat));',
      ' col=mix(col,vec3(0.82,0.10,0.01),smoothstep(0.17,0.42,heat));',
      ' col=mix(col,vec3(1.0,0.36,0.02),smoothstep(0.38,0.66,heat));',
      ' col=mix(col,vec3(1.0,0.70,0.16),smoothstep(0.62,0.92,heat));',
      ' col=mix(col,vec3(1.0,0.96,0.80),smoothstep(0.92,1.25,heat));',
      // brasas que suben desde la cresta
      ' vec2 sp=vec2(uv.x*90.0, (uv.y - t*0.35)*46.0);',
      ' float ember=step(0.994,hash(floor(sp)))*smoothstep(0.35,0.0,d)*step(0.0,d);',
      ' col+=ember*vec3(1.0,0.75,0.35)*0.9;',
      ' float alpha=clamp(heat*1.5 + ember, 0.0, 1.0);',
      ' gl_FragColor=vec4(col,alpha);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[af10]', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function init(mount) {
      canvas = document.createElement('canvas'); canvas.id = 'af10-wave';
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
      uAmp = gl.getUniformLocation(prog, 'uAmp');
      uRes = gl.getUniformLocation(prog, 'uRes');
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      resize(); window.addEventListener('resize', resize, { passive: true });
      return true;
    }
    function resize() {
      if (!canvas) return;
      var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75);
      var w = canvas.clientWidth || 800, h = canvas.clientHeight || 260;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function frame(now) {
      if (!running) return;
      if (FORCE) raf = setTimeout(function () { frame(performance.now()); }, 50);
      else raf = requestAnimationFrame(frame);
      if (!FORCE && now - lastDraw < frameMin) return;
      lastDraw = now;
      if (!born) born = now;
      amp += (ampT - amp) * 0.05;
      gl.uniform1f(uTime, (now - born) / 1000);
      gl.uniform1f(uAmp, amp);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function play() { if (running || !gl) return; running = true; lastDraw = 0; if (FORCE) raf = setTimeout(function () { frame(performance.now()); }, 30); else raf = requestAnimationFrame(frame); }
    function pause() { if (FORCE) return; running = false; if (raf) { cancelAnimationFrame(raf); clearTimeout(raf); } raf = 0; }
    function still() { if (!gl) return; gl.uniform1f(uTime, 7.0); gl.uniform1f(uAmp, 0.9); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    return {
      mount: function (el) { if (!init(el)) { el.classList.add('af10-fallback'); return false; } if (reduceMotion) still(); else play(); return true; },
      play: function () { if (!reduceMotion) play(); },
      pause: pause,
      setIntensity: function (v) { ampT = 0.55 + Math.max(0, Math.min(1, v)) * 0.9; }
    };
  })();

  /* pulso sintético que anima la onda (jamás toca el <audio>) */
  var Pulse = (function () {
    var raf = 0, running = false, t = 0;
    function tick() {
      if (!running) return;
      t += 0.045;
      var v = 0.5 + 0.28 * Math.sin(t) * Math.sin(t * 0.63) + 0.22 * Math.sin(t * 1.7);
      Wave.setIntensity(0.35 + Math.abs(v) * 0.65);
      if (FORCE) raf = setTimeout(tick, 80); else raf = requestAnimationFrame(tick);
    }
    return {
      play: function () { if (running) return; running = true; tick(); },
      pause: function () { if (FORCE) return; running = false; if (raf) { cancelAnimationFrame(raf); clearTimeout(raf); } raf = 0; }
    };
  })();

  /* ====================================================================== */
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  var HERO_HTML =
    '<header id="af10-hero">' +
      '<div id="af10-lockup">' +
        '<span id="af10-live"><i></i>EN VIVO · 24/7</span>' +
        '<p id="af10-kicker">Radio cristiana</p>' +
        '<h1 id="af10-title">Avivando <em>el</em> Fuego</h1>' +
        '<div id="af10-rule"><span></span><b>✦</b><span></span></div>' +
        '<p id="af10-tag">' + CFG.tagline + '</p>' +
      '</div>' +
      '<div id="af10-stage"></div>' +
      '<div id="af10-actions">' +
        '<a id="af10-cta-min" href="' + CFG.ministryUrl + '" target="_blank" rel="noopener">Sitio del Ministerio</a>' +
        '<button id="af10-cta-install" type="button">Instalar app</button>' +
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
      '<h3>Llévate la radio como app</h3><p class="af-muted">Sin tienda, sin descargas pesadas.</p>' +
      '<div id="af-tabs"><button class="af-tab" data-tab="ios">iPhone</button><button class="af-tab" data-tab="android">Android</button><button class="af-tab" data-tab="desktop">PC</button></div>' +
      '<div class="af-pane" data-pane="ios"><ol><li>Abre esta página en <strong>Safari</strong>.</li><li>Toca <strong>Compartir</strong>.</li><li><strong>Añadir a pantalla de inicio</strong>.</li><li>Toca <strong>Añadir</strong>.</li></ol></div>' +
      '<div class="af-pane" data-pane="android"><ol><li>Abre esta página en <strong>Chrome</strong>.</li><li>Menú <strong>⋮</strong>.</li><li><strong>Instalar app</strong>.</li><li>Confirma.</li></ol></div>' +
      '<div class="af-pane" data-pane="desktop"><ol><li>Barra de direcciones → icono <strong>Instalar</strong>.</li><li>O menú <strong>⋮ → Instalar</strong>.</li><li>Confirma.</li></ol></div>' +
    '</div></div>';

  var INSTALL_FAB =
    '<button id="af-install-btn" type="button" aria-label="Instalar app">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M5 20h14"/></svg>' +
      '<span>Instalar app</span></button>';

  function detectPlatform() { var u = navigator.userAgent; if (/iPhone|iPad|iPod/i.test(u)) return 'ios'; if (/Android/i.test(u)) return 'android'; return 'desktop'; }

  function inject() {
    if (document.getElementById('af10-hero')) return;
    var target = document.querySelector('main') || document.querySelector('.public-page') || document.body;
    target.insertAdjacentElement('afterbegin', el(HERO_HTML));
    document.body.appendChild(el(MODAL_NP)); document.body.appendChild(el(MODAL_INSTALL)); document.body.appendChild(el(INSTALL_FAB));
    Wave.mount(document.getElementById('af10-stage'));
    if (!reduceMotion) Pulse.play();
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
      if (e.target.closest && (e.target.closest('#af-install-btn') || e.target.closest('#af10-cta-install'))) { e.preventDefault(); openInstall(); return; }
      var c = e.target.getAttribute && e.target.getAttribute('data-close'); if (c) { closeOverlay(c); return; }
      if (e.target.classList && e.target.classList.contains('af-overlay')) { closeOverlay(e.target.id); return; }
      var tab = e.target.getAttribute && e.target.getAttribute('data-tab');
      if (tab) { document.querySelectorAll('.af-tab').forEach(function (t) { t.classList.remove('active'); }); document.querySelectorAll('.af-pane').forEach(function (p) { p.classList.remove('active'); }); e.target.classList.add('active'); var pn = document.querySelector('.af-pane[data-pane="' + tab + '"]'); if (pn) pn.classList.add('active'); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeOverlay('af-np'); closeOverlay('af-inst'); } });
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) { Wave.pause(); Pulse.pause(); } else { Wave.play(); if (!reduceMotion) Pulse.play(); } });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
