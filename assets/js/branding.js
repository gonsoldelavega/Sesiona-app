/* Sesiona · Datos fiscales por defecto (Cristina Romera)
   Solo fija los datos del emisor si aún no están configurados.
   La plantilla de la factura vive en assets/js/invoice.js (se carga después). */
(function () {
  const defaults = {
    pro: 'Cristina Romera Cherino',
    fiscal: 'Cristina Romera Cherino',
    nif: '11857073K',
    col: 'P-02269',
    city: 'Canarias'
  };
  function applyCristina() {
    S.set = Object.assign({}, S.set || {});
    Object.keys(defaults).forEach(k => {
      if (!S.set[k] || S.set[k] === 'Profesional') S.set[k] = defaults[k];
    });
    save();
  }
  applyCristina();

  // Rellena los campos de identidad fiscal en Ajustes si están vacíos.
  const oldSettings = settings;
  settings = function (r) {
    oldSettings(r);
    setTimeout(() => {
      const map = { pro: 'pro', fiscal: 'fiscal', snif: 'nif', col: 'col' };
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = S.set[map[id]] || defaults[map[id]] || '';
      });
    }, 0);
  };
  render();
})();
