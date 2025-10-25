
// exporter_ok_cors_v3.js — robuste : réapparaît après re-rendu dynamique
// Boutons: CSV, M3U (✅), M3U (✅ + CORS) — lit les badges .link-status

(function () {
  // ===== Utilitaires =====
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function byId(id){ return document.getElementById(id); }
  function exportBarPresent(){
    return !!byId('btnExportCSV') && !!byId('btnExportM3UOK') && !!byId('btnExportM3UOKCORS');
  }

  // ===== Collecte des résultats =====
  function collectFromGlobal(){
    if (!Array.isArray(window.verificationResults)) return [];
    return window.verificationResults
      .filter(r => r && r.url)
      .map(r => {
        const raw = String(r.status || r.state || r.ok || '').trim();
        const norm = raw.toUpperCase().replace('✅','OK').replace('❌','FAIL').replace('⚠️','WARN');
        let label = '';
        if (/^OK$/i.test(raw)) label = 'OK';
        else if (/CORS/i.test(raw)) label = 'CORS';
        else if (/YT|YOUTUBE/i.test(raw)) label = 'YT';
        else if (/HS|FAIL|ERROR/i.test(raw)) label = 'HS';
        else if (/WARN/i.test(raw)) label = 'WARN';
        return {
          title: r.title || r.name || r.channel || (r.url.split('/').pop() || ''),
          url: r.url,
          status: norm, label, note: r.note || r.reason || ''
        };
      });
  }

  function collectFromTable(){
    const roots = Array.from(document.querySelectorAll('table, .results, .verify, #results, #verify'));
    const rows = roots.flatMap(t => Array.from(t.querySelectorAll('tr')));
    const out = [];
    for (const tr of rows) {
      const text = (tr.textContent || '').trim();
      if (!/(✅|⚠️|❌|\bOK\b|\bWARN\b|\bFAIL\b)/i.test(text)) continue;
      let url = '';
      const a = tr.querySelector('a[href^="http"]');
      if (a) url = a.getAttribute('href');
      if (!url) {
        const m = text.match(/https?:\/\/\S+/);
        if (m) url = m[0].replace(/[\s>'"\)\]]+$/, '');
      }
      if (!url) continue;
      let status = 'WARN', label = 'WARN';
      if (/✅|\bOK\b/i.test(text)) { status = 'OK'; label = 'OK'; }
      else if (/⚠️|\bWARN\b/i.test(text)) { status = 'WARN'; label = 'WARN'; }
      else if (/❌|\bFAIL\b|\bERROR\b/i.test(text)) { status = 'FAIL'; label = 'HS'; }
      const titleCell = tr.querySelector('[data-title], .title, td:nth-child(2)');
      const title = (titleCell && titleCell.textContent) ? titleCell.textContent.trim() : (url.split('/').pop() || '');
      out.push({ title, url, status, label, note: '' });
    }
    return out;
  }

  function collectFromListGroup(){
    const roots = Array.from(document.querySelectorAll('#channelList1, #channelList2, #inlineChannelList, .list-group'));
    const btns = roots.flatMap(r => Array.from(r.querySelectorAll('button[data-url]')));
    if (!btns.length) return [];
    const out = [];
    for (const btn of btns) {
      const url  = decodeURIComponent(btn.getAttribute('data-url')  || '');
      const name = decodeURIComponent(btn.getAttribute('data-name') || '') || (url.split('/').pop() || '');
      if (!url) continue;
      let statusEl = btn.querySelector('.link-status'); // statut injecté par setItemStatus
      if (!statusEl) statusEl = btn.querySelector('.badge:not(.badge-geo)'); // fallback
      const raw = (statusEl && (statusEl.textContent||'').trim().toUpperCase()) || '';
      let status, label;
      if (raw === 'OK' || raw === '✅') { status = 'OK';   label = 'OK'; }
      else if (raw === 'CORS')         { status = 'WARN'; label = 'CORS'; }
      else if (raw === 'YT')           { status = 'WARN'; label = 'YT'; }
      else if (raw === 'HS' || raw === '❌' || raw === 'FAIL') { status = 'FAIL'; label = 'HS'; }
      else                            { status = '';     label = ''; }
      out.push({ title: name, url, status, label, note: '' });
    }
    // Dédupe URL avec priorité (OK > CORS > YT > WARN > FAIL > '')
    const rank = r => (r.status==='OK'?5 : r.label==='CORS'?4 : r.label==='YT'?3 : r.status==='WARN'?2 : r.status==='FAIL'?1 : 0);
    const best = new Map();
    for (const r of out) {
      const cur = best.get(r.url);
      if (!cur || rank(r) > rank(cur)) best.set(r.url, r);
    }
    return Array.from(best.values());
  }

  function collectResults(){
    const a = collectFromGlobal();
    if (a.length) return a;
    const c = collectFromListGroup();
    if (c.length) return c;
    const b = collectFromTable();
    if (b.length) return b;
    return [];
  }

  // ===== Exports =====
  function toCSV(rows){
    const header = ['title','url','status','label','note'];
    const esc = s => {
      if (s == null) return '';
      s = String(s);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [header.join(',')];
    for (const r of rows) lines.push([esc(r.title), esc(r.url), esc(r.status), esc(r.label||''), esc(r.note)].join(','));
    return lines.join('\n');
  }

  function toM3U(rows, { includeCors = false } = {}) {
    const keep = rows.filter(r => r.status === 'OK' || (includeCors && (r.label === 'CORS' || r.label === 'YT' || r.status === 'WARN')));
    const lines = ['#EXTM3U'];
    for (const r of keep) {
      const title = r.title && r.title.trim() ? r.title.trim() : (r.url.split('/').pop() || '');
      lines.push(`#EXTINF:-1,${title}`);
      lines.push(r.url);
    }
    return { text: lines.join('\n'), count: keep.length };
  }

  // ===== UI =====
  function mountBar(){
    // Nettoie une éventuelle barre zombie
    const old = document.querySelector('#__exportBar');
    if (old && !document.body.contains(old)) { try{ old.remove(); }catch(_){} }

    if (exportBarPresent()) return;

    const bar = document.createElement('div');
    bar.id = '__exportBar';
    bar.style.position = 'fixed';
    bar.style.right = '16px';
    bar.style.bottom = '16px';
    bar.style.zIndex = 2147483647; // max
    bar.style.display = 'flex';
    bar.style.gap = '8px';
    bar.style.flexDirection = 'column';
    bar.style.pointerEvents = 'auto';

    const makeBtn = (id, text, cls) => {
      const b = document.createElement('button');
      b.id = id; b.textContent = text; b.className = cls;
      b.style.minWidth = '200px';
      b.style.boxShadow = '0 3px 10px rgba(0,0,0,.25)';
      return b;
    };

    const btnCSV   = makeBtn('btnExportCSV',       'Exporter CSV',            'btn btn-sm btn-outline-light');
    const btnOK    = makeBtn('btnExportM3UOK',     'Exporter M3U (✅)',       'btn btn-sm btn-success');
    const btnOKC   = makeBtn('btnExportM3UOKCORS', 'Exporter M3U (✅ + CORS)', 'btn btn-sm btn-warning');

    btnCSV.addEventListener('click', () => {
      const rows = collectResults();
      if (!rows.length) { alert("Aucun résultat détecté. Lance d'abord la vérification."); return; }
      downloadText('verification_report.csv', toCSV(rows));
    });
    btnOK.addEventListener('click', () => {
      const rows = collectResults();
      if (!rows.length) { alert("Aucun résultat détecté. Lance d'abord la vérification."); return; }
      const { text, count } = toM3U(rows, { includeCors: false });
      if (!count) {
        if (confirm('Aucun lien OK. Essayer avec OK + CORS ?')) {
          const alt = toM3U(rows, { includeCors: true });
          if (!alt.count) { alert('Toujours aucun lien OK/CORS.'); return; }
          downloadText('valid_ok_plus_cors.m3u', alt.text);
        }
        return;
      }
      downloadText('valid_only.m3u', text);
    });
    btnOKC.addEventListener('click', () => {
      const rows = collectResults();
      if (!rows.length) { alert("Aucun résultat détecté. Lance d'abord la vérification."); return; }
      const { text, count } = toM3U(rows, { includeCors: true });
      if (!count) { alert('Aucun lien OK/CORS.'); return; }
      downloadText('valid_ok_plus_cors.m3u', text);
    });

    document.body.appendChild(bar);
  }

  function keepAlive(){
    if (!exportBarPresent()) mountBar();
  }

  // Expose une commande manuelle dans la console si besoin
  window.__exporterForce = () => { mountBar(); return 'Exporter monté.'; };

  // Monte au chargement
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBar);
  else mountBar();

  // Re-monte après chaque mutation significative (SPA, re-render)
  const obs = new MutationObserver(() => { keepAlive(); });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Re-monte périodiquement en dernier recours
  setInterval(keepAlive, 1500);

  // Si l'app expose renderChannels, on accroche un hook doux
  try {
    const prev = window.renderChannels;
    if (typeof prev === 'function') {
      window.renderChannels = function(...args){
        const res = prev.apply(this, args);
        try { keepAlive(); } catch(_) {}
        return res;
      };
    }
  } catch(_) {}

})();
