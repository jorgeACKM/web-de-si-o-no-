/* Persistencia local (localStorage) multi-cliente. */
(function (root) {
  'use strict';
  const KEY = 'contapy_v1';
  const S = {};
  let db = null;

  S.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  S.load = function () {
    try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { db = null; }
    if (!db) db = { version: 1, clientes: [], activo: null, data: {} };
    return db;
  };
  S.save = function () {
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

  root.Store = S;
})(window);
