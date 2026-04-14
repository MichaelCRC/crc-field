/* CRC Issue Reporter (field app). Posts to the portal using the same
 * X-Field-App-Key + X-Field-Rep headers the rest of the field app uses. */
(function () {
  if (window.__crcIssueWidget) return;
  window.__crcIssueWidget = true;
  const PORTAL_URL = (typeof FEED_PORTAL_URL !== 'undefined' && FEED_PORTAL_URL) || 'https://crc-supplements-portal.onrender.com';
  const APP_KEY = (typeof FEED_APP_KEY !== 'undefined' && FEED_APP_KEY) || 'crc-field-2026';

  function headers() {
    return {
      'X-Field-App-Key': APP_KEY,
      'X-Field-Rep': (typeof repCode !== 'undefined' && repCode ? repCode : (localStorage.getItem('crc-rep-code') || 'UNK')).toUpperCase()
    };
  }
  function mount() {
    if (document.getElementById('crc-issue-btn')) return;
    const b = document.createElement('button');
    b.id = 'crc-issue-btn'; b.type = 'button'; b.title = 'Report an issue'; b.textContent = '🐛';
    b.onclick = open;
    document.body.appendChild(b);
    const css = document.createElement('style');
    css.textContent = `
      #crc-issue-btn { position: fixed; right: 16px; bottom: 82px; z-index: 120; width: 44px; height: 44px;
        border-radius: 50%; border: none; background: #001A4D; color: #fff; font-size: 20px; cursor: pointer;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3); }
      #crc-issue-btn:hover { background: #00B5CC; }
      .crc-issue-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 500; display:flex; align-items:flex-end; }
      .crc-issue-card { width: 100%; background: #fff; color: #0D0D0D; padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
        border-radius: 16px 16px 0 0; font-family: -apple-system, system-ui, sans-serif; max-height: 92vh; overflow-y: auto; }
      .crc-issue-card h3 { margin: 0 0 2px; font-size: 17px; }
      .crc-issue-card p.sub { margin: 0 0 14px; font-size: 12px; color: #64748B; }
      .crc-issue-card label.lbl { display:block; font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#64748B; margin:10px 0 6px; }
      .crc-issue-types { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
      .crc-issue-types button { background:#fff; color:#0D0D0D; border:1px solid #E2E8F0; border-radius:6px; padding:10px; font-size:13px; text-align:left; }
      .crc-issue-types button.on { background:rgba(0,181,204,0.12); border-color:#00B5CC; color:#0D5460; }
      .crc-issue-card input[type=text], .crc-issue-card textarea { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #E2E8F0; border-radius:6px; font-size:14px; font-family:inherit; }
      .crc-issue-card textarea { min-height:90px; resize:vertical; }
      .crc-issue-priority { display:inline-flex; gap:4px; background:#F5F7FA; padding:3px; border-radius:999px; }
      .crc-issue-priority button { background:transparent; color:#64748B; border:none; padding:6px 12px; font-size:11px; font-weight:700; letter-spacing:0.05em; border-radius:999px; text-transform:uppercase; }
      .crc-issue-priority button.on { background:#00B5CC; color:#fff; }
      .crc-issue-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
      .crc-issue-actions .cancel { background:transparent; color:#64748B; border:none; padding:10px 14px; font-size:14px; }
      .crc-issue-actions .submit { background:#00B5CC; color:#fff; border:none; border-radius:6px; padding:11px 20px; font-weight:700; font-size:14px; }
    `;
    document.head.appendChild(css);
  }
  function pageLabel() { return document.title || location.pathname; }
  function open() {
    if (document.getElementById('crc-issue-overlay')) return;
    const o = document.createElement('div');
    o.id = 'crc-issue-overlay'; o.className = 'crc-issue-overlay';
    o.onclick = (e) => { if (e.target === o) close(); };
    o.innerHTML = `
      <div class="crc-issue-card">
        <h3>Report an Issue</h3>
        <p class="sub">Sends straight to the team. Thanks for the catch.</p>
        <label class="lbl">What's wrong?</label>
        <div class="crc-issue-types">
          <button type="button" class="on" data-type="broken" onclick="__fcIssuePick(this)">🐛 Broken</button>
          <button type="button" data-type="looks_wrong" onclick="__fcIssuePick(this)">🎨 Looks wrong</button>
          <button type="button" data-type="feature" onclick="__fcIssuePick(this)">✨ Feature idea</button>
          <button type="button" data-type="question" onclick="__fcIssuePick(this)">❓ Question</button>
        </div>
        <label class="lbl">Which screen?</label>
        <input id="__fci-page" type="text" value="${(pageLabel()||'').replace(/"/g,'&quot;')}">
        <label class="lbl">Describe</label>
        <textarea id="__fci-desc" placeholder="What happened?"></textarea>
        <label class="lbl">Screenshot (optional)</label>
        <input id="__fci-shot" type="file" accept="image/*">
        <label class="lbl" style="margin-top:12px">Priority</label>
        <div class="crc-issue-priority" id="__fci-pri">
          <button type="button" data-pri="low" onclick="__fcIssuePri(this)">Low</button>
          <button type="button" data-pri="medium" class="on" onclick="__fcIssuePri(this)">Medium</button>
          <button type="button" data-pri="high" onclick="__fcIssuePri(this)">High</button>
          <button type="button" data-pri="urgent" onclick="__fcIssuePri(this)">Urgent</button>
        </div>
        <div class="crc-issue-actions">
          <button class="cancel" type="button" onclick="__fcIssueClose()">Cancel</button>
          <button class="submit" type="button" id="__fci-submit" onclick="__fcIssueSubmit(this)">Submit</button>
        </div>
      </div>`;
    document.body.appendChild(o);
  }
  function close() { document.getElementById('crc-issue-overlay')?.remove(); }
  window.__fcIssuePick = function (btn) { btn.closest('.crc-issue-types').querySelectorAll('button').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); };
  window.__fcIssuePri = function (btn) { btn.closest('.crc-issue-priority').querySelectorAll('button').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); };
  window.__fcIssueClose = close;
  window.__fcIssueSubmit = async function (submitBtn) {
    const o = document.getElementById('crc-issue-overlay'); if (!o) return;
    const type = (o.querySelector('.crc-issue-types .on') || {}).dataset?.type || 'broken';
    const priority = (o.querySelector('.crc-issue-priority .on') || {}).dataset?.pri || 'medium';
    const page = document.getElementById('__fci-page')?.value || '';
    const description = (document.getElementById('__fci-desc')?.value || '').trim();
    const file = document.getElementById('__fci-shot')?.files?.[0];
    if (!description) return alert('Please describe the issue.');
    submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
    try {
      const fd = new FormData();
      fd.append('type', type); fd.append('page', page); fd.append('description', description);
      fd.append('priority', priority); fd.append('source', 'field_app');
      if (file) fd.append('screenshot', file);
      const r = await fetch(PORTAL_URL + '/api/issues', { method:'POST', headers: headers(), body: fd });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      close();
      alert('Thanks — issue reported.');
    } catch (e) {
      submitBtn.disabled = false; submitBtn.textContent = 'Submit';
      alert('Could not submit: ' + e.message);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
