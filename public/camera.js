/* CRC universal photo capture.
 *
 * One function, called from every "take a photo" button in the app:
 *
 *   triggerPhotoCapture({ accept, multiple }, (result) => { ... })
 *     result: { file, base64, fileName }
 *
 * Works on iPhone Safari, iOS standalone PWA, iPad, Android, and desktop
 * (native file picker on desktop, native camera on mobile). No
 * getUserMedia, no WebRTC, no permissions prompt. The <input> is created
 * fresh each call, given `capture="environment"`, click()'d inside the
 * user's tap handler (so the user gesture is preserved), and removed
 * when onchange fires. That last point is what makes it reliable on
 * every browser I know of — the old code reused a single hidden
 * display:none input which iOS Safari silently refuses to programmatically
 * click.
 *
 * If there's no active user gesture (e.g. triggered from a setTimeout),
 * the click will be blocked. Always call this from inside an onclick or
 * ontouchend handler.
 */
function triggerPhotoCapture(opts, callback) {
  if (typeof opts === 'function') { callback = opts; opts = {}; }
  opts = opts || {};
  console.log('[Camera] triggerPhotoCapture invoked', opts);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = opts.accept || 'image/*';
  if (!opts.skipCapture) input.setAttribute('capture', 'environment');
  if (opts.multiple) input.multiple = true;
  // Visible-but-invisible: display:none is the one state iOS blocks
  // programmatic click on.
  input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;width:1px;height:1px;pointer-events:none;z-index:-1';
  document.body.appendChild(input);

  input.onchange = function (e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) { input.remove(); return; }
    // Clean up DOM immediately so the next capture creates a fresh input.
    const done = () => { try { input.remove(); } catch {} };

    if (opts.multiple) {
      // Multi-file: emit one callback per file with { file, fileName }.
      // Base64 is expensive for many large photos — caller opts in.
      Promise.all(files.map(f => opts.base64 ? _readAsDataURL(f) : Promise.resolve(null)))
        .then(b64s => {
          files.forEach((file, i) => {
            callback && callback({ file, fileName: file.name, base64: b64s[i] });
          });
          done();
        }).catch(() => done());
    } else {
      const file = files[0];
      if (opts.base64 === false) {
        callback && callback({ file, fileName: file.name, base64: null });
        done();
      } else {
        _readAsDataURL(file).then(b64 => {
          callback && callback({ file, fileName: file.name, base64: b64 });
          done();
        }).catch(() => done());
      }
    }
  };

  // Trigger the native picker / camera. Must be inside the user gesture.
  input.click();
}

function _readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('FileReader failed'));
    r.readAsDataURL(file);
  });
}

// ── Default uploader for lead photos ──
// Uploads a captured File to the existing /api/leads/:leadId/photos
// endpoint and refreshes the lead's photo section. Button handlers can
// use this directly or roll their own with the raw file.
async function uploadLeadPhoto(file, tag) {
  if (!file || typeof currentLeadId === 'undefined' || !currentLeadId) {
    console.warn('[Camera] uploadLeadPhoto: no currentLeadId');
    return { success: false, error: 'No active lead' };
  }
  const fd = new FormData();
  fd.append('photos', file);
  fd.append('repCode', typeof repCode !== 'undefined' ? repCode : '');
  fd.append('tag', tag || (typeof activePhotoTab !== 'undefined' && activePhotoTab === 'inspection' ? 'overview' : 'during'));
  fd.append('category', typeof activePhotoTab !== 'undefined' ? activePhotoTab : 'inspection');
  fd.append('caption', '');
  try {
    const r = await fetch('/api/leads/' + currentLeadId + '/photos', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (data && data.success) {
      if (typeof currentLeadPhotos !== 'undefined') currentLeadPhotos = data.photos;
      if (typeof renderPhotoSection === 'function') renderPhotoSection();
      return { success: true, photos: data.photos };
    }
    throw new Error('Upload not acknowledged');
  } catch (e) {
    console.error('[Camera] uploadLeadPhoto failed:', e.message);
    alert('Photo upload failed: ' + e.message);
    return { success: false, error: e.message };
  }
}

// Convenience wrapper wired to the main 📷 button in the lead detail's
// photo section. Captures a photo and uploads it in one shot.
function capturePhotoAndUpload() {
  triggerPhotoCapture({ base64: false }, function (result) {
    if (!result || !result.file) return;
    uploadLeadPhoto(result.file);
  });
}
