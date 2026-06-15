/* cloud.js – Sincronización opcional con PocketBase para Sesiona
   Offline-first y opt-in: si S.set.pbUrl está vacío o no hay sesión,
   este módulo no hace NADA y la app funciona exactamente igual que antes.
   No rompe si no hay red, no carga el SDK hasta que se necesita, y no
   rompe la carga en jsdom (tests) si PocketBase no está disponible.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/pocketbase@0.21.5/dist/pocketbase.umd.js';
  var _sdkLoading = false;
  var _sdkLoaded = false;
  var _sdkCallbacks = [];
  var pb = null;

  var COLLECTIONS = ['clients', 'sessions', 'invoices', 'payments', 'expenses'];

  /* ── Carga diferida del SDK ──────────────────────────────────────── */
  function loadSdk(cb) {
    cb = cb || function () {};
    if (typeof window.PocketBase === 'function') { _sdkLoaded = true; cb(null); return; }
    if (_sdkLoaded) { cb(null); return; }
    _sdkCallbacks.push(cb);
    if (_sdkLoading) return;
    _sdkLoading = true;
    try {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        _sdkLoading = false;
        if (typeof window.PocketBase === 'function') {
          _sdkLoaded = true;
          _sdkCallbacks.forEach(function (f) { try { f(null); } catch (e) {} });
        } else {
          _sdkCallbacks.forEach(function (f) { try { f(new Error('PocketBase SDK no disponible')); } catch (e) {} });
        }
        _sdkCallbacks = [];
      };
      s.onerror = function () {
        _sdkLoading = false;
        _sdkCallbacks.forEach(function (f) { try { f(new Error('No se pudo cargar el SDK de PocketBase')); } catch (e) {} });
        _sdkCallbacks = [];
      };
      document.head.appendChild(s);
    } catch (e) {
      _sdkLoading = false;
      _sdkCallbacks.forEach(function (f) { try { f(e); } catch (e2) {} });
      _sdkCallbacks = [];
    }
  }

  /* ── Instancia pb ────────────────────────────────────────────────── */
  function getPb() {
    if (pb) return pb;
    if (typeof window.PocketBase !== 'function') return null;
    try {
      pb = new window.PocketBase((S && S.set && S.set.pbUrl) || '');
    } catch (e) {
      pb = null;
    }
    return pb;
  }

  /* ── Estado de configuración / sesión ───────────────────────────── */
  window.cloudConfigured = function () {
    return !!(S && S.set && S.set.pbUrl);
  };

  window.cloudLoggedIn = function () {
    return !!(window.cloudConfigured() && pb && pb.authStore && pb.authStore.isValid);
  };

  window.cloudStatusHtml = function () {
    if (!window.cloudConfigured()) return 'Sin configurar';
    if (!window.cloudLoggedIn()) return 'Configurado · sin sesión';
    var email = (pb && pb.authStore && pb.authStore.model && pb.authStore.model.email) || '';
    return 'Conectado: ' + esc(email);
  };

  /* ── Debounce simple ─────────────────────────────────────────────── */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(ctx, args);
      }, wait);
    };
  }

  /* ── Mapeo local <-> nube ────────────────────────────────────────── */
  function toCloudRecord(coll, obj, userId) {
    var rec = { user: userId, aid: obj.id };
    if (coll === 'clients') {
      rec.name = obj.name; rec.sur = obj.sur; rec.nif = obj.nif; rec.phone = obj.phone;
      rec.price = obj.price; rec.irpf = obj.irpf; rec.type = obj.type; rec.igicReg = obj.igicReg;
      rec.amigo = obj.amigo; rec.notes = obj.notes;
    } else if (coll === 'sessions') {
      rec.clientAid = obj.c; rec.start = obj.start; rec.price = obj.price; rec.st = obj.st;
      rec.notes = obj.notes; rec.inv = obj.inv; rec.rem = obj.rem; rec.noBill = obj.noBill;
      rec.reminderSentAt = obj.reminderSentAt; rec.confirmStatus = obj.confirmStatus; rec.confirmAt = obj.confirmAt;
    } else if (coll === 'invoices') {
      rec.num = obj.num; rec.date = obj.date; rec.due = obj.due; rec.concept = obj.concept;
      rec.base = obj.base; rec.igic = obj.igic; rec.irpf = obj.irpf; rec.total = obj.total;
      rec.st = obj.st; rec.reg = obj.reg; rec.sent = obj.sent; rec.clientAid = obj.c;
    } else if (coll === 'payments') {
      rec.invAid = obj.inv; rec.date = obj.date; rec.amount = obj.amount; rec.method = obj.method;
    } else if (coll === 'expenses') {
      rec.prov = obj.prov; rec.date = obj.date; rec.total = obj.total; rec.igic = obj.igic;
      rec.cat = obj.cat; rec.ded = obj.ded; rec.doc = obj.doc;
    }
    return rec;
  }

  function fromCloudRecord(coll, rec) {
    var obj = { id: rec.aid };
    if (coll === 'clients') {
      obj.name = rec.name; obj.sur = rec.sur; obj.nif = rec.nif; obj.phone = rec.phone;
      obj.price = rec.price; obj.irpf = rec.irpf; obj.type = rec.type; obj.igicReg = rec.igicReg;
      obj.amigo = rec.amigo; obj.notes = rec.notes;
    } else if (coll === 'sessions') {
      obj.c = rec.clientAid; obj.start = rec.start; obj.price = rec.price; obj.st = rec.st;
      obj.notes = rec.notes; obj.inv = rec.inv; obj.rem = rec.rem; obj.noBill = rec.noBill;
      obj.reminderSentAt = rec.reminderSentAt; obj.confirmStatus = rec.confirmStatus; obj.confirmAt = rec.confirmAt;
    } else if (coll === 'invoices') {
      obj.c = rec.clientAid; obj.num = rec.num; obj.date = rec.date; obj.due = rec.due;
      obj.concept = rec.concept; obj.base = rec.base; obj.igic = rec.igic; obj.irpf = rec.irpf;
      obj.total = rec.total; obj.st = rec.st; obj.reg = rec.reg; obj.sent = rec.sent;
    } else if (coll === 'payments') {
      obj.inv = rec.invAid; obj.date = rec.date; obj.amount = rec.amount; obj.method = rec.method;
    } else if (coll === 'expenses') {
      obj.prov = rec.prov; obj.date = rec.date; obj.total = rec.total; obj.igic = rec.igic;
      obj.cat = rec.cat; obj.ded = rec.ded; obj.doc = rec.doc;
    }
    return obj;
  }

  function localArrayFor(coll) {
    if (coll === 'clients') return S.clients;
    if (coll === 'sessions') return S.sessions;
    if (coll === 'invoices') return S.invoices;
    if (coll === 'payments') return S.payments;
    if (coll === 'expenses') return S.expenses;
    return [];
  }

  /* ── Subida completa (upsert por user+aid) ──────────────────────── */
  window.cloudPushAll = function () {
    var p = getPb();
    if (!window.cloudLoggedIn() || !p) return Promise.resolve();
    var userId = p.authStore.model.id;
    return (function () {
      var chain = Promise.resolve();

      // settings
      chain = chain.then(function () {
        return pushOne('settings', { user: userId, data: settingsForCloud() }, 'user="' + userId + '"');
      });

      COLLECTIONS.forEach(function (coll) {
        var items = localArrayFor(coll);
        items.forEach(function (obj) {
          chain = chain.then(function () {
            var rec = toCloudRecord(coll, obj, userId);
            var filter = 'user="' + userId + '" && aid="' + obj.id + '"';
            return pushOne(coll, rec, filter);
          });
        });
      });

      return chain;
    })();

    function settingsForCloud() {
      var data = {};
      for (var k in S.set) {
        if (k === 'pbUrl') continue;
        data[k] = S.set[k];
      }
      return data;
    }

    function pushOne(coll, rec, filter) {
      return p.collection(coll).getFirstListItem(filter).then(function (existing) {
        return p.collection(coll).update(existing.id, rec).catch(function () {});
      }, function () {
        return p.collection(coll).create(rec).catch(function () {});
      }).catch(function () {});
    }
  };

  /* ── Sincronización inicial tras login ──────────────────────────── */
  window.syncInitial = function () {
    var p = getPb();
    if (!window.cloudLoggedIn() || !p) return Promise.resolve();
    var userId = p.authStore.model.id;
    var filter = 'user="' + userId + '"';
    var data = {};

    return p.collection('settings').getFirstListItem(filter).catch(function () { return null; })
      .then(function (settingsRec) {
        data.settings = settingsRec;
        return p.collection('clients').getFullList({ filter: filter }).catch(function () { return []; });
      })
      .then(function (clients) {
        data.clients = clients;
        return p.collection('sessions').getFullList({ filter: filter }).catch(function () { return []; });
      })
      .then(function (sessions) {
        data.sessions = sessions;
        return p.collection('invoices').getFullList({ filter: filter }).catch(function () { return []; });
      })
      .then(function (invoices) {
        data.invoices = invoices;
        return p.collection('payments').getFullList({ filter: filter }).catch(function () { return []; });
      })
      .then(function (payments) {
        data.payments = payments;
        return p.collection('expenses').getFullList({ filter: filter }).catch(function () { return []; });
      })
      .then(function (expenses) {
        data.expenses = expenses;

        var hasCloudData = !!data.settings || data.clients.length > 0;

        if (hasCloudData) {
          var hasLocalData = (S.clients && S.clients.length) || (S.sessions && S.sessions.length) ||
            (S.invoices && S.invoices.length) || (S.payments && S.payments.length) || (S.expenses && S.expenses.length);
          if (hasLocalData) {
            var proceed = confirm('Hay datos guardados en la nube para esta cuenta. Se reemplazarán los datos locales de este dispositivo por los de la nube. ¿Continuar?');
            if (!proceed) return;
          }

          var pbUrl = S.set.pbUrl;
          if (data.settings && data.settings.data) {
            S.set = data.settings.data;
            S.set.pbUrl = pbUrl;
          }
          S.clients = data.clients.map(function (r) { return fromCloudRecord('clients', r); });
          S.sessions = data.sessions.map(function (r) { return fromCloudRecord('sessions', r); });
          S.invoices = data.invoices.map(function (r) { return fromCloudRecord('invoices', r); });
          S.payments = data.payments.map(function (r) { return fromCloudRecord('payments', r); });
          S.expenses = data.expenses.map(function (r) { return fromCloudRecord('expenses', r); });

          window._cloudApplying = true; save(); window._cloudApplying = false;
          render();
        } else {
          return window.cloudPushAll();
        }
      });
  };

  /* ── Auth: modal de login/registro ──────────────────────────────── */
  window.cloudAuth = function () {
    if (!window.cloudConfigured()) {
      alert('Configura primero la URL de PocketBase y pulsa "Guardar URL".');
      return;
    }
    renderAuthModal();
  };

  function renderAuthModal(err) {
    var msg = err ? '<p class="notice">' + esc(err) + '</p>' : '';
    openM(
      '<h2>Cuenta en la nube</h2>' + msg +
      '<div class="field"><label>Email</label><input id="cloudEmail" type="email"></div>' +
      '<div class="field"><label>Contraseña</label><input id="cloudPass" type="password"></div>' +
      '<div class="row">' +
      '<button class="btn" onclick="window._cloudLogin&&_cloudLogin()">Iniciar sesión</button>' +
      '<button class="btn alt" onclick="window._cloudRegister&&_cloudRegister()">Crear cuenta</button>' +
      '</div>'
    );
  }

  window._cloudLogin = function () {
    var email = ($('cloudEmail') && $('cloudEmail').value || '').trim();
    var pass = ($('cloudPass') && $('cloudPass').value || '');
    loadSdk(function (err) {
      if (err) { renderAuthModal('No se pudo cargar el módulo de sincronización: ' + err.message); return; }
      var p = getPb();
      if (!p) { renderAuthModal('No se pudo iniciar el módulo de sincronización.'); return; }
      p.collection('users').authWithPassword(email, pass).then(function () {
        return window.syncInitial();
      }).then(function () {
        closeM();
        render();
      }).catch(function (e) {
        renderAuthModal((e && e.message) || 'No se pudo iniciar sesión.');
      });
    });
  };

  window._cloudRegister = function () {
    var email = ($('cloudEmail') && $('cloudEmail').value || '').trim();
    var pass = ($('cloudPass') && $('cloudPass').value || '');
    loadSdk(function (err) {
      if (err) { renderAuthModal('No se pudo cargar el módulo de sincronización: ' + err.message); return; }
      var p = getPb();
      if (!p) { renderAuthModal('No se pudo iniciar el módulo de sincronización.'); return; }
      p.collection('users').create({ email: email, password: pass, passwordConfirm: pass }).then(function () {
        return p.collection('users').authWithPassword(email, pass);
      }).then(function () {
        return window.syncInitial();
      }).then(function () {
        closeM();
        render();
      }).catch(function (e) {
        renderAuthModal((e && e.message) || 'No se pudo crear la cuenta.');
      });
    });
  };

  window.cloudLogout = function () {
    var p = getPb();
    if (p && p.authStore) p.authStore.clear();
    render();
  };

  /* ── Pull periódico: el bot actualiza estados de citas ──────────── */
  window.cloudPull = function () {
    if (!window.cloudLoggedIn()) return Promise.resolve();
    var p = getPb();
    if (!p) return Promise.resolve();
    var userId = p.authStore.model.id;
    var filter = 'user="' + userId + '"';

    return p.collection('sessions').getFullList({ filter: filter }).then(function (records) {
      var changed = false;
      records.forEach(function (rec) {
        var s = S.sessions.find(function (x) { return x.id == rec.aid; });
        if (!s) return;
        if (s.confirmStatus !== rec.confirmStatus) { s.confirmStatus = rec.confirmStatus; changed = true; }
        if (s.st !== rec.st && rec.st != null) { s.st = rec.st; changed = true; }
        if (s.reminderSentAt !== rec.reminderSentAt) { s.reminderSentAt = rec.reminderSentAt; changed = true; }
        if (s.rem !== rec.rem && rec.rem != null) { s.rem = rec.rem; changed = true; }
        if (s.confirmAt !== rec.confirmAt) { s.confirmAt = rec.confirmAt; changed = true; }
      });
      if (changed) {
        window._cloudApplying = true; save(); window._cloudApplying = false;
        render();
      }
    }).catch(function () {});
  };

  /* ── Write-through vía hook: app.js llama a window.cloudOnSave en cada save() ── */
  var debouncedPush = debounce(function () { window.cloudPushAll(); }, 1500);
  window.cloudOnSave = function () {
    if (window._cloudApplying) return;            // no re-subir lo que acabamos de bajar
    if (window.cloudLoggedIn && window.cloudLoggedIn()) debouncedPush();
  };

  /* ── Disparadores de cloudPull ──────────────────────────────────── */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && window.cloudLoggedIn && window.cloudLoggedIn()) {
      window.cloudPull();
    }
  });

  setInterval(function () {
    if (window.cloudLoggedIn && window.cloudLoggedIn()) {
      window.cloudPull();
    }
  }, 45000);

})();
