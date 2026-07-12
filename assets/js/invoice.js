/* invoice.js – Plantilla profesional de factura para Sesiona
   Se carga el último: sobreescribe seeInvoice definida en app.js.
   Dependencias globales: fmt, client, S, openM, bal, sendInvoice, print
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  /* ── Helpers de escapado ─────────────────────────────────────────── */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  /* ── Generador del HTML del documento de factura ─────────────────── */
  function buildInvoiceHTML(id) {
    var i = S.invoices.find(function (x) { return x.id == id; });
    if (!i) return '<p>Factura no encontrada.</p>';

    var c  = client(i.c) || {};
    var s  = S.set || {};

    /* — Datos del emisor — */
    var emisorNombre = esc(s.fiscal || s.pro || 'Profesional');
    var emisorNif    = esc(s.nif   || '');
    var emisorCol    = esc(s.col   || '');
    var emisorAddr   = esc(s.addr  || '');
    var emisorEmail  = esc(s.email || '');
    var emisorPhone  = esc(s.phone || '');

    /* — Logo (dataURL opcional) — */
    var logoHTML = '';
    if (s.logo && String(s.logo).length > 10) {
      logoHTML = '<img class="invLogo" src="' + esc(s.logo) + '" alt="Logo">';
    }

    /* — Datos del cliente — */
    var clienteNombre = esc((c.name || '') + (c.sur ? ' ' + c.sur : ''));
    var clienteNif    = esc(c.nif || 'Sin NIF');
    var clienteAddr   = c.addr ? '<br>' + esc(c.addr) : '';

    /* — Importes — */
    var base  = Number(i.base  || 0);
    var igic  = Number(i.igic  || 0);
    var irpf  = Number(i.irpf  || 0);
    var total = Number(i.total || 0);
    var reg   = i.reg || 'exento';

    /* — Línea IGIC según régimen — */
    var igicLabel = '';
    var igicValor = '';
    if (reg === 'exento') {
      igicLabel = 'IGIC <span class="invRegBadge">Exento actividad sanitaria</span>';
      igicValor = '—';
    } else if (reg === 'general') {
      var pct = s.igic ? Number(s.igic) : 7;
      igicLabel = 'IGIC (' + pct + '%)';
      igicValor = fmt(igic);
    } else {
      igicLabel = 'IGIC <span class="invRegBadge warn">Revisar</span>';
      igicValor = fmt(igic);
    }

    /* — Estado de cobro (sello) — */
    var saldo    = bal(i);
    var cobrado  = total - saldo;
    var stampHTML  = '';
    var estadoCobro = '';
    if (saldo === 0 && total > 0) {
      stampHTML = '<div class="invStamp invStamp-pagada">Pagada</div>';
    } else if (cobrado > 0 && saldo > 0) {
      stampHTML = '<div class="invStamp invStamp-parcial">Pago parcial</div>';
      estadoCobro =
        '<div class="invBadgeParcial">' +
          'Cobrado ' + fmt(cobrado) +
          ' · <strong>Pendiente ' + fmt(saldo) + '</strong>' +
        '</div>';
    } else if (saldo > 0) {
      stampHTML = '<div class="invStamp invStamp-pendiente">Pendiente de cobro</div>';
      estadoCobro = '<div class="invBadgePendiente">Importe pendiente: ' + fmt(saldo) + '</div>';
    }

    /* — Marca de agua ANULADA — */
    var anuladaHTML = '';
    if (i.st === 'anulada') {
      anuladaHTML = '<div class="invAnulada">ANULADA</div>';
    }

    /* — Aviso si el régimen de IGIC está pendiente de revisar —
       calc() trata "revisar" como 0 de IGIC; no debe pasar en silencio. */
    var avisoRevisarHTML = '';
    if (reg !== 'exento' && reg !== 'general') {
      avisoRevisarHTML =
        '<div class="invAvisoRevisar">⚠ Régimen de IGIC del cliente pendiente de revisar: ' +
        'esta factura se ha emitido <strong>sin IGIC</strong>. Confirmar con la gestoría ' +
        'antes de darla por definitiva.</div>';
    }

    /* — Pie legal — */
    var pieTexto = esc(s.foot || 'Cálculo orientativo. Revisar con gestoría.');
    var pagoTexto = esc(s.pay || '');
    var ibanTexto = esc(s.iban || '');

    /* ── Construcción del HTML ─────────────────────────────────────── */
    var html =
      /* ── Barra de acciones (no imprime) ── */
      '<div class="invActions no-print">' +
        '<button class="btn" onclick="print()">🖨 Imprimir / PDF</button>' +
        '<button class="btn alt" onclick="sendInvoice(\'' + id + '\')">📲 Enviar WhatsApp</button>' +
        '<button class="btn alt" onclick="dlg.close()">✕ Cerrar</button>' +
      '</div>' +

      /* ── Documento ── */
      '<div class="invoiceDoc">' +
        '<div class="invTopBar"></div>' +
        anuladaHTML +
        stampHTML +

        /* Cabecera */
        '<header class="invHeader">' +
          '<div class="invEmisor">' +
            (logoHTML ? '<div class="invLogoWrap">' + logoHTML + '</div>' : '') +
            '<div class="invEmisorName">' + emisorNombre + '</div>' +
            (emisorNif   ? '<div class="invEmisorLine">NIF: ' + emisorNif + '</div>'                 : '') +
            (emisorCol   ? '<div class="invEmisorLine">Colegiada n.º ' + emisorCol + '</div>'        : '') +
            (emisorAddr  ? '<div class="invEmisorLine">' + emisorAddr + '</div>'                     : '') +
            (emisorEmail ? '<div class="invEmisorLine">' + emisorEmail + '</div>'                    : '') +
            (emisorPhone ? '<div class="invEmisorLine">Tel. ' + emisorPhone + '</div>'               : '') +
          '</div>' +
          '<div class="invNumBloque">' +
            '<div class="invFacLabel">Factura</div>' +
            '<div class="invNumNum">' + esc(i.num || '—') + '</div>' +
            '<div class="invNumLine"><span>Emisión</span> ' + fmtDate(i.date) + '</div>' +
            '<div class="invNumLine"><span>Vencimiento</span> ' + fmtDate(i.due) + '</div>' +
          '</div>' +
        '</header>' +

        /* Datos del cliente */
        '<section class="invClienteBloque">' +
          '<div class="invClienteLabel">Facturar a</div>' +
          '<div class="invClienteNombre">' + clienteNombre + '</div>' +
          '<div class="invClienteInfo">NIF: ' + clienteNif + clienteAddr + '</div>' +
        '</section>' +

        /* Tabla de conceptos */
        '<table class="invTable">' +
          '<thead>' +
            '<tr>' +
              '<th class="invThDesc">Concepto</th>' +
              '<th class="invThNum">Base</th>' +
              '<th class="invThNum">IGIC</th>' +
              '<th class="invThNum">IRPF</th>' +
              '<th class="invThNum">Importe</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr class="invRow">' +
              '<td class="invTdDesc">' + esc(i.concept || 'Servicio profesional') + '</td>' +
              '<td class="invTdNum">' + fmt(base) + '</td>' +
              '<td class="invTdNum">' + (reg === 'exento' ? '—' : fmt(igic)) + '</td>' +
              '<td class="invTdNum">' + (irpf > 0 ? '-' + fmt(irpf) : '—') + '</td>' +
              '<td class="invTdNum invTdTotal">' + fmt(total) + '</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +

        /* Bloque de totales */
        '<div class="invTotalesWrap">' +
          '<div class="invTotalesBloque">' +
            '<div class="invTotalRow">' +
              '<span>Base imponible</span><span>' + fmt(base) + '</span>' +
            '</div>' +
            '<div class="invTotalRow">' +
              '<span>' + igicLabel + '</span><span>' + igicValor + '</span>' +
            '</div>' +
            (irpf > 0 ?
              '<div class="invTotalRow">' +
                '<span>IRPF retenido</span><span>-' + fmt(irpf) + '</span>' +
              '</div>'
            : '') +
            '<div class="invTotalRow invTotalFinal">' +
              '<span>TOTAL</span><span>' + fmt(total) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Estado de cobro */
        (estadoCobro ? '<div class="invEstadoCobro">' + estadoCobro + '</div>' : '') +

        /* Aviso IGIC pendiente de revisar */
        avisoRevisarHTML +

        '<hr class="invSep">' +

        /* Forma de pago */
        '<section class="invPago">' +
          '<div class="invPagoLabel">Forma de pago</div>' +
          (pagoTexto ? '<div class="invPagoTexto">' + pagoTexto + '</div>' : '') +
          (ibanTexto ? '<div class="invIban">' + ibanTexto + '</div>' : '') +
        '</section>' +

        /* Pie legal */
        '<footer class="invPie">' +
          pieTexto +
        '</footer>' +

      '</div>';  /* /invoiceDoc */

    return html;
  }

  /* ── Redefinición global de seeInvoice ──────────────────────────── */
  window.seeInvoice = function (id) {
    openM(buildInvoiceHTML(id));
  };

  /* ════════════════════════════════════════════════════════════════
     Envío por WhatsApp CON el PDF de la factura adjunto.
     WhatsApp (wa.me) no admite adjuntar archivos por enlace, así que:
       · Móvil con Web Share API → comparte el PDF (WhatsApp como destino).
       · Resto → descarga el PDF y abre el chat con el texto para adjuntarlo.
     El PDF se genera en el cliente con html2pdf.js (carga diferida por CDN).
     ════════════════════════════════════════════════════════════════ */
  var _h2pLoaded = false, _h2pLoading = false, _h2pCbs = [];
  /* Copia vendorizada primero (funciona offline); CDN como respaldo. */
  var H2P_SOURCES = [
    '/assets/vendor/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js'
  ];
  function loadScriptSeq(urls, done) {
    if (!urls.length) {
      done(new Error('No se pudo cargar el generador de PDF (sin conexión o bloqueado).'));
      return;
    }
    var s = document.createElement('script');
    s.src = urls[0];
    s.onload = function () { done(null); };
    s.onerror = function () {
      s.remove();
      loadScriptSeq(urls.slice(1), done);
    };
    document.head.appendChild(s);
  }
  function loadHtml2Pdf(cb) {
    if (_h2pLoaded || window.html2pdf) { _h2pLoaded = true; cb(null); return; }
    _h2pCbs.push(cb);
    if (_h2pLoading) return;
    _h2pLoading = true;
    loadScriptSeq(H2P_SOURCES, function (err) {
      _h2pLoading = false;
      if (!err) _h2pLoaded = true;
      _h2pCbs.forEach(function (f) { f(err); }); _h2pCbs = [];
    });
  }

  function makeInvoicePdfFile(id, cb) {
    loadHtml2Pdf(function (err) {
      if (err) { cb(err); return; }
      var i = S.invoices.find(function (x) { return x.id == id; });
      if (!i) { cb(new Error('Factura no encontrada.')); return; }
      var holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;';
      holder.innerHTML = buildInvoiceHTML(id);
      document.body.appendChild(holder);
      var docEl = holder.querySelector('.invoiceDoc') || holder;
      var fname = 'Factura-' + String(i.num || id).replace(/[^\w.-]+/g, '_') + '.pdf';
      function cleanup() { try { document.body.removeChild(holder); } catch (e) {} }
      try {
        window.html2pdf().set({
          margin: [8, 8, 10, 8],
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(docEl).outputPdf('blob').then(function (blob) {
          cleanup();
          var file;
          try { file = new File([blob], fname, { type: 'application/pdf' }); }
          catch (e) { file = blob; file.name = fname; }
          cb(null, file);
        }).catch(function (e) { cleanup(); cb(e); });
      } catch (e) { cleanup(); cb(e); }
    });
  }

  function downloadFile(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = file.name || 'factura.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var _pdf = { file: null, msg: '', id: null };

  function invMsg(i) {
    var c = client(i.c) || {};
    if (typeof msgInv === 'function') return msgInv(i);
    return 'Hola ' + (c.name || '') + ', te envío la factura ' + (i.num || '') + ' por importe de ' + fmt(i.total) + '. Gracias.';
  }

  function markSentAndClose(id) {
    var i = S.invoices.find(function (x) { return x.id == id; });
    if (i) i.sent = true;
    save();
    var dlg = document.getElementById('dlg');
    if (dlg && dlg.close) dlg.close();
    render();
  }

  function openChatText(id, msg) {
    var i = S.invoices.find(function (x) { return x.id == id; });
    if (typeof wa === 'function') wa(client(i.c), msg);
  }

  /* Acciones disparadas por click del usuario (mantienen activación de usuario) */
  window.__invShare = function () {
    if (!_pdf.file) return;
    // Algunos navegadores móviles no admiten compartir archivo + texto juntos:
    // si no se puede con texto, compartimos solo el PDF.
    var withText = { files: [_pdf.file], text: _pdf.msg, title: 'Factura' };
    var filesOnly = { files: [_pdf.file] };
    var payload = (navigator.canShare && navigator.canShare(withText)) ? withText : filesOnly;
    try {
      navigator.share(payload)
        .then(function () { markSentAndClose(_pdf.id); })
        .catch(function (err) {
          // AbortError = el usuario canceló: no hacemos nada.
          if (err && err.name === 'AbortError') return;
          // Otro error: dejamos el PDF descargado y abrimos el chat con el texto.
          downloadFile(_pdf.file); openChatText(_pdf.id, _pdf.msg); markSentAndClose(_pdf.id);
        });
    } catch (e) {
      downloadFile(_pdf.file); openChatText(_pdf.id, _pdf.msg); markSentAndClose(_pdf.id);
    }
  };
  window.__invDownload = function () {
    if (_pdf.file) downloadFile(_pdf.file);
    openChatText(_pdf.id, _pdf.msg);
    markSentAndClose(_pdf.id);
  };
  window.__invText = function () {
    openChatText(_pdf.id, _pdf.msg);
    markSentAndClose(_pdf.id);
  };

  /* Override del envío de factura: genera PDF y ofrece compartir/descargar */
  window.sendInvoice = function (id) {
    var i = S.invoices.find(function (x) { return x.id == id; });
    if (!i) return;
    _pdf = { file: null, msg: invMsg(i), id: id };
    openM(
      '<h2>Enviar factura ' + esc(i.num || '') + '</h2>' +
      '<div id="invSendBody">' +
        '<p class="notice">Preparando el PDF de la factura…</p>' +
        '<div style="background:#eaf5f2;border-radius:6px;height:8px;overflow:hidden;margin-top:10px">' +
          '<div style="height:100%;width:40%;background:#315f73;border-radius:6px;animation:none"></div>' +
        '</div>' +
      '</div>' +
      '<div class="actions" style="margin-top:14px"><button class="btn alt" onclick="dlg.close()">Cancelar</button></div>'
    );
    makeInvoicePdfFile(id, function (err, file) {
      var body = document.getElementById('invSendBody');
      if (!body) return;
      if (err || !file) {
        _pdf.file = null;
        body.innerHTML =
          '<p class="notice" style="border-color:#efc9c4;color:#a94444">No se pudo generar el PDF automáticamente. Puedes enviar la factura por WhatsApp como texto.</p>' +
          '<div class="actions"><button class="btn" onclick="window.__invText()">💬 Enviar por WhatsApp (texto)</button>' +
          '<button class="btn alt" onclick="seeInvoice(\'' + esc(id) + '\')">Ver factura</button></div>';
        return;
      }
      _pdf.file = file;
      var canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
      body.innerHTML =
        '<div class="success"><b>PDF listo</b><p>' + esc(file.name) + '</p></div>' +
        (canShare
          ? '<button class="btn" onclick="window.__invShare()">📎 Enviar por WhatsApp con PDF</button>'
          : '<p class="notice">En este dispositivo no se puede adjuntar directamente. Descarga el PDF y adjúntalo en el chat de WhatsApp que se abrirá.</p>') +
        '<div class="actions" style="margin-top:10px">' +
          '<button class="btn alt" onclick="window.__invDownload()">⬇ Descargar PDF + abrir WhatsApp</button>' +
          '<button class="btn alt" onclick="window.__invText()">💬 Solo texto</button>' +
        '</div>';
    });
  };

})();
