/**
 * CRC Measure — field app instant roof measurement UI.
 *
 * Entry points:
 *   runFieldMeasure(address)   -- called from job detail action row
 *   openMeasureFromMap()       -- called from map toolbar
 *
 * Calls the portal backend GET /api/measure?address=... and renders
 * results in a bottom sheet (mobile) or side panel overlay.
 */

var _measureSheet = null;

function _portalUrl() {
  return (typeof SUPPLEMENT_PORTAL_URL !== 'undefined' && SUPPLEMENT_PORTAL_URL)
    || (typeof process !== 'undefined' && process.env && process.env.SUPPLEMENT_PORTAL_URL)
    || 'https://crc-supplements-portal.onrender.com';
}

// jobId is optional. When supplied, the drawing layer will sync to the portal
// job. Called without a jobId from the map (openMeasureFromMap) — drawings
// still render but saves are skipped.
var _measureJobCtx = null;
async function runFieldMeasure(address, jobId) {
  if (!address) { alert('No address to measure.'); return; }
  _measureJobCtx = { address: address, jobId: jobId || null };
  _showMeasureSheet(address, true);
  try {
    var url = _portalUrl() + '/api/measure?address=' + encodeURIComponent(address);
    var r = await fetch(url);
    var data = await r.json();
    if (data.noSolarCoverage) {
      _renderNoSolarCoverage(data);
      return;
    }
    if (!r.ok || data.error) throw new Error(data.error || 'Measurement failed');
    _renderMeasureResults(data);
  } catch (e) {
    _renderMeasureError(e.message);
  }
}

function openMeasureFromMap() {
  var address = prompt('Enter address to measure:');
  if (address) runFieldMeasure(address.trim());
}

function _showMeasureSheet(address, loading) {
  _closeMeasureSheet();
  var sheet = document.createElement('div');
  sheet.id = 'measure-sheet';
  sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:900;background:#fff;border-top-left-radius:16px;border-top-right-radius:16px;box-shadow:0 -4px 20px rgba(0,0,0,0.15);max-height:92vh;overflow-y:auto;padding:0;transition:transform .25s ease;';
  sheet.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #E5E7EB;position:sticky;top:0;background:#fff;z-index:1;border-radius:16px 16px 0 0">'
    + '<div style="font-weight:700;font-size:15px;color:#1B2360">CRC Measure</div>'
    + '<button onclick="_closeMeasureSheet()" style="background:none;border:0;font-size:22px;color:#64748B;cursor:pointer;padding:0;line-height:1">&times;</button>'
    + '</div>'
    + '<div id="measure-body" style="padding:16px 18px">'
    + (loading ? '<div style="text-align:center;padding:30px 0;color:#64748B"><div style="font-size:28px;margin-bottom:8px">&#128207;</div>Measuring roof at <strong>' + (address || '') + '</strong>...<br><span style="font-size:12px">This takes 2-5 seconds</span></div>' : '')
    + '</div>';
  document.body.appendChild(sheet);
  _measureSheet = sheet;
}

function _closeMeasureSheet() {
  if (_measureSheet) { _measureSheet.remove(); _measureSheet = null; }
  var old = document.getElementById('measure-sheet');
  if (old) old.remove();
}

function _renderMeasureError(msg) {
  var body = document.getElementById('measure-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:20px 0;color:#DC2626">'
    + '<div style="font-size:28px;margin-bottom:8px">&#9888;</div>'
    + '<strong>Measurement not available</strong>'
    + '<div style="font-size:13px;margin-top:6px;color:#64748B">' + (msg || 'Unknown error') + '</div>'
    + '</div>';
}

function _fmtN(n) { return n != null ? Number(n).toLocaleString() : '--'; }

function _renderNoSolarCoverage(data) {
  var body = document.getElementById('measure-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:20px 0">'
    + '<div style="font-size:28px;margin-bottom:8px">&#127758;</div>'
    + '<div style="font-weight:700;color:#1B2360;margin-bottom:6px">Satellite measurement unavailable</div>'
    + '<div style="font-size:13px;color:#64748B;margin-bottom:16px">Google Solar API does not have coverage for this property. Common for newer subdivisions and rural areas.</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px;max-width:260px;margin:0 auto">'
    + '<button onclick="_closeMeasureSheet()" style="padding:12px;background:#00B5CC;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Order Hover</button>'
    + '<button onclick="_closeMeasureSheet()" style="padding:10px;background:#fff;color:#1B2360;border:1px solid #CBD5E1;border-radius:8px;font-size:13px;cursor:pointer">Field Measure</button>'
    + '<button onclick="_closeMeasureSheet();openMeasureFromMap()" style="padding:10px;background:none;color:#64748B;border:0;font-size:12px;cursor:pointer;text-decoration:underline">Retry with different address</button>'
    + '</div></div>';
}

function _renderMeasureResults(data) {
  var body = document.getElementById('measure-body');
  if (!body) return;
  var s = data.summary || {};
  var conf = data.confidence || {};
  var facets = data.facets || [];
  var mat = data.materials || {};
  var comp = data.comparison;

  var confColor = s.facetCount >= 6 ? '#16A34A' : s.facetCount >= 3 ? '#F59E0B' : '#DC2626';

  var html = '';

  // 1. Satellite image (static — Google Maps JS may not be loaded in the bottom sheet context)
  if (data.satelliteImageUrl) {
    html += '<div style="margin-bottom:10px;border-radius:8px;overflow:hidden;position:relative">';
    html += '<img src="' + data.satelliteImageUrl + '" style="width:100%;height:auto;display:block" alt="Satellite view">';
    // Overlay facet count badge
    html += '<div style="position:absolute;top:8px;left:8px;background:rgba(0,26,77,0.8);color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700">' + s.facetCount + ' facets detected</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:10px">';
    html += '<button onclick="_closeMeasureSheet()" style="padding:6px 12px;background:#16A34A;color:#fff;border:0;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;flex:1">Looks correct</button>';
    html += '<button onclick="_closeMeasureSheet();openMeasureFromMap()" style="padding:6px 12px;background:none;border:1px solid #94A3B8;color:#64748B;border-radius:4px;font-size:12px;cursor:pointer;flex:1">Wrong building</button>';
    html += '</div>';
  }

  // If data looks unreliable (small structure + very few facets), show error instead of bad numbers
  var isUnreliable = (s.totalSquares && parseFloat(s.totalSquares) < 6) && (s.facetCount <= 2);
  if (isUnreliable) {
    body.innerHTML = '<div style="text-align:center;padding:24px 16px">'
      + '<div style="font-size:36px;margin-bottom:10px">&#9888;&#65039;</div>'
      + '<div style="font-weight:700;color:#991B1B;margin-bottom:8px;font-size:15px">Measurement Unreliable</div>'
      + '<div style="font-size:13px;color:#64748B;margin-bottom:16px">This structure is too small or lacks sufficient satellite data for an accurate reading (' + s.totalSquares + ' SQ, ' + s.facetCount + ' facets). Results would be inaccurate.</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;max-width:260px;margin:0 auto">'
      + '<button onclick="_closeMeasureSheet()" style="padding:12px;background:#00B5CC;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Got It</button>'
      + '</div></div>';
    return;
  }

  // Small roof warning (moderate — show warning but still display data)
  if (data.smallRoofWarning && !isUnreliable) {
    html += '<div style="padding:10px;background:#FEE2E2;border:1px solid #DC2626;border-radius:8px;margin-bottom:10px;font-size:13px;color:#991B1B">';
    html += '<strong>Small structure (' + s.totalSquares + ' SQ).</strong> Accuracy is low. Recommend Hover or hand measurement.';
    html += '</div>';
  }

  // Calibration badge
  if (data.calibrated) {
    var calColor = data.confidence === 'production' ? '#16A34A' : data.confidence === 'directional' ? '#F59E0B' : '#DC2626';
    html += '<div style="margin-bottom:8px;font-size:11px">';
    html += '<span style="display:inline-block;padding:2px 8px;background:' + calColor + ';color:#fff;border-radius:10px;font-weight:700">' + (data.confidence || '').toUpperCase() + '</span>';
    if (data.rawSquares && data.calibratedSquares && data.rawSquares !== data.calibratedSquares) {
      html += ' <span style="color:#94A3B8">Raw ' + data.rawSquares + ' -> ' + data.calibratedSquares + ' SQ (' + data.calibrationVersion + ')</span>';
    }
    html += '</div>';
  }

  // Pitch satellite disclaimer
  html += '<div style="font-size:11px;color:#F59E0B;margin-bottom:8px">Pitch ' + (s.predominantPitch || '?') + ' estimated from satellite - confirm with pitch gauge on site</div>';

  // 2. Summary cards
  html += '<div style="display:flex;gap:10px;margin-bottom:14px">';
  html += _summaryCard(s.totalSquares, 'SQUARES', 'actual');
  html += _summaryCard(s.wasteAdjustedSquares, 'W/WASTE', s.wastePercent + '%');
  html += _summaryCard(s.predominantPitch, 'PITCH', 'predom.');
  html += '</div>';

  // Confidence bar
  var pct = s.facetCount >= 8 ? 90 : s.facetCount >= 5 ? 70 : s.facetCount >= 3 ? 50 : 30;
  html += '<div style="margin-bottom:12px">';
  html += '<div style="background:#E5E7EB;border-radius:4px;height:8px;margin-bottom:4px"><div style="background:' + confColor + ';height:8px;border-radius:4px;width:' + pct + '%"></div></div>';
  html += '<div style="font-size:11px;color:' + confColor + ';font-weight:600">' + (conf.overall || '') + ' - ' + s.facetCount + ' facets detected</div>';
  html += '<div style="font-size:11px;color:#64748B">' + (conf.note || '') + '</div>';
  html += '</div>';

  // Roof type
  html += '<div style="font-size:12px;color:#334155;margin-bottom:12px">' + (s.roofType || 'Unknown').charAt(0).toUpperCase() + (s.roofType || '').slice(1) + ' roof - ' + s.facetCount + ' facets - ' + (s.roofComplexity || '') + ' complexity</div>';

  // Facet table
  if (facets.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#64748B;letter-spacing:1px;margin-bottom:4px">FACET BREAKDOWN</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px"><thead><tr style="color:#64748B;font-weight:600;border-bottom:1px solid #E5E7EB"><th style="text-align:left;padding:4px">#</th><th>Dir</th><th>Pitch</th><th style="text-align:right">Area</th><th style="text-align:right">SQ</th></tr></thead><tbody>';
    var totalArea = 0;
    facets.forEach(function(f, i) {
      totalArea += f.areaSqFt || 0;
      var bg = i % 2 === 0 ? '#fff' : '#F9FAFB';
      html += '<tr style="background:' + bg + '"><td style="padding:4px">' + f.id + '</td><td>' + f.direction + '</td><td>' + f.pitch + '</td><td style="text-align:right">' + _fmtN(f.areaSqFt) + '</td><td style="text-align:right">' + f.squares + '</td></tr>';
    });
    html += '<tr style="font-weight:700;border-top:2px solid #1B2360"><td colspan="3">TOTAL</td><td style="text-align:right">' + _fmtN(Math.round(totalArea)) + '</td><td style="text-align:right">' + s.totalSquares + '</td></tr>';
    html += '</tbody></table>';
  }

  // Quick estimate removed — field measurement required for accurate material counts

  // Comparison
  if (comp) {
    var ok = comp.diffPercent < 8;
    html += '<div style="padding:10px;background:' + (ok ? '#D1FAE5' : '#FEF3C7') + ';border-radius:6px;font-size:12px;color:#1B2360;margin-bottom:12px">';
    html += '<strong>Hover:</strong> ' + comp.hoverSquares + ' SQ | <strong>CRC:</strong> ' + comp.crcSquares + ' SQ | Diff: ' + (comp.diff >= 0 ? '+' : '') + comp.diff + ' SQ (' + comp.diffPercent + '%)';
    html += ok ? ' - Within range' : ' - Larger variance';
    html += '</div>';
  }

  // Imagery + disclaimer
  html += '<div style="font-size:10px;color:#94A3B8;margin-bottom:14px">Satellite imagery: ' + (data.imageryDateStr || '?') + ' - CRC Measure is an estimate. Verify on site for insurance claims.</div>';

  body.innerHTML = html;

  // Mount the drawing overlay + field notes whiteboard under the results.
  if (typeof measureMountDrawing === 'function') {
    try {
      measureMountDrawing(body, {
        satelliteImageUrl: data.satelliteImageUrl || null,
        jobId: (_measureJobCtx && _measureJobCtx.jobId) || null,
        address: (_measureJobCtx && _measureJobCtx.address) || ''
      });
    } catch (e) { console.error('[Measure] drawing mount failed:', e); }
  }
}

function _summaryCard(value, label, sub) {
  return '<div style="flex:1;text-align:center;background:#F0F9FF;border-radius:8px;padding:10px 6px">'
    + '<div style="font-size:26px;font-weight:800;color:#1B2360;line-height:1">' + (value != null ? value : '--') + '</div>'
    + '<div style="font-size:10px;font-weight:700;color:#64748B;letter-spacing:1px;margin-top:2px">' + label + '</div>'
    + '<div style="font-size:10px;color:#94A3B8">' + (sub || '') + '</div>'
    + '</div>';
}
