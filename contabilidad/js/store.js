/* Persistencia multi-cliente.
 * - Abierto como archivo (file://) o sin servidor: guarda en localStorage del navegador.
 * - Servido por server/server.js: inicia sesión, carga y guarda en el servidor (con copia local),
 *   detecta cambios de otros usuarios y el servidor hace respaldos automáticos. */
(function (root) {
  'use strict';
  const KEY = 'contapy_v1', KEY_ACTIVO = 'contapy_activo', KEY_TOKEN = 'contapy_token';
  const S = {};
  let db = null;
  // Modo servidor
  const srv = { activo: false, token: null, usuario: '', rol: '', version: 0, timer: null, enviando: false, pendiente: false };
  S.servidor = srv;

  S.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const vacia = () => ({ version: 1, clientes: [], activo: null, data: {} });
  S.load = function () {
    if (srv.activo) return db; // ya cargada desde el servidor
    try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { db = null; }
    if (!db) db = vacia();
    return db;
  };
  S.save = function () {
    if (srv.activo) {
      if (srv.rol === 'lectura') {
        // descartar el cambio local y volver a la versión del servidor
        setTimeout(() => { api('GET', '/api/db').then(aplicarRemota).then(() => aviso('Usuario de solo lectura: los cambios no se guardan.', true)); }, 0);
        return false;
      }
      try { localStorage.setItem(KEY_ACTIVO, db.activo || ''); } catch (e) { /* sin almacenamiento local */ }
      programarEnvio();
      return true;
    }
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { alert('No se pudo guardar (almacenamiento lleno). Exporte un respaldo y elimine clientes que no use.'); return false; }
  };
  S.db = () => db;

  S.nuevoDataCliente = () => ({
    cuentas: PlanDefault.PLAN_DEFAULT.map(c => Object.assign({}, c)),
    config: {}, tiposCambio: {}, ventas: [], compras: [], asientos: [], terceros: {}, f120: {}, f500: {},
    pagos: [], retenciones: [], bienes: [], empleados: [], planillas: {}, recurrentes: [], dividendos: [], irp: {}, extractos: {}
  });

  S.crearCliente = function (cli) {
    cli.id = S.uid();
    db.clientes.push(cli);
    db.data[cli.id] = S.nuevoDataCliente();
    db.activo = cli.id;
    S.save();
    return cli;
  };
  S.eliminarCliente = function (id) {
    db.clientes = db.clientes.filter(c => c.id !== id);
    delete db.data[id];
    if (db.activo === id) db.activo = db.clientes[0] ? db.clientes[0].id : null;
    S.save();
  };
  S.cliente = () => db.clientes.find(c => c.id === db.activo) || null;
  // Datos del cliente activo, con referencia al cliente (para cierre de ejercicio).
  S.data = function () {
    const cli = S.cliente();
    if (!cli) return null;
    const d = db.data[cli.id] || (db.data[cli.id] = S.nuevoDataCliente());
    Object.defineProperty(d, 'cliente', { value: cli, enumerable: false, configurable: true });
    return d;
  };

  S.exportarJSON = () => JSON.stringify(db, null, 1);
  S.importarJSON = function (txt, merge) {
    const nuevo = JSON.parse(txt);
    if (!nuevo || !Array.isArray(nuevo.clientes)) throw new Error('Archivo de respaldo inválido');
    if (merge) {
      nuevo.clientes.forEach(c => {
        if (!db.clientes.some(x => x.id === c.id)) db.clientes.push(c);
        db.data[c.id] = nuevo.data[c.id];
      });
    } else db = nuevo;
    if (!db.activo && db.clientes[0]) db.activo = db.clientes[0].id;
    S.save();
  };

  /* ---------------- Modo servidor ---------------- */
  function api(metodo, ruta, cuerpo) {
    return fetch(ruta, {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' }, srv.token ? { Authorization: 'Bearer ' + srv.token } : {}),
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; e.datos = j; throw e; } return j; });
  }
  function aviso(msg, error) {
    const t = document.getElementById('toast');
    if (!t) return alert(msg);
    t.textContent = msg; t.className = 'toast ' + (error ? 'error' : ''); t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 5000);
  }
  function estado(txt, cls) {
    const e = document.getElementById('sync-estado');
    if (e) { e.textContent = txt; e.className = 'sync ' + (cls || ''); }
  }
  function programarEnvio() {
    estado('guardando…', 'pend');
    clearTimeout(srv.timer);
    srv.timer = setTimeout(enviar, 700);
  }
  async function enviar() {
    if (srv.enviando) { srv.pendiente = true; return; }
    srv.enviando = true;
    try {
      const r = await api('PUT', '/api/db', { version: srv.version, db });
      srv.version = r.version;
      estado('guardado ✔', 'ok');
    } catch (e) {
      if (e.status === 409) {
        aviso('Otro usuario modificó los datos. Se cargó la versión más reciente; repita su último cambio.', true);
        aplicarRemota(e.datos);
      } else if (e.status === 401) { aviso('La sesión venció. Vuelva a ingresar.', true); sessionStorage.removeItem(KEY_TOKEN); location.reload(); }
      else { estado('sin conexión – reintentando', 'err'); setTimeout(programarEnvio, 5000); }
    } finally {
      srv.enviando = false;
      if (srv.pendiente) { srv.pendiente = false; programarEnvio(); }
    }
  }
  function aplicarRemota(j) {
    const activo = db && db.activo;
    db = j.db || vacia();
    srv.version = j.version || 0;
    let local = '';
    try { local = localStorage.getItem(KEY_ACTIVO) || ''; } catch (e) { /* */ }
    db.activo = [activo, local].find(id => id && db.clientes.some(c => c.id === id)) || (db.clientes[0] || {}).id || null;
    if (root.App && root.App.render) { root.App.refrescarPlan(); root.App.render(); }
  }
  // Consulta periódica de cambios de otros usuarios
  async function sondear() {
    if (srv.enviando || srv.timer && document.getElementById('sync-estado') && /guardando/.test(document.getElementById('sync-estado').textContent)) return;
    try { const j = await api('GET', '/api/version'); if (j.version !== srv.version) { aplicarRemota(await api('GET', '/api/db')); estado('actualizado desde el servidor', 'ok'); } } catch (e) { /* sin conexión */ }
  }
  function pedirLogin(msg) {
    return new Promise(resolve => {
      const div = document.createElement('div');
      div.className = 'login-fondo';
      div.innerHTML = `<form class="login card"><h2>ContaPY – Ingreso</h2>${msg ? `<p class="err">${msg}</p>` : ''}
        <label>Usuario <input name="u" autocomplete="username" required></label>
        <label>Contraseña <input name="c" type="password" autocomplete="current-password" required></label>
        <button class="primary">Ingresar</button></form>`;
      document.body.appendChild(div);
      div.querySelector('input').focus();
      div.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        try {
          const r = await api('POST', '/api/login', { usuario: div.querySelector('[name=u]').value, clave: div.querySelector('[name=c]').value });
          div.remove(); resolve(r);
        } catch (e) { div.remove(); resolve(pedirLogin(e.message || 'No se pudo ingresar')); }
      };
    });
  }
  function barraUsuario() {
    const top = document.querySelector('.topbar');
    if (!top || document.getElementById('sync-estado')) return;
    const span = document.createElement('div');
    span.className = 'usuario';
    span.innerHTML = `<span>👤 ${srv.usuario} <small>(${srv.rol})</small></span> <span id="sync-estado" class="sync ok">conectado</span> ${srv.rol === 'admin' ? '<button id="btn-respaldos" type="button">Respaldos</button>' : ''} <button id="btn-salir" type="button">Salir</button>`;
    top.appendChild(span);
    document.getElementById('btn-salir').onclick = async () => { try { await api('POST', '/api/logout'); } catch (e) { /* */ } sessionStorage.removeItem(KEY_TOKEN); location.reload(); };
    const br = document.getElementById('btn-respaldos');
    if (br) br.onclick = async () => {
      const l = await api('GET', '/api/respaldos');
      const nom = prompt(`Respaldos automáticos en el servidor (${l.length}). Escriba el nombre para descargarlo:\n\n${l.slice(0, 15).map(x => x.nombre).join('\n')}`, l[0] ? l[0].nombre : '');
      if (!nom) return;
      const r = await fetch('/api/respaldos/' + encodeURIComponent(nom), { headers: { Authorization: 'Bearer ' + srv.token } });
      if (!r.ok) return aviso('No se encontró el respaldo', true);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = nom; a.click();
    };
  }
  // Se llama antes de iniciar la interfaz.
  S.iniciar = async function () {
    if (!/^https?:/.test(location.protocol)) return;
    try { const p = await api('GET', '/api/ping'); if (!p || p.app !== 'contapy') return; } catch (e) { return; }
    srv.activo = true;
    srv.token = sessionStorage.getItem(KEY_TOKEN);
    let yo = null;
    if (srv.token) { try { yo = await api('GET', '/api/yo'); } catch (e) { srv.token = null; } }
    if (!yo) { yo = await pedirLogin(); srv.token = yo.token; sessionStorage.setItem(KEY_TOKEN, yo.token); }
    srv.usuario = yo.usuario; srv.rol = yo.rol;
    db = null;
    aplicarRemota(await api('GET', '/api/db'));
    barraUsuario();
    setInterval(sondear, 15000);
    window.addEventListener('beforeunload', e => { if (srv.timer && /guardando/.test((document.getElementById('sync-estado') || {}).textContent || '')) { e.preventDefault(); e.returnValue = ''; } });
  };

  root.Store = S;
})(window);
