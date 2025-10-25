
// exporter.js — Export CSV & M3U(✅) pour ta page IPTV.
// S'adapte à 3 sources de données :
//   1) window.verificationResults = [{title, url, status, note?}, ...]
//   2) Un tableau <table> avec statut (✅/⚠️/❌ ou OK/WARN/FAIL) + URL
//   3) La liste de chaînes rendue comme <button data-url> ... <span class="badge">OK/CORS/HS/YT</span>
//      (c'est le cas de ton script: le "badge" est mis à jour par linkStatus + setItemStatus)
(function () {
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

  function collectFromGlobal(){
    if (!Array.isArray(window.verificationResults)) return [];
    return window.verificationResults
      .filter(r => r && r.url)
      .map(r => ({
        title: r.title || r.name || r.channel || (r.url.split('/').pop() || ''),
        url: r.url,
        status: String(r.status || r.state || r.ok || '').trim().toUpperCase().replace('✅','OK').replace('❌','FAIL').replace('⚠️','WARN'),
        note: r.note || r.reason || ''
      }));
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
      let status = 'WARN';
      if (/✅|\bOK\b/i.test(text)) status = 'OK';
      else if (/⚠️|\bWARN\b/i.test(text)) status = 'WARN';
      else if (/❌|\bFAIL\b|\bERROR\b/i.test(text)) status = 'FAIL';
      const titleCell = tr.querySelector('[data-title], .title, td:nth-child(2)');
      const title = (titleCell && titleCell.textContent) ? titleCell.textContent.trim() : (url.split('/').pop() || '');
      out.push({ title, url, status, note: '' });
    }
    return out;
  }

  function collectFromListGroup(){
    // Sélectionne les deux listes (panneaux) si présents
    const roots = Array.from(document.querySelectorAll('#channelList1, #channelList2, #inlineChannelList, .list-group'));
    const btns = roots.flatMap(r => Array.from(r.querySelectorAll('button[data-url]')));
    if (!btns.length) return [];
    const out = [];
    for (const btn of btns) {
      const url  = decodeURIComponent(btn.getAttribute('data-url')  || '');
      const name = decodeURIComponent(btn.getAttribute('data-name') || '') || (url.split('/').pop() || '');
      if (!url) continue;
      // Cherche un badge status dans le bouton (ex: "OK", "CORS", "HS", "YT")
      const badge = btn.querySelector('.badge');
      let label = (badge && (badge.textContent||'').trim().toUpperCase()) || '';
      // Carte vers notre triplet (OK/WARN/FAIL)
      let status;
      if (label === 'OK' || label === '✅') status = 'OK';
      else if (label === 'HS' || label === 'FAIL' || label === '❌') status = 'FAIL';
      else if (label === 'CORS' || label === 'YT' || label === 'WARN' || label === '⚠️') status = 'WARN';
      else status = ''; // inconnu ou non vérifié
      out.push({ title: name, url, status, note: '' });
    }
    // Déduplique par URL (garde le meilleur statut: OK > WARN > FAIL > '')
    const best = new Map();
    const rank = s => (s==='OK'?3 : s==='WARN'?2 : s==='FAIL'?1 : 0);
    for (const r of out) {
      const cur = best.get(r.url);
      if (!cur || rank(r.status) > rank(cur.status)) best.set(r.url, r);
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

  function toCSV(rows){
    const header = ['title','url','status','note'];
    const esc = s => {
      if (s == null) return '';
      s = String(s);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [header.join(',')];
    for (const r of rows) lines.push([esc(r.title), esc(r.url), esc(r.status), esc(r.note)].join(','));
    return lines.join('\n');
  }

  function toM3UOnlyOK(rows){
    const ok = rows.filter(r => r.status === 'OK');
    const lines = ['#EXTM3U'];
    for (const r of ok) {
      const title = r.title && r.title.trim() ? r.title.trim() : (r.url.split('/').pop() || '');
      lines.push(`#EXTINF:-1,${title}`);
      lines.push(r.url);
    }
    return { text: lines.join('\n'), count: ok.length };
  }

  function ensureButtons(){
    if (document.getElementById('btnExportCSV') || document.getElementById('btnExportM3UOK')) return;
    const bar = document.createElement('div');
    bar.style.position = 'fixed';
    bar.style.right = '16px';
    bar.style.bottom = '16px';
    bar.style.zIndex = 99999;
    bar.style.display = 'flex';
    bar.style.gap = '8px';

    const btnCSV = document.createElement('button');
    btnCSV.id = 'btnExportCSV';
    btnCSV.textContent = 'Exporter CSV';
    btnCSV.className = 'btn btn-sm btn-outline-light';

    const btnM3U = document.createElement('button');
    btnM3U.id = 'btnExportM3UOK';
    btnM3U.textContent = 'Exporter M3U (✅)';
    btnM3U.className = 'btn btn-sm btn-success';

    btnCSV.addEventListener('click', () => {
      const rows = collectResults();
      if (!rows.length) { alert("Aucun résultat détecté. Lance d'abord la vérification puis réessaie."); return; }
      downloadText('verification_report.csv', toCSV(rows));
    });

    btnM3U.addEventListener('click', () => {
      const rows = collectResults();
      if (!rows.length) { alert("Aucun résultat détecté. Lance d'abord la vérification puis réessaie."); return; }
      const { text, count } = toM3UOnlyOK(rows);
      if (!count) { alert('Aucun lien marqué valide (OK/✅).'); return; }
      downloadText('valid_only.m3u', text);
    });

    bar.appendChild(btnCSV);
    bar.appendChild(btnM3U);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureButtons);
  else ensureButtons();
})();
