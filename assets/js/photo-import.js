/* photo-import.js — Importar citas desde foto de agenda física
   Expone: window.photoImport()
   Depende de los globales definidos en app.js:
     S, $, gid, save, today, client, openM, closeM, render, fmt
   Tesseract.js se carga de forma diferida (lazy) por CDN cuando hace falta.
*/

(function () {
  'use strict';

  /* ─── Estado interno del módulo ───────────────────────────────────────── */
  var _tesseractLoaded = false;
  var _tesseractLoading = false;
  var _tesseractCallbacks = [];

  /* ─── Carga diferida de Tesseract.js ──────────────────────────────────── */
  function loadTesseract(cb) {
    if (_tesseractLoaded) { cb(null); return; }
    _tesseractCallbacks.push(cb);
    if (_tesseractLoading) return;
    _tesseractLoading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = function () {
      _tesseractLoaded = true;
      _tesseractLoading = false;
      _tesseractCallbacks.forEach(function (fn) { fn(null); });
      _tesseractCallbacks = [];
    };
    s.onerror = function () {
      _tesseractLoading = false;
      var err = new Error('No se pudo cargar Tesseract.js (sin conexión o bloqueado).');
      _tesseractCallbacks.forEach(function (fn) { fn(err); });
      _tesseractCallbacks = [];
    };
    document.head.appendChild(s);
  }

  /* ─── Utilidades ──────────────────────────────────────────────────────── */
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Extrae HH:mm de un fragmento de texto. Devuelve null si no encuentra. */
  function parseHour(text) {
    // Patrones: 9:00 | 09.30 | 9h | 10 h | 16:45 | 8:30am | 8:30 pm
    var patterns = [
      /\b(\d{1,2})[:\.](\d{2})\s*([ap]m)?\b/i,
      /\b(\d{1,2})\s*h\b/i
    ];
    var m;
    m = text.match(/\b(\d{1,2})[:\.](\d{2})\s*(am|pm)?\b/i);
    if (m) {
      var hh = parseInt(m[1], 10);
      var mm = parseInt(m[2], 10);
      var ap = (m[3] || '').toLowerCase();
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      }
    }
    m = text.match(/\b(\d{1,2})\s*h\b/i);
    if (m) {
      var hh2 = parseInt(m[1], 10);
      if (hh2 >= 0 && hh2 <= 23) {
        return String(hh2).padStart(2, '0') + ':00';
      }
    }
    return null;
  }

  /** Quita la parte de la hora del texto para obtener el nombre candidato. */
  function stripHour(text) {
    return text
      .replace(/\b\d{1,2}[:\.]?\d{0,2}\s*h\b/gi, '')
      .replace(/\b\d{1,2}[:\.]?\d{2}\s*(am|pm)?\b/gi, '')
      .replace(/^[\s\-–—:·]+|[\s\-–—:·]+$/g, '')
      .trim();
  }

  /** Busca un cliente existente por nombre (inclusión case-insensitive). */
  function matchClient(nameText) {
    if (!nameText) return null;
    var lower = nameText.toLowerCase();
    return (S.clients || []).find(function (c) {
      var full = ((c.name || '') + ' ' + (c.sur || '')).toLowerCase().trim();
      var first = (c.name || '').toLowerCase();
      return full.includes(lower) || lower.includes(first) ||
        (lower.includes((c.name || '').toLowerCase()) && c.name);
    }) || null;
  }

  /** Parsea el texto OCR y devuelve array de candidatas. */
  function parseOcrText(text) {
    var lines = text.split(/\r?\n/);
    var candidates = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var hour = parseHour(trimmed);
      if (!hour) return;                       // solo procesa líneas con hora
      var rawName = stripHour(trimmed);
      var matched = matchClient(rawName);
      candidates.push({
        hour: hour,
        rawName: rawName,
        clientId: matched ? matched.id : '',
        isNew: !matched && rawName.length > 0,
        newName: matched ? '' : rawName
      });
    });
    return candidates;
  }

  /* ─── Selector de clientes (HTML) ─────────────────────────────────────── */
  function clientSelectOptions(selectedId) {
    var opts = '<option value="">— Seleccionar cliente —</option>';
    (S.clients || []).forEach(function (c) {
      var label = escHtml(c.name + (c.sur ? ' ' + c.sur : ''));
      var sel = c.id === selectedId ? ' selected' : '';
      opts += '<option value="' + escHtml(c.id) + '"' + sel + '>' + label + '</option>';
    });
    opts += '<option value="__new__">➕ Nuevo cliente</option>';
    return opts;
  }

  /* ─── Renderiza la lista de filas editables en #piRows ────────────────── */
  function renderRows(candidates) {
    var container = document.getElementById('piRows');
    if (!container) return;
    if (!candidates.length) {
      container.innerHTML = '<div class="empty">No se detectaron citas. Añade filas manualmente.</div>';
      return;
    }
    container.innerHTML = '';
    candidates.forEach(function (cand, idx) {
      container.appendChild(buildRow(cand, idx));
    });
  }

  /** Construye el elemento DOM de una fila editable. */
  function buildRow(cand, idx) {
    var div = document.createElement('div');
    div.className = 'item';
    div.dataset.idx = idx;
    div.style.cssText = 'padding:10px 12px;margin-bottom:8px;';

    var isNew = cand.clientId === '__new__' || cand.isNew;
    var newNameVal = escHtml(cand.newName || '');

    div.innerHTML =
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;">' +
        '<div class="field" style="flex:0 0 100px;">' +
          '<label>Hora</label>' +
          '<input type="time" class="pi-hour" value="' + escHtml(cand.hour || '') + '">' +
        '</div>' +
        '<div class="field" style="flex:1 1 180px;">' +
          '<label>Cliente</label>' +
          '<select class="pi-client" onchange="window._piClientChange(this)">' +
            clientSelectOptions(isNew ? '' : (cand.clientId || '')) +
          '</select>' +
        '</div>' +
        '<div class="field pi-new-name-wrap" style="flex:1 1 140px;display:' + (isNew ? 'block' : 'none') + ';">' +
          '<label>Nombre nuevo cliente</label>' +
          '<input type="text" class="pi-new-name" placeholder="Nombre y apellidos" value="' + newNameVal + '">' +
        '</div>' +
        '<div class="field" style="flex:0 0 90px;">' +
          '<label>Precio €</label>' +
          '<input type="number" class="pi-price" min="0" step="1" value="' + escHtml(String(priceFor(cand.clientId))) + '">' +
        '</div>' +
        '<div style="flex:0 0 auto;padding-bottom:2px;">' +
          '<button class="btn alt" style="padding:6px 10px;font-size:.85rem;" onclick="window._piDeleteRow(this)" title="Eliminar fila">✕</button>' +
        '</div>' +
      '</div>';

    // Si hay match parcial: mostrar en select el cliente preseleccionado
    if (!isNew && cand.clientId) {
      var sel = div.querySelector('.pi-client');
      if (sel) sel.value = cand.clientId;
    }
    // Si es nuevo: seleccionar __new__ en el select
    if (isNew) {
      var sel2 = div.querySelector('.pi-client');
      if (sel2) sel2.value = '__new__';
    }

    return div;
  }

  function priceFor(clientId) {
    if (!clientId || clientId === '__new__') return 60;
    var c = client(clientId);
    return c ? (Number(c.price) || 60) : 60;
  }

  /* ─── Manejadores globales temporales para eventos inline ─────────────── */
  window._piClientChange = function (sel) {
    var row = sel.closest('.item');
    var wrap = row.querySelector('.pi-new-name-wrap');
    var priceInput = row.querySelector('.pi-price');
    if (sel.value === '__new__') {
      if (wrap) wrap.style.display = 'block';
    } else {
      if (wrap) wrap.style.display = 'none';
      if (priceInput && sel.value) {
        priceInput.value = priceFor(sel.value);
      }
    }
  };

  window._piDeleteRow = function (btn) {
    var row = btn.closest('.item');
    if (row) row.remove();
    var container = document.getElementById('piRows');
    if (container && !container.children.length) {
      container.innerHTML = '<div class="empty">No hay filas. Pulsa "+ Añadir fila" para añadir citas manualmente.</div>';
    }
    window._piUpdateSaveBtn();
  };

  window._piAddRow = function () {
    var container = document.getElementById('piRows');
    if (!container) return;
    // Quitar el empty si existe
    var empty = container.querySelector('.empty');
    if (empty) empty.remove();
    var idx = container.children.length;
    var newCand = { hour: '', rawName: '', clientId: '', isNew: false, newName: '' };
    container.appendChild(buildRow(newCand, idx));
    window._piUpdateSaveBtn();
  };

  /* ─── OCR: actualiza la barra de progreso ─────────────────────────────── */
  function setProgress(pct, msg) {
    var bar = document.getElementById('piProgressBar');
    var txt = document.getElementById('piProgressTxt');
    if (bar) bar.style.width = Math.round(pct) + '%';
    if (txt) txt.textContent = msg || '';
  }

  /* ─── Motor OCR principal ─────────────────────────────────────────────── */
  function runOcr(file, callback) {
    // ── Intentar Google Vision si está configurado ──
    if (S.set && S.set.visionEndpoint) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var base64 = e.target.result.replace(/^data:[^;]+;base64,/, '');
        setProgress(30, 'Enviando a Google Vision…');
        fetch(S.set.visionEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.text) {
              setProgress(100, 'OCR con Google Vision completado.');
              callback(null, data.text);
            } else {
              throw new Error(data.error || 'Respuesta vacía de Google Vision.');
            }
          })
          .catch(function (err) {
            console.warn('[photoImport] Google Vision falló, usando Tesseract:', err.message);
            runTesseract(file, callback);
          });
      };
      reader.onerror = function () {
        runTesseract(file, callback);
      };
      reader.readAsDataURL(file);
    } else {
      runTesseract(file, callback);
    }
  }

  function runTesseract(file, callback) {
    setProgress(5, 'Cargando motor de OCR…');
    loadTesseract(function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      setProgress(10, 'Motor listo. Reconociendo texto…');
      try {
        Tesseract.recognize(file, 'spa', {
          logger: function (m) {
            if (m.status === 'recognizing text') {
              var pct = 10 + Math.round(m.progress * 85);
              setProgress(pct, 'Leyendo la foto… ' + Math.round(m.progress * 100) + '%');
            }
          }
        }).then(function (result) {
          setProgress(100, 'Texto reconocido.');
          callback(null, result.data.text);
        }).catch(function (e) {
          callback(e, null);
        });
      } catch (e) {
        callback(e, null);
      }
    });
  }

  /* ─── Pantalla 1: captura ─────────────────────────────────────────────── */
  function screen1Html() {
    return (
      '<h2 style="margin-bottom:12px;">📷 Importar agenda desde foto</h2>' +
      '<p class="notice">Haz una foto a la página de tu agenda. Revisarás y corregirás las citas antes de guardarlas.</p>' +
      '<div class="field">' +
        '<label>Fecha de la página (se aplicará a todas las citas detectadas)</label>' +
        '<input id="piDate" type="date" value="' + today() + '">' +
      '</div>' +
      '<div class="field" style="margin-top:12px;">' +
        '<label>Foto de la agenda</label>' +
        '<input id="piFile" type="file" accept="image/*" capture="environment" style="display:block;margin-top:6px;">' +
      '</div>' +
      '<div id="piProgressWrap" style="display:none;margin-top:14px;">' +
        '<div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">' +
          '<div id="piProgressBar" style="height:100%;width:0%;background:#315f73;transition:width .3s;border-radius:6px;"></div>' +
        '</div>' +
        '<div id="piProgressTxt" style="font-size:.83rem;color:#6b7280;">Iniciando…</div>' +
      '</div>' +
      '<div id="piErrorWrap" style="display:none;margin-top:10px;">' +
        '<p class="notice" style="border-color:#ef4444;color:#b91c1c;" id="piErrorMsg"></p>' +
        '<p style="font-size:.85rem;margin-top:6px;">Puedes igualmente <b>añadir citas manualmente</b> pulsando el botón de abajo.</p>' +
        '<button class="btn alt" style="margin-top:8px;" onclick="window._piGoToReview([])">Introducir citas a mano</button>' +
      '</div>' +
      '<div class="actions" style="margin-top:16px;">' +
        '<button class="btn alt" onclick="window._piGoToReview([], null, (document.getElementById(\'piDate\')||{}).value)">✍️ Introducir citas a mano</button>' +
        '<button class="btn alt" onclick="closeM()">Cancelar</button>' +
      '</div>'
    );
  }

  /* ─── Pantalla 2: revisión ─────────────────────────────────────────────── */
  function screen2Html(candidates, imgObjectUrl, dateVal) {
    var imgHtml = imgObjectUrl
      ? '<div style="margin-bottom:12px;"><img src="' + escHtml(imgObjectUrl) + '" alt="Foto agenda" style="max-height:160px;max-width:100%;border-radius:8px;object-fit:contain;border:1px solid #e5e7eb;"></div>'
      : '';
    return (
      '<h2 style="margin-bottom:12px;">Revisar citas detectadas</h2>' +
      imgHtml +
      '<p class="notice">El OCR no es perfecto. Revisa hora, cliente y precio antes de guardar.</p>' +
      '<div class="field" style="margin-bottom:10px;">' +
        '<label>Fecha de todas las citas</label>' +
        '<input id="piDateReview" type="date" value="' + escHtml(dateVal || today()) + '">' +
      '</div>' +
      '<div id="piRows" style="margin-bottom:10px;"></div>' +
      '<button class="btn alt" style="margin-bottom:14px;" onclick="window._piAddRow()">+ Añadir fila</button>' +
      '<div class="actions">' +
        '<button class="btn" id="piSaveBtn" onclick="window._piSave()">Guardar citas en la agenda</button>' +
        '<button class="btn alt" onclick="closeM()">Cancelar</button>' +
      '</div>'
    );
  }

  /* ─── Ir a pantalla 2 ─────────────────────────────────────────────────── */
  window._piGoToReview = function (candidates, imgObjectUrl, dateVal) {
    var modal = document.getElementById('modal');
    if (!modal) return;
    modal.innerHTML = screen2Html(candidates, imgObjectUrl, dateVal);
    renderRows(candidates);
    // Actualizar botón con conteo
    window._piUpdateSaveBtn();
  };

  window._piUpdateSaveBtn = function () {
    var btn = document.getElementById('piSaveBtn');
    if (!btn) return;
    var rows = document.querySelectorAll('#piRows .item');
    btn.textContent = 'Guardar ' + rows.length + ' cita' + (rows.length !== 1 ? 's' : '') + ' en la agenda';
  };

  /* ─── Guardar citas ────────────────────────────────────────────────────── */
  window._piSave = function () {
    var dateEl = document.getElementById('piDateReview');
    var dateVal = dateEl ? dateEl.value : today();
    if (!dateVal) { alert('Indica la fecha de las citas.'); return; }

    var rows = document.querySelectorAll('#piRows .item');
    var saved = 0;
    var errors = [];

    rows.forEach(function (row) {
      var hourEl = row.querySelector('.pi-hour');
      var clientEl = row.querySelector('.pi-client');
      var newNameEl = row.querySelector('.pi-new-name');
      var priceEl = row.querySelector('.pi-price');

      var hourVal = hourEl ? hourEl.value.trim() : '';
      var clientVal = clientEl ? clientEl.value : '';
      var priceVal = priceEl ? Number(priceEl.value) || 60 : 60;

      if (!hourVal) {
        errors.push('Una fila no tiene hora definida y se omitió.');
        return;
      }

      var clientId;
      if (clientVal === '__new__' || !clientVal) {
        var newName = newNameEl ? newNameEl.value.trim() : '';
        if (!newName) {
          errors.push('Una fila de cliente nuevo no tiene nombre y se omitió.');
          return;
        }
        // Crear nuevo cliente mínimo
        var newClient = {
          id: gid('c'),
          name: newName,
          sur: '',
          nif: '',
          phone: '',
          price: priceVal,
          irpf: 0,
          type: 'particular',
          igicReg: 'exento',
          amigo: false,
          notes: ''
        };
        S.clients.push(newClient);
        clientId = newClient.id;
      } else {
        clientId = clientVal;
      }

      var start = dateVal + 'T' + hourVal;
      S.sessions.push({
        id: gid('s'),
        c: clientId,
        start: start,
        price: priceVal,
        st: 'programada',
        notes: '',
        inv: '',
        rem: false,
        noBill: false
      });
      saved++;
    });

    if (errors.length) {
      console.warn('[photoImport] Filas omitidas:', errors);
    }

    save();

    if (saved === 0) {
      alert('No se guardó ninguna cita. Revisa que cada fila tenga hora y cliente.');
      return;
    }

    // Mostrar confirmación y cerrar
    var modal = document.getElementById('modal');
    if (modal) {
      modal.innerHTML =
        '<div style="text-align:center;padding:24px 16px;">' +
          '<div style="font-size:2.4rem;margin-bottom:10px;">✅</div>' +
          '<h2 style="margin-bottom:8px;">¡Citas guardadas!</h2>' +
          '<p style="font-size:1.05rem;margin-bottom:4px;"><b>' + saved + '</b> cita' + (saved !== 1 ? 's' : '') + ' añadida' + (saved !== 1 ? 's' : '') + ' a la agenda.</p>' +
          (errors.length ? '<p class="notice" style="margin-top:10px;font-size:.85rem;">Se omitieron ' + errors.length + ' fila' + (errors.length !== 1 ? 's' : '') + ' incompleta' + (errors.length !== 1 ? 's' : '') + '.</p>' : '') +
          '<p class="notice" style="margin-top:10px;">Las citas están en estado <b>programada</b>. No se ha generado ninguna factura.</p>' +
          '<div class="actions" style="justify-content:center;margin-top:16px;">' +
            '<button class="btn" onclick="closeM()">Ver agenda</button>' +
          '</div>' +
        '</div>';
    }
  };

  /* ─── Función principal expuesta globalmente ───────────────────────────── */
  function photoImport() {
    openM(screen1Html());

    // Listener en el input de archivo — debe engancharse tras openM
    var tryAttach = function () {
      var fileInput = document.getElementById('piFile');
      if (!fileInput) {
        setTimeout(tryAttach, 50);
        return;
      }
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;

        var dateVal = (document.getElementById('piDate') || {}).value || today();
        var imgUrl = URL.createObjectURL(file);

        // Mostrar barra de progreso
        var wrap = document.getElementById('piProgressWrap');
        if (wrap) wrap.style.display = 'block';

        // Limpiar errores anteriores
        var errWrap = document.getElementById('piErrorWrap');
        if (errWrap) errWrap.style.display = 'none';

        runOcr(file, function (err, text) {
          if (err) {
            if (wrap) wrap.style.display = 'none';
            if (errWrap) {
              errWrap.style.display = 'block';
              var errMsg = document.getElementById('piErrorMsg');
              if (errMsg) errMsg.textContent = 'No se pudo leer la imagen: ' + (err.message || err);
            }
            return;
          }
          var candidates = parseOcrText(text || '');
          window._piGoToReview(candidates, imgUrl, dateVal);
        });
      });
    };
    tryAttach();
  }

  /* ─── Exportar al ámbito global ────────────────────────────────────────── */
  window.photoImport = photoImport;

})();
