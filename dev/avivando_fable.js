/* ============================================================================
   AVIVANDO EL FUEGO — Contrapropuesta FABLE · v9 "El Encendido" (prototipo)
   Basado en el v8 de producción, añade:
     · IGNICIÓN SECUENCIAL: cada letra de AVIVANDO prende una tras otra
       (flash blanco → lava), luego EL FUEGO enciende como brasa. La palabra
       cuenta su propia historia: avivar el fuego.
     · Cámara con dolly-in cinematográfico de entrada.
     · PARALLAX: la escena responde al cursor (desktop) / vaivén (móvil).
     · ATMÓSFERA: humo tenue + lecho de brasas en la base (fogata).
   Conserva de v8: bloom transparente, lava fresnel, visualizador sintético
   (audio intocable), FPS limitado, pausa en segundo plano.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__afThemeV9) return;
  window.__afThemeV9 = true;

  var CFG = {
    ministryUrl: 'https://ministerioavivandoelfuego.com/',
    station: 'Avivando el Fuego Radio',
    tagline: 'Radio cristiana · Adoración y fuego 24/7',
    word1: 'AVIVANDO', word2: 'EL FUEGO',
    three: 'https://esm.sh/three@0.160.0',
    font: 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json'
  };

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); window.__afInstallPrompt = e;
    var b = document.getElementById('af-install-btn'); if (b) b.classList.add('ready');
  });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || /[?&]afmobile=1/.test(location.search);
  var FORCE = /[?&]afforce=1/.test(location.search);   // SOLO DEV: renderiza con timers aunque la pestaña esté oculta

  /* ======================================================================
     ESCENA 3D  ·  ignición + parallax + atmósfera
     ====================================================================== */
  var FireText = (function () {
    var THREE, renderer, scene, camera, bloomComposer, finalComposer;
    var raf = 0, running = false, ready = false, tPrev = 0, born = 0;
    var group, letterGroup, letters = [], elMesh = null, elMat = null;
    var fireParts, fireAttr, fireData, smoke = [], firelight, glowSprite, groundGlow;
    var mountEl, embTex, W = 1, H = 1, camZ = 20;
    var intensity = 0.4, target = 0.4;
    var pTX = 0, pTY = 0, pRX = 0, pRY = 0;          // parallax target/actual
    var PCOUNT = isMobile ? 450 : 1500;
    var spanX = 7.5;
    var IGN_STEP = 0.16, IGN_DUR = 0.55;              // ritmo del encendido

    function softSprite(inner, mid) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var x = c.getContext('2d'); var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, inner || 'rgba(255,255,255,1)'); g.addColorStop(0.3, mid || 'rgba(255,210,120,0.9)');
      g.addColorStop(0.7, 'rgba(255,90,0,0.35)'); g.addColorStop(1, 'rgba(255,90,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      var t = new THREE.Texture(c); t.needsUpdate = true; return t;
    }
    function smokeSprite() {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var x = c.getContext('2d'); var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(200,170,190,0.5)'); g.addColorStop(0.6, 'rgba(150,120,150,0.18)'); g.addColorStop(1, 'rgba(120,100,130,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      var t = new THREE.Texture(c); t.needsUpdate = true; return t;
    }

    function emberTex() {
      var c = document.createElement('canvas'); c.width = c.height = 512;
      var x = c.getContext('2d'); x.fillStyle = '#160a05'; x.fillRect(0, 0, 512, 512);
      var i, s, k;
      for (i = 0; i < 75; i++) {
        x.strokeStyle = 'rgba(255,' + (70 + (Math.random() * 130 | 0)) + ',' + (Math.random() * 40 | 0) + ',' + (0.45 + Math.random() * 0.5).toFixed(2) + ')';
        x.lineWidth = 0.5 + Math.random() * 2.4; x.shadowColor = 'rgba(255,120,0,0.9)'; x.shadowBlur = 5 + Math.random() * 10;
        x.beginPath(); var px = Math.random() * 512, py = Math.random() * 512; x.moveTo(px, py);
        var segs = 3 + (Math.random() * 4 | 0);
        for (s = 0; s < segs; s++) { px += (Math.random() * 2 - 1) * 110; py += (Math.random() * 2 - 1) * 110; x.lineTo(px, py); }
        x.stroke();
      }
      x.shadowBlur = 0;
      for (k = 0; k < 65; k++) {
        var r = 3 + Math.random() * 15, gx = Math.random() * 512, gy = Math.random() * 512;
        var g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, 'rgba(255,236,170,0.9)'); g.addColorStop(0.4, 'rgba(255,110,0,0.45)'); g.addColorStop(1, 'rgba(255,80,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(gx, gy, r, 0, 6.2832); x.fill();
      }
      for (var nn = 0; nn < 1500; nn++) {
        var nx = Math.random() * 512, ny = Math.random() * 512;
        x.fillStyle = Math.random() > 0.6 ? 'rgba(120,50,20,0.5)' : 'rgba(0,0,0,0.4)';
        x.fillRect(nx, ny, 1.4, 1.4);
      }
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.22, 0.22); return t;
    }

    function lavaMat(emissive, eInt) {
      var mat = new THREE.MeshStandardMaterial({ color: 0x1c0d05, emissive: new THREE.Color(emissive), emissiveIntensity: eInt, emissiveMap: embTex, bumpMap: embTex, bumpScale: 0.22, roughness: 0.7, metalness: 0.15 });
      mat.userData.afIgn = { value: 0 };                 // 0=apagada, 1=encendida (liga el rim al encendido)
      mat.onBeforeCompile = function (sh) {
        sh.uniforms.afIgn = mat.userData.afIgn;
        sh.fragmentShader = 'uniform float afIgn;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n float afFres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);\n totalEmissiveRadiance += vec3(1.0, 0.5, 0.12) * afFres * 1.7 * afIgn;');
      };
      return mat;
    }

    /* ---- partículas de fuego + lecho de brasas ---- */
    function buildParticles() {
      var pos = new Float32Array(PCOUNT * 3), col = new Float32Array(PCOUNT * 3);
      fireData = [];
      for (var i = 0; i < PCOUNT; i++) reseed(i, pos, col, true);
      var geo = new THREE.BufferGeometry();
      fireAttr = new THREE.BufferAttribute(pos, 3); geo.setAttribute('position', fireAttr);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      var mat = new THREE.PointsMaterial({ size: isMobile ? 0.5 : 0.42, map: softSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      fireParts = new THREE.Points(geo, mat); scene.add(fireParts);
    }
    function reseed(i, pos, col, init) {
      var ground = Math.random() < 0.35;                      // 35% nacen del lecho de brasas
      var x = (Math.random() * 2 - 1) * (ground ? spanX * 1.25 : spanX);
      var y = ground ? (-3.6 - Math.random() * 0.5) : (0.2 + Math.random() * 1.6);
      var z = (Math.random() * 2 - 1) * 0.7;
      fireData[i] = { x: x, y0: y, z: z, g: ground, vy: (ground ? 0.7 : 1.4) + Math.random() * (ground ? 0.9 : 2.2), sway: Math.random() * 6.28, life: init ? Math.random() : 0, max: 0.7 + Math.random() * 0.8 };
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      col[i * 3] = 1; col[i * 3 + 1] = 0.5; col[i * 3 + 2] = 0.1;
    }
    function stepParticles(dt) {
      var pos = fireAttr.array, col = fireParts.geometry.getAttribute('color').array, boost = 0.6 + intensity;
      for (var i = 0; i < PCOUNT; i++) {
        var d = fireData[i]; d.life += dt * (0.5 + d.vy * 0.18);
        if (d.life > d.max) { var arr = fireParts.geometry.getAttribute('color').array; reseed(i, pos, arr, false); continue; }
        var f = d.life / d.max;
        pos[i * 3] = d.x + Math.sin(d.sway + d.life * 3.0) * 0.5 * f;
        pos[i * 3 + 1] = d.y0 + d.life * d.vy * boost * 1.6;
        pos[i * 3 + 2] = d.z;
        var g = 0.35 + f * 0.6, fade = (1 - f) * (d.g ? 0.55 : 1);
        col[i * 3] = fade * 1.4; col[i * 3 + 1] = g * fade * 1.2; col[i * 3 + 2] = (0.05 + f * 0.25) * fade;
      }
      fireAttr.needsUpdate = true; fireParts.geometry.getAttribute('color').needsUpdate = true;
    }

    /* ---- humo ---- */
    function buildSmoke() {
      var tex = smokeSprite();
      for (var i = 0; i < (isMobile ? 5 : 9); i++) {
        var m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
        var s = new THREE.Sprite(m);
        var sc = 2.5 + Math.random() * 3;
        s.scale.set(sc, sc, 1);
        s.userData = { x: (Math.random() * 2 - 1) * spanX * 0.8, y: 2.6 + Math.random() * 2, v: 0.35 + Math.random() * 0.4, ph: Math.random() * 6.28, o: 0.05 + Math.random() * 0.08 };
        s.position.set(s.userData.x, s.userData.y, -1.5);
        scene.add(s); smoke.push(s);
      }
    }
    function stepSmoke(t, dt) {
      for (var i = 0; i < smoke.length; i++) {
        var s = smoke[i], u = s.userData;
        u.y += u.v * dt; if (u.y > 7) u.y = 2.4;
        s.position.set(u.x + Math.sin(t * 0.4 + u.ph) * 0.8, u.y, -1.5);
        s.material.opacity = u.o * (0.5 + 0.5 * Math.sin(t * 0.6 + u.ph)) * Math.min(1, (t - 1.5));
      }
    }

    /* ---- letras: una malla por letra para el encendido ---- */
    function buildLetters(font, TextGeometry) {
      letterGroup = new THREE.Group();
      var size = 2.4, gap = 0.30, xoff = 0;
      for (var i = 0; i < CFG.word1.length; i++) {
        var ch = CFG.word1[i];
        var geo = new TextGeometry(ch, { font: font, size: size, height: size * 0.32, curveSegments: 5, bevelEnabled: true, bevelThickness: size * 0.04, bevelSize: size * 0.035, bevelSegments: 2 });
        geo.computeBoundingBox();
        var bb = geo.boundingBox, w = bb.max.x - bb.min.x;
        geo.translate(-bb.min.x, 0, -(bb.max.z - bb.min.z) / 2);
        var mat = lavaMat(0xff7a18, 0);                    // nace apagada
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.x = xoff; xoff += w + gap;
        letterGroup.add(mesh);
        letters.push({ mesh: mesh, mat: mat, delay: 0.55 + i * IGN_STEP, peak: 1.55, baseY: 0 });
      }
      var totalW = xoff - gap;
      letterGroup.position.set(-totalW / 2, 0.62, 0);
      group.add(letterGroup);
      return totalW;
    }

    async function init(el) {
      mountEl = el;
      THREE = await import(CFG.three);
      var mods = await Promise.all([
        import(CFG.three + '/examples/jsm/loaders/FontLoader.js'),
        import(CFG.three + '/examples/jsm/geometries/TextGeometry.js'),
        import(CFG.three + '/examples/jsm/postprocessing/EffectComposer.js'),
        import(CFG.three + '/examples/jsm/postprocessing/RenderPass.js'),
        import(CFG.three + '/examples/jsm/postprocessing/UnrealBloomPass.js'),
        import(CFG.three + '/examples/jsm/postprocessing/ShaderPass.js')
      ]);
      var FontLoader = mods[0].FontLoader, TextGeometry = mods[1].TextGeometry,
        EffectComposer = mods[2].EffectComposer, RenderPass = mods[3].RenderPass,
        UnrealBloomPass = mods[4].UnrealBloomPass, ShaderPass = mods[5].ShaderPass;

      W = el.clientWidth || 600; H = el.clientHeight || 270;
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobile });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 2));
      renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      el.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100); camera.position.set(0, 0, 20);
      scene.add(new THREE.AmbientLight(0x66331a, 0.7));
      var key = new THREE.DirectionalLight(0xffaa55, 0.8); key.position.set(0, 6, 8); scene.add(key);
      firelight = new THREE.PointLight(0xff5a00, 2.2, 40); firelight.position.set(0, -2, 6); scene.add(firelight);
      var back = new THREE.PointLight(0xff7a30, 1.6, 50); back.position.set(0, 3, -9); scene.add(back);

      group = new THREE.Group(); scene.add(group);
      var font = await new Promise(function (res, rej) { new FontLoader().load(CFG.font, res, undefined, rej); });
      embTex = emberTex();

      var totalW = buildLetters(font, TextGeometry);
      spanX = totalW / 2;

      // EL FUEGO (una pieza, enciende después)
      var geoB = new TextGeometry(CFG.word2, { font: font, size: 1.7, height: 0.55, curveSegments: 5, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2 });
      geoB.computeBoundingBox(); geoB.center();
      elMat = lavaMat(0xff6512, 0);
      elMesh = new THREE.Mesh(geoB, elMat); elMesh.position.y = -1.9;
      group.add(elMesh);

      // aura + resplandor de suelo
      var glowMat = new THREE.SpriteMaterial({ map: softSprite(), color: 0xff5200, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
      glowSprite = new THREE.Sprite(glowMat); glowSprite.scale.set(totalW * 1.5, 9, 1); glowSprite.position.set(0, 0.6, -3); scene.add(glowSprite);
      var gg = new THREE.SpriteMaterial({ map: softSprite('rgba(255,190,90,1)'), color: 0xff6a00, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
      groundGlow = new THREE.Sprite(gg); groundGlow.scale.set(totalW * 1.7, 3.2, 1); groundGlow.position.set(0, -3.9, -2); scene.add(groundGlow);

      var fitW = Math.max(totalW, 12) * 1.18;
      camZ = (fitW / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) / camera.aspect;
      camera.position.z = camZ * (reduceMotion ? 1 : 1.22);   // dolly-in de entrada

      buildParticles();
      buildSmoke();

      if (!isMobile) {
        var bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 0.5);
        bloomComposer = new EffectComposer(renderer); bloomComposer.renderToScreen = false;
        bloomComposer.addPass(new RenderPass(scene, camera)); bloomComposer.addPass(bloomPass);
        var mix = new ShaderPass(new THREE.ShaderMaterial({
          uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
          vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          fragmentShader: 'uniform sampler2D baseTexture;uniform sampler2D bloomTexture;varying vec2 vUv;void main(){vec4 b=texture2D(baseTexture,vUv);vec4 g=texture2D(bloomTexture,vUv);float ga=max(max(g.r,g.g),g.b);gl_FragColor=vec4(b.rgb+g.rgb,clamp(b.a+ga,0.0,1.0));}',
          transparent: true
        }), 'baseTexture');
        mix.needsSwap = true;
        finalComposer = new EffectComposer(renderer);
        finalComposer.addPass(new RenderPass(scene, camera)); finalComposer.addPass(mix);
      }

      // parallax por cursor (suave, solo desktop)
      if (!isMobile && !reduceMotion) {
        window.addEventListener('pointermove', function (e) {
          pTX = (e.clientX / window.innerWidth - 0.5);
          pTY = (e.clientY / window.innerHeight - 0.5);
        }, { passive: true });
      }

      window.addEventListener('resize', onResize, { passive: true });
      window.__afDbg = { letters: letters, get elInt() { return elMat.emissiveIntensity; }, get camZnow() { return camera.position.z; }, camZ: function () { return camZ; } };
      ready = true;
      return true;
    }

    function onResize() {
      if (!renderer || !mountEl) return;
      W = mountEl.clientWidth || W; H = mountEl.clientHeight || H;
      renderer.setSize(W, H);
      if (bloomComposer) { bloomComposer.setSize(W, H); finalComposer.setSize(W, H); }
      camera.aspect = W / H; camera.updateProjectionMatrix();
    }

    /* curva de ignición: 0→flash(×1.35)→asentar en 1 */
    function ignite(e) {
      if (e <= 0) return 0;
      if (e >= 1) return 1;
      return e < 0.7 ? (e / 0.7) * 1.35 : 1.35 - 0.35 * ((e - 0.7) / 0.3);
    }

    var frameMin = 1000 / (isMobile ? 20 : 30), lastDraw = 0;
    function frame(now) {
      window.__afFrames = (window.__afFrames || 0) + 1;
      if (!running) return;
      if (FORCE) raf = setTimeout(function () { frame(performance.now()); }, 50);
      else raf = requestAnimationFrame(frame);
      if (!FORCE && now - lastDraw < frameMin) return;
      var dt = lastDraw ? Math.min((now - lastDraw) / 1000, 0.06) : 0.033; lastDraw = now;
      if (!born) born = now;
      var t = (now - born) / 1000;
      window.__afT = t;
      intensity += (target - intensity) * 0.1;

      // dolly-in + parallax
      camera.position.z += (camZ - camera.position.z) * 0.035;
      pRY += (pTX * 0.30 - pRY) * 0.06;
      pRX += (-pTY * 0.10 - pRX) * 0.06;
      group.rotation.y = Math.sin(t * 0.3) * 0.10 + pRY;
      group.rotation.x = pRX;
      group.position.y = Math.sin(t * 0.6) * 0.06;

      // encendido secuencial de AVIVANDO
      var allOn = true;
      for (var i = 0; i < letters.length; i++) {
        var L = letters[i], e = (t - L.delay) / IGN_DUR;
        var v = reduceMotion ? 1 : ignite(e);
        if (v < 1) allOn = false;
        L.mat.emissiveIntensity = L.peak * v;
        L.mat.userData.afIgn.value = Math.min(1, v);
        if (!reduceMotion && e > 0 && e < 1) L.mesh.scale.setScalar(0.94 + 0.06 * Math.min(1, e));
        else L.mesh.scale.setScalar(1);
        if (v >= 1) L.mesh.position.y = Math.sin(t * 1.4 + i * 0.7) * 0.05;
      }
      // EL FUEGO enciende cuando AVIVANDO ya arde
      var eb = (t - (0.55 + letters.length * IGN_STEP + 0.35)) / 0.8;
      var ebv = reduceMotion ? 1 : ignite(eb);
      elMat.emissiveIntensity = 1.45 * ebv;
      elMat.userData.afIgn.value = Math.min(1, ebv);

      stepParticles(dt);
      stepSmoke(t, dt);
      if (embTex) { embTex.offset.y -= dt * 0.018; embTex.offset.x += dt * 0.005; }
      var lit = reduceMotion ? 1 : Math.min(1, t / 2.2);
      glowSprite.material.opacity = (0.18 + Math.sin(t * 4.0) * 0.06 + intensity * 0.12) * lit;
      groundGlow.material.opacity = (0.30 + Math.sin(t * 3.1) * 0.08 + intensity * 0.1) * lit;
      firelight.intensity = (1.8 + Math.sin(t * 9.0) * 0.5 + intensity) * (allOn ? 1 : 0.55);

      if (bloomComposer) { renderer.setClearColor(0x000000, 0); bloomComposer.render(); finalComposer.render(); }
      else renderer.render(scene, camera);
    }
    function play() { window.__afPlay = (window.__afPlay || 0) + 1; if (running || !ready) return; running = true; lastDraw = 0; if (FORCE) raf = setTimeout(function () { frame(performance.now()); }, 30); else raf = requestAnimationFrame(frame); }
    function pause() { if (FORCE) return; running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    return {
      mount: function (el) {
        init(el).then(function () {
          window.__afMounted = true;
          if (reduceMotion) { camera.position.z = camZ; running = true; frame(performance.now()); running = false; }
          else play();
        }).catch(function (e) { window.__afErr = String(e && e.stack || e); console.warn('[af] 3D fallo, respaldo texto', e); el.classList.add('af-firetext-fallback'); el.innerHTML = '<span>' + CFG.word1 + '</span><span>' + CFG.word2 + '</span>'; });
      },
      play: function () { if (!reduceMotion) play(); },
      pause: pause,
      setIntensity: function (v) { target = 0.3 + Math.max(0, Math.min(1, v)) * 0.9; },
      ok: function () { return ready; }
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
      FireText.setIntensity(sum / BARS); raf = requestAnimationFrame(tick);
    }
    return { mount: function (el) { build(el); }, play: function () { if (running) return; running = true; raf = requestAnimationFrame(tick); }, pause: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }, hookPlay: function () {} };
  })();

  /* ====================================================================== */
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
