
// exporter_ok_cors_v4.js — version légère (pas d'observer, pas d'intervalle).
// Boutons: CSV, M3U (✅), M3U (✅ + CORS).
// Ne scanne le DOM QUE au clic sur un bouton d'export.

(function(){
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

  // ---- Collecte, déclenchée à la demande ----
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

  function collectFromListGroup(){
    // Cible précise pour limiter le coût
    const roots = [
      document.getElementById('channelList1'),
      document.getElementById('channelList2'),
      document.getElementById('inlineChannelList')
    ].filter(Boolean);
    if (!roots.length) return [];
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
    // Dédupe en faveur des meilleurs statuts
    const rank = r => (r.status==='OK'?5 : r.label==='CORS'?4 : r.label==='YT'?3 : r.status==='WARN'?2 : r.status==='FAIL'?1 : 0);
    const best = new Map();
    for (const r of out) {
      const cur = best.get(r.url);
      if (!cur || rank(r) > rank(cur)) best.set(r.url, r);
    }
    return Array.from(best.values());
  }

  function collectResults(){
    const g = collectFromGlobal();
    if (g.length) return g;
    const l = collectFromListGroup();
    if (l.length) return l;
    return [];
  }

  // ---- Export formats ----
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

  // ---- UI (montage unique) ----
  function mountBar(){
    if (document.getElementById('btnExportCSV')) return;
    const bar = document.createElement('div');
    bar.style.position = 'fixed';
    bar.style.right = '16px';
    bar.style.bottom = '16px';
    bar.style.zIndex = 2147483647;
    bar.style.display = 'flex';
    bar.style.gap = '8px';
    bar.style.flexDirection = 'column';
    bar.style.pointerEvents = 'auto';

    const makeBtn = (id, text, cls) => {
      const b = document.createElement('button');
      b.id = id; b.textContent = text;
      b.className = cls;
      b.style.minWidth = '200px';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBar, { once: true, passive: true });
  } else {
    mountBar();
  }
})();
