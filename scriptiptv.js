
// youtube_autoplay_gate.addon.js
// Add-on discret : affiche un bouton "Autoriser la lecture YouTube" UNIQUEMENT
// si YouTube est sélectionné en premier et que l'autoplay est bloqué.
// N'altère pas votre script principal. À inclure APRÈS scriptiptv.autoplay.v8.js.

(function(){
  // --- Mémoire de session : un seul clic par session pour débloquer YouTube
  let ytGateUnlocked = false;
  try { ytGateUnlocked = sessionStorage.getItem('ytGestureUnlocked') === '1'; } catch(_){}

  function markUnlocked(){
    ytGateUnlocked = true;
    try { sessionStorage.setItem('ytGestureUnlocked','1'); } catch(_){}
  }

  // Détecte un geste utilisateur "global" et débloque pour la session
  function initGlobalGestureUnlock(){
    const onFirstInteract = ()=>{
      markUnlocked();
      window.removeEventListener('pointerdown', onFirstInteract);
      window.removeEventListener('keydown', onFirstInteract);
    };
    window.addEventListener('pointerdown', onFirstInteract, {once:true});
    window.addEventListener('keydown', onFirstInteract, {once:true});
  }

  function isYouTubeUrl(u){
    if (!u) return false;
    const s = String(u).toLowerCase();
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(s);
  }

  // Overlay "gate" avec z-index maximal, non intrusif
  function showYouTubeGate(onApprove){
    // S'il est déjà affiché, ne pas dupliquer
    let gate = document.getElementById('ytGestureGate');
    if (gate){ gate.classList.remove('d-none'); return; }

    gate = document.createElement('div');
    gate.id = 'ytGestureGate';
    gate.setAttribute('style',[
      'position:fixed',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.35)',
      'backdrop-filter:saturate(1.05) blur(1.5px)',
      'pointer-events:auto',
      'z-index:2147483647'
    ].join(';'));
    const btn = document.createElement('button');
    btn.textContent = 'Autoriser la lecture YouTube';
    btn.setAttribute('style',[
      'padding:.65rem 1rem',
      'border-radius:999px',
      'border:1px solid rgba(255,255,255,.55)',
      'background:rgba(51,136,255,.92)',
      'color:#fff',
      'font-weight:600',
      'box-shadow:0 6px 18px rgba(0,0,0,.28)',
      'cursor:pointer'
    ].join(';'));
    btn.addEventListener('click', ()=>{
      try { markUnlocked(); } catch(_){}
      try { gate.remove(); } catch(_){ gate.classList.add('d-none'); }
      try { onApprove && onApprove(); } catch(_){}
    });
    gate.appendChild(btn);
    document.body.appendChild(gate);
    try { console.log('[YouTubeGate] overlay shown'); } catch(_){}
  }

  function ensureIframeAllowAutoplay(player){
    try {
      const iframe = player.el() && player.el().querySelector && player.el().querySelector('iframe');
      if (iframe) {
        const prev = iframe.getAttribute('allow') || '';
        const need = 'autoplay; fullscreen; picture-in-picture';
        if (!prev.includes('autoplay')) iframe.setAttribute('allow', need);
      }
    } catch(_){}
  }

  // Attache l'add-on quand video.js est prêt et le player existe
  function attach(){
    if (!window.videojs) return false;
    let p = null;
    try { p = window.videojs('player'); } catch(_){}
    if (!p || typeof p.on !== 'function') return false;

    initGlobalGestureUnlock();

    // Quand on charge une source, si c'est YouTube et qu'aucun geste n'a encore été donné,
    // on prépare le "gate". On n'affiche que si la lecture ne part pas.
    p.on('loadstart', () => {
      try {
        const srcObj = (typeof p.currentSource === 'function') ? p.currentSource() : null;
        const src = srcObj && srcObj.src ? srcObj.src : (typeof p.currentSrc === 'function' ? p.currentSrc() : '');
        if (isYouTubeUrl(src)) {
          ensureIframeAllowAutoplay(p);
          // Petit délai : si la lecture part quand même, on ne montre rien.
          setTimeout(() => {
            if (!ytGateUnlocked && p.paused()) {
              showYouTubeGate(() => {
                try { p.muted(true); } catch(_){}
                try { p.play(); } catch(_){}
              });
            }
          }, 200);
        }
      } catch(_){}
    });

    // Si le player signale une erreur et que la source est YT, affiche le gate
    p.on('error', () => {
      try {
        const srcObj = (typeof p.currentSource === 'function') ? p.currentSource() : null;
        const src = srcObj && srcObj.src ? srcObj.src : (typeof p.currentSrc === 'function' ? p.currentSrc() : '');
        if (isYouTubeUrl(src) && !ytGateUnlocked) {
          showYouTubeGate(() => {
            try { p.muted(true); } catch(_){}
            try { p.play(); } catch(_){}
          });
        }
      } catch(_){}
    });

    // Une fois que ça joue, inutile d'afficher le gate
    p.on('playing', () => {
      const gate = document.getElementById('ytGestureGate');
      if (gate) { try { gate.remove(); } catch(_){ gate.classList.add('d-none'); } }
    });

    console.log('[YouTubeGate] add-on attached');
    return true;
  }

  // Attend que video.js soit chargé puis attache
  function waitAndAttach(){
    const ok = attach();
    if (ok) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (attach() || tries > 40) clearInterval(timer); // ~4s max
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndAttach);
  } else {
    waitAndAttach();
  }
})();
