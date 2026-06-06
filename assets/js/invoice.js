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

    /* — Estado de cobro — */
    var saldo    = bal(i);
    var cobrado  = total - saldo;
    var estadoCobro = '';
    if (saldo === 0 && total > 0) {
      estadoCobro = '<div class="invBadgePagada">PAGADA</div>';
    } else if (cobrado > 0 && saldo > 0) {
      estadoCobro =
        '<div class="invBadgeParcial">' +
          'Cobrado ' + fmt(cobrado) +
          ' · <strong>Pendiente ' + fmt(saldo) + '</strong>' +
        '</div>';
    } else if (saldo > 0) {
      estadoCobro = '<div class="invBadgePendiente">Pendiente de cobro: ' + fmt(saldo) + '</div>';
    }

    /* — Marca de agua ANULADA — */
    var anuladaHTML = '';
    if (i.st === 'anulada') {
      anuladaHTML = '<div class="invAnulada">ANULADA</div>';
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
        anuladaHTML +

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
            '<div class="invFacLabel">FACTURA</div>' +
            '<div class="invNumNum">' + esc(i.num || '—') + '</div>' +
            '<div class="invNumLine"><span>Emisión:</span> ' + fmtDate(i.date) + '</div>' +
            '<div class="invNumLine"><span>Vencimiento:</span> ' + fmtDate(i.due) + '</div>' +
          '</div>' +
        '</header>' +

        '<hr class="invSep">' +

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

        /* Estado de cobro */
        (estadoCobro ? '<div class="invEstadoCobro">' + estadoCobro + '</div>' : '') +

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

})();
