/* Inventario y costo de ventas, liquidación mensual de IVA, asientos de cierre de ejercicio
 * (previsión de incobrables, vacaciones, provisión de IRE, reserva legal), saldos iniciales,
 * asientos informativos de apertura y cierre, Libro Inventario y regímenes IRE SIMPLE y RESIMPLE. Sin DOM. */
(function (root) {
  'use strict';
  const C = root.Conta || (typeof require !== 'undefined' ? require('./core-ext.js') : null);
  const L = (...a) => C._linea(...a), K = l => C._compactar(l);
  const ord = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  const finEj = (anio, cm) => C.rangoEjercicio(anio, cm);
  const cmes = data => (data.cliente && data.cliente.cierreMes) || 12;

  /* =================== INVENTARIO =================== */
  // Producto: {codigo, descripcion, unidad, cuenta}. Movimiento: {fecha, tipo, codigo, cantidad, costoUnit, ref}
  C.TIPOS_MOV = { INICIAL: 'Inventario inicial', ENTRADA: 'Entrada (compra)', SALIDA: 'Salida (venta)', DEV_VENTA: 'Devolución de cliente', DEV_COMPRA: 'Devolución a proveedor', AJUSTE_POS: 'Ajuste (+) sobrante', AJUSTE_NEG: 'Ajuste (−) faltante' };
  const ENTRA = { INICIAL: 1, ENTRADA: 1, DEV_VENTA: 1, AJUSTE_POS: 1 };
  const ORDEN_TIPO = { INICIAL: 0, ENTRADA: 1, DEV_VENTA: 2, AJUSTE_POS: 3, DEV_COMPRA: 4, AJUSTE_NEG: 5, SALIDA: 6 };
  // Kardex por costo promedio ponderado (PPP). Devuelve movimientos valorizados y saldo final.
  C.kardex = function (data, codigo, hasta) {
    const movs = (data.movInventario || []).filter(m => m.codigo === codigo && (!hasta || m.fecha <= hasta))
      .sort((a, b) => ord(a, b) || (ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]));
    let cant = 0, valor = 0;
    const filas = movs.map(m => {
      const q = Math.abs(C.num(m.cantidad));
      const ppp = cant > 0 ? valor / cant : 0;
      let costo;
      if (m.tipo === 'INICIAL' || m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_POS') costo = C.num(m.costoUnit) || ppp;
      else if (m.tipo === 'DEV_COMPRA') costo = C.num(m.costoUnit) || ppp;
      else costo = ppp; // salidas, devoluciones de clientes y faltantes salen/entran al promedio
      const importe = Math.round(q * costo);
      if (ENTRA[m.tipo]) { cant += q; valor += importe; } else { cant -= q; valor -= importe; }
      if (Math.abs(cant) < 1e-9) { cant = 0; valor = 0; }
      return Object.assign({}, m, { cantidad: q, costoUnit: costo, importe, entra: !!ENTRA[m.tipo], saldoCant: cant, saldoValor: Math.round(valor), ppp: cant ? valor / cant : 0 });
    });
    return { filas, cantidad: cant, valor: Math.round(valor), ppp: cant ? valor / cant : 0, negativo: filas.some(f => f.saldoCant < 0) };
  };
  C.valuacionInventario = function (data, fecha) {
    const cfg = C.config(data);
    const prods = data.productos || [];
    const filas = prods.map(p => { const k = C.kardex(data, p.codigo, fecha); return { codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, cuenta: p.cuenta || cfg.ctaMercaderias, cantidad: k.cantidad, ppp: k.ppp, valor: k.valor, negativo: k.negativo }; })
      .filter(f => f.cantidad || f.valor);
    const porCuenta = {};
    filas.forEach(f => { porCuenta[f.cuenta] = (porCuenta[f.cuenta] || 0) + f.valor; });
    return { filas, porCuenta, total: filas.reduce((s, f) => s + f.valor, 0) };
  };
  // Método permanente: costo de las salidas y ajustes, un asiento por mes.
  C.asientosInventarioPermanente = function (data, cfg) {
    if (cfg.inventarioMetodo !== 'PERMANENTE' || !(data.movInventario || []).length) return [];
    const porMes = {};
    (data.productos || []).forEach(p => {
      const cta = p.cuenta || cfg.ctaMercaderias;
      C.kardex(data, p.codigo).filas.forEach(f => {
        let contra = null, signo = 0;
        if (f.tipo === 'SALIDA') { contra = cfg.ctaCMV; signo = -1; }
        else if (f.tipo === 'DEV_VENTA') { contra = cfg.ctaCMV; signo = 1; }
        else if (f.tipo === 'AJUSTE_NEG') { contra = cfg.ctaDifInventario; signo = -1; }
        else if (f.tipo === 'AJUSTE_POS') { contra = cfg.ctaDifInventario; signo = 1; }
        if (!contra || !f.importe) return;
        const p2 = f.fecha.slice(0, 7), m = porMes[p2] || (porMes[p2] = []);
        m.push(signo > 0 ? L(cta, f.importe, 0) : L(cta, 0, f.importe));
        m.push(signo > 0 ? L(contra, 0, f.importe) : L(contra, f.importe, 0));
      });
    });
    return Object.keys(porMes).sort().map(p => ({ id: 'I' + p, fecha: C.finDeMes(p), origen: 'inventario', ref: p, concepto: `Costo de ventas y ajustes de inventario ${p} (PPP)`, lineas: K(porMes[p]) }));
  };
  C.generadores.push(C.asientosInventarioPermanente);
  // Método periódico: en cada recuento, las compras pasan a mercaderías y la diferencia contra el recuento es costo de ventas.
  // conteo: {fecha, monto, cuenta?} (si no tiene monto se valoriza con el kardex)
  C.asientosInventarioPeriodico = function (data, cfg, asientos) {
    if (cfg.inventarioMetodo === 'PERMANENTE') return [];
    const conteos = (data.conteos || []).filter(c => c.fecha).slice().sort(ord);
    if (!conteos.length) return [];
    const merc = cfg.ctaMercaderias, compras = cfg.ctaCompras, cmv = cfg.ctaCMV;
    const out = [];
    let ajustesMerc = 0, transferido = 0;
    conteos.forEach((c, i) => {
      let saldoMerc = ajustesMerc, saldoCompras = -transferido;
      asientos.forEach(a => { if (a.fecha <= c.fecha && !a.cierre) a.lineas.forEach(l => { if (l.cuenta === merc) saldoMerc += l.debe - l.haber; if (l.cuenta === compras) saldoCompras += l.debe - l.haber; }); });
      const valor = c.monto !== undefined && c.monto !== '' && c.monto !== null ? C.r0(c.monto) : C.valuacionInventario(data, c.fecha).total;
      const lin = [];
      if (Math.round(saldoCompras)) { lin.push(L(merc, saldoCompras, 0), L(compras, 0, saldoCompras)); transferido += saldoCompras; }
      const dif = Math.round(valor - (saldoMerc + saldoCompras));
      if (dif) lin.push(dif > 0 ? L(merc, dif, 0) : L(merc, 0, -dif), dif > 0 ? L(cmv, 0, dif) : L(cmv, -dif, 0));
      ajustesMerc += saldoCompras + dif;
      if (lin.length) out.push({ id: 'N' + (c.id || i), fecha: c.fecha, origen: 'inventario', ref: c.id, concepto: `Inventario al ${c.fecha.split('-').reverse().join('/')} – costo de ventas (método periódico)`, lineas: K(lin) });
    });
    return out;
  };
  C.postGeneradores.unshift(C.asientosInventarioPeriodico); // antes de la diferencia de cambio

  /* =================== LIQUIDACIÓN MENSUAL DE IVA =================== */
  C.asientosLiquidacionIVA = function (data, cfg, asientos) {
    if (cfg.liquidarIVA === false || cfg.liquidarIVA === 'N') return [];
    const cuentas = [cfg.ctaIvaDF10, cfg.ctaIvaDF5, cfg.ctaIvaCF10, cfg.ctaIvaCF5, cfg.ctaRetIVARecibidas];
    const mov = {}, favorOtros = {};
    asientos.forEach(a => {
      if (!a.fecha || a.cierre) return;
      const p = a.fecha.slice(0, 7);
      a.lineas.forEach(l => {
        if (cuentas.includes(l.cuenta)) { const m = mov[p] || (mov[p] = {}); m[l.cuenta] = (m[l.cuenta] || 0) + l.debe - l.haber; }
        if (l.cuenta === cfg.ctaIvaSaldoFavor) favorOtros[p] = (favorOtros[p] || 0) + l.debe - l.haber; // saldos iniciales, pagos, etc.
      });
    });
    const out = [];
    let saldoFavor = 0;
    const meses = [...new Set(Object.keys(mov).concat(Object.keys(favorOtros)))].sort();
    meses.forEach(p => {
      saldoFavor += favorOtros[p] || 0;
      const m = mov[p] || {}, g = k => Math.round(m[k] || 0);
      const lin = [];
      cuentas.forEach(k => { const v = g(k); if (v) lin.push(v > 0 ? L(k, 0, v) : L(k, -v, 0)); }); // cierra cada cuenta del mes
      const neto = -(g(cfg.ctaIvaDF10) + g(cfg.ctaIvaDF5)) - (g(cfg.ctaIvaCF10) + g(cfg.ctaIvaCF5) + g(cfg.ctaRetIVARecibidas));
      if (neto > 0) {
        const usar = Math.max(0, Math.min(Math.round(saldoFavor), neto));
        if (usar) lin.push(L(cfg.ctaIvaSaldoFavor, 0, usar));
        if (neto - usar) lin.push(L(cfg.ctaIvaAPagar, 0, neto - usar));
        saldoFavor -= usar;
      } else if (neto < 0) { lin.push(L(cfg.ctaIvaSaldoFavor, -neto, 0)); saldoFavor += -neto; }
      if (lin.length) out.push({ id: 'Q' + p, fecha: C.finDeMes(p), origen: 'liquidación IVA', ref: p, concepto: `Liquidación de IVA ${p}`, lineas: K(lin) });
    });
    return out;
  };
  C.postGeneradores.push(C.asientosLiquidacionIVA);

  /* =================== CIERRE DE EJERCICIO =================== */
  const ejerciciosACerrar = (data, clave) => Object.keys(data.cierresEjercicio || {}).filter(y => (data.cierresEjercicio[y] || {})[clave]).map(Number).sort();
  const saldoCuenta = (asientos, cta, hasta) => { let s = 0; asientos.forEach(a => { if (a.fecha <= hasta && !a.cierre) a.lineas.forEach(l => { if (l.cuenta === cta) s += l.debe - l.haber; }); }); return s; };

  // Etapa 1: previsión para incobrables y provisión de vacaciones (afectan el resultado antes del IRE)
  C.etapasCierre.push(function (data, cfg, asientos) {
    const out = [];
    ejerciciosACerrar(data, 'prevision').forEach(y => {
      const { hasta } = finEj(y, cmes(data));
      const objetivo = Math.round(C.cuentasCorrientes(data, 'CLIENTES', hasta).reduce((t, x) => t + x.pendientes.filter(p => p.diasVencido > +cfg.previsionDias).reduce((s, p) => s + p.saldo, 0), 0) * cfg.previsionPct / 100);
      const actual = -saldoCuenta(asientos, cfg.ctaPrevision, hasta);
      const dif = objetivo - actual;
      if (dif) out.push({ id: 'Z1' + y, fecha: hasta, origen: 'cierre', ref: y, concepto: `Previsión para incobrables ejercicio ${y} (saldos vencidos > ${cfg.previsionDias} días al ${cfg.previsionPct}%)`,
        lineas: K(dif > 0 ? [L(cfg.ctaCargoPrevision, dif, 0), L(cfg.ctaPrevision, 0, dif)] : [L(cfg.ctaPrevision, -dif, 0), L(cfg.ctaCargoPrevision, 0, -dif)]) });
    });
    ejerciciosACerrar(data, 'vacaciones').forEach(y => {
      const { desde, hasta } = finEj(y, cmes(data));
      const r = C.provisionVacaciones(data, desde, hasta);
      const actual = -saldoCuenta(asientos, cfg.ctaVacacionesAPagar, hasta);
      const dif = r.total - actual;
      if (dif) out.push({ id: 'Z2' + y, fecha: hasta, origen: 'cierre', ref: y, concepto: `Provisión de vacaciones ejercicio ${y}`,
        lineas: K(dif > 0 ? [L(cfg.ctaVacacionesGasto, dif, 0), L(cfg.ctaVacacionesAPagar, 0, dif)] : [L(cfg.ctaVacacionesAPagar, -dif, 0), L(cfg.ctaVacacionesGasto, 0, -dif)]) });
    });
    return out;
  });
  // Vacaciones según antigüedad (Código Laboral: 12 días hasta 5 años, 18 de 5 a 10, 30 más de 10), proporcional a los meses del ejercicio.
  C.provisionVacaciones = function (data, desde, hasta) {
    const filas = (data.empleados || []).filter(e => e.activo !== false && C.num(e.salario) > 0).map(e => {
      const ing = e.ingreso || desde;
      const anios = C.difDias(ing, hasta) / 365.25;
      const dias = anios >= 10 ? 30 : anios >= 5 ? 18 : 12;
      const inicio = ing > desde ? ing : desde;
      const meses = Math.max(0, Math.min(12, Math.round(C.difDias(inicio, hasta) / 30.44)));
      const monto = Math.round(C.num(e.salario) / 30 * dias * meses / 12);
      return { nombre: e.nombre, ci: e.ci, salario: C.num(e.salario), antiguedad: anios, dias, meses, monto };
    });
    return { filas, total: filas.reduce((s, f) => s + f.monto, 0) };
  };

  // Impuesto a la renta del ejercicio según el régimen del cliente.
  C.regimenIRE = data => (C.config(data).regimenIRE || 'GENERAL');
  C.impuestoRentaEjercicio = function (data, plan, anio) {
    const reg = C.regimenIRE(data);
    if (reg === 'SIMPLE') { const r = C.ireSimple(data, plan, anio); return { regimen: reg, impuesto: r.impuesto, anticipos: r.anticipos, retenciones: r.retenciones }; }
    if (reg === 'RESIMPLE') return { regimen: reg, impuesto: 0, anticipos: 0, retenciones: 0 }; // la cuota fija se registra al pagarla
    const f = C.f500(data, plan, anio);
    return { regimen: reg, impuesto: f.impuesto, anticipos: f.anticipos, retenciones: f.retenciones };
  };
  // Etapa 2: provisión del IRE (gasto contra IRE a pagar, compensando anticipos y retenciones)
  C.etapasCierre.push(function (data, cfg, asientos) {
    const out = [];
    const plan = C.prepararPlan(data.cuentas);
    ejerciciosACerrar(data, 'ire').forEach(y => {
      const { hasta } = finEj(y, cmes(data));
      const r = C.impuestoRentaEjercicio(data, plan, y);
      // si ya se contabilizó IRE a mano en el ejercicio, solo se provisiona la diferencia
      const ya = plan.list.filter(c => c.rubro === 'ER_IRE' && c.imputable).reduce((s, c) => s + saldoEnEjercicio(asientos, c.codigo, finEj(y, cmes(data))), 0);
      const imp = Math.max(0, Math.round(r.impuesto - ya));
      const lin = [];
      if (imp) lin.push(L(cfg.ctaIREGasto, imp, 0), L(cfg.ctaIREAPagar, 0, imp));
      // compensación con anticipos y retenciones acumulados en sus cuentas
      const ant = Math.max(0, Math.round(saldoCuenta(asientos, cfg.ctaAnticiposIRE, hasta))), ret = Math.max(0, Math.round(saldoCuenta(asientos, cfg.ctaRetencionesIRE, hasta)));
      let resto = imp;
      const usaAnt = Math.min(ant, resto); resto -= usaAnt;
      const usaRet = Math.min(ret, resto);
      if (usaAnt) lin.push(L(cfg.ctaIREAPagar, usaAnt, 0), L(cfg.ctaAnticiposIRE, 0, usaAnt));
      if (usaRet) lin.push(L(cfg.ctaIREAPagar, usaRet, 0), L(cfg.ctaRetencionesIRE, 0, usaRet));
      if (lin.length) out.push({ id: 'Z3' + y, fecha: hasta, origen: 'cierre', ref: y, concepto: `Impuesto a la renta (${r.regimen}) ejercicio ${y}`, lineas: K(lin) });
    });
    return out;
  });
  function saldoEnEjercicio(asientos, cta, r) { let s = 0; asientos.forEach(a => { if (a.fecha >= r.desde && a.fecha <= r.hasta && !a.cierre) a.lineas.forEach(l => { if (l.cuenta === cta) s += l.debe - l.haber; }); }); return s; }
  // Etapa 3: reserva legal (al inicio del ejercicio siguiente, desde resultados acumulados)
  C.etapasCierre.push(function (data, cfg, asientos) {
    const out = [];
    const plan = C.prepararPlan(data.cuentas);
    ejerciciosACerrar(data, 'reservaLegal').forEach(y => {
      const { hasta } = finEj(y, cmes(data));
      const R = C.rubrosAl(data, plan, hasta, asientos);
      const utilidad = R.er.neto;
      if (utilidad <= 0) return;
      const capital = R.rubros.PN_CAP;
      const reservaActual = -saldoCuenta(asientos, cfg.ctaReservaLegal, hasta);
      const tope = Math.max(0, Math.round(capital * cfg.topeReservaLegalPct / 100) - reservaActual);
      const monto = Math.min(Math.round(utilidad * cfg.pctReservaLegal / 100), tope);
      if (monto > 0) out.push({ id: 'Z4' + y, fecha: C.addDias(hasta, 1), origen: 'cierre', ref: y, concepto: `Constitución de reserva legal sobre utilidades del ejercicio ${y}`,
        lineas: K([L(cfg.ctaResultadosAcum, monto, 0), L(cfg.ctaReservaLegal, 0, monto)]) });
    });
    return out;
  });

  /* =================== SALDOS INICIALES =================== */
  // filas: [[código, nombre?, debe, haber]] o [[código, nombre?, saldo]] (saldo + deudor / − acreedor)
  C.asientoSaldosIniciales = function (filas, plan, fecha, ctaDiferencia) {
    const lineas = [], errores = [];
    filas.forEach((f, i) => {
      const cod = String(f.codigo || '').trim(); if (!cod) return;
      const c = plan.by[cod];
      if (!c) { errores.push(`Fila ${i + 1}: la cuenta ${cod} no existe`); return; }
      if (!c.imputable) { errores.push(`Fila ${i + 1}: la cuenta ${cod} no es imputable`); return; }
      let d = C.r0(f.debe), h = C.r0(f.haber);
      if (f.saldo !== undefined && f.saldo !== '' && !d && !h) { const s = C.r0(f.saldo); if (s > 0) d = s; else h = -s; }
      if (d || h) lineas.push({ cuenta: cod, debe: d, haber: h });
    });
    const dif = lineas.reduce((s, l) => s + l.debe - l.haber, 0);
    if (dif && ctaDiferencia) lineas.push(dif > 0 ? { cuenta: ctaDiferencia, debe: 0, haber: dif } : { cuenta: ctaDiferencia, debe: -dif, haber: 0 });
    return { asiento: { fecha, concepto: 'Asiento de saldos iniciales', lineas }, diferencia: dif, errores };
  };

  /* =================== ASIENTOS INFORMATIVOS (LIBRO DIARIO) =================== */
  // Apertura al inicio de cada ejercicio y refundición/cierre al final, solo para presentación del Libro Diario.
  C.asientosInformativos = function (data, plan, desde, hasta) {
    const cm = cmes(data), out = [];
    const asientos = C.todosLosAsientos(data);
    for (let y = +desde.slice(0, 4) - 1; y <= +hasta.slice(0, 4) + 1; y++) {
      const r = finEj(y, cm);
      if (r.desde >= desde && r.desde <= hasta) {
        const s = C.saldosAl(data, plan, C.addDias(r.desde, -1), asientos);
        const res = Object.keys(s.saldo).filter(k => plan.by[k] && ['I', 'E'].includes(plan.by[k].tipo)).reduce((t, k) => t + s.saldo[k], 0);
        const lin = [];
        Object.keys(s.saldo).forEach(k => { const c = plan.by[k]; if (!c || ['I', 'E'].includes(c.tipo)) return; const v = Math.round(s.saldo[k]); if (v) lin.push(v > 0 ? L(k, v, 0) : L(k, 0, -v)); });
        const cfg = C.config(data);
        if (Math.round(res)) lin.push(res > 0 ? L(cfg.ctaResultadosAcum, Math.round(res), 0) : L(cfg.ctaResultadosAcum, 0, -Math.round(res)));
        const lk = K(lin);
        if (lk.length) out.push({ id: 'AP' + y, fecha: r.desde, origen: 'apertura', informativo: true, concepto: `Asiento de apertura del ejercicio ${r.desde.slice(0, 4)}`, lineas: lk });
      }
      if (r.hasta >= desde && r.hasta <= hasta) {
        const s = C.saldosAl(data, plan, r.hasta, asientos);
        const cfg = C.config(data);
        const resLin = [], cieLin = [];
        let res = 0;
        Object.keys(s.saldo).forEach(k => { const c = plan.by[k]; if (!c) return; const v = Math.round(s.saldo[k]); if (!v) return;
          if (['I', 'E'].includes(c.tipo)) { resLin.push(v > 0 ? L(k, 0, v) : L(k, -v, 0)); res += v; } else cieLin.push(v > 0 ? L(k, 0, v) : L(k, -v, 0)); });
        const ctaRes = cfg.ctaResultadoEjercicio;
        if (resLin.length) { resLin.push(res > 0 ? L(ctaRes, res, 0) : L(ctaRes, 0, -res)); out.push({ id: 'RF' + y, fecha: r.hasta, origen: 'refundición', informativo: true, concepto: `Refundición de cuentas de resultado – ejercicio ${y}`, lineas: K(resLin) }); }
        if (Math.round(res)) cieLin.push(res > 0 ? L(ctaRes, 0, res) : L(ctaRes, -res, 0));
        const ck = K(cieLin);
        if (ck.length) out.push({ id: 'CI' + y, fecha: r.hasta, origen: 'cierre', informativo: true, concepto: `Asiento de cierre del ejercicio ${y}`, lineas: ck });
      }
    }
    return out;
  };
  // Libro Diario: asientos del período con apertura y cierre informativos en su lugar.
  C.libroDiario = function (data, plan, desde, hasta, conInformativos) {
    const base = C.todosLosAsientos(data).filter(a => a.fecha >= desde && a.fecha <= hasta);
    if (!conInformativos) return base;
    const inf = C.asientosInformativos(data, plan, desde, hasta);
    const aper = inf.filter(a => a.origen === 'apertura'), fin = inf.filter(a => a.origen !== 'apertura');
    const out = [];
    const todos = base.slice();
    aper.forEach(a => todos.push(Object.assign({ _ord: 0 }, a)));
    fin.forEach(a => todos.push(Object.assign({ _ord: a.origen === 'refundición' ? 2 : 3 }, a)));
    todos.sort((a, b) => ord(a, b) || ((a._ord === undefined ? 1 : a._ord) - (b._ord === undefined ? 1 : b._ord)));
    todos.forEach(a => out.push(a));
    return out;
  };

  /* =================== LIBRO INVENTARIO =================== */
  C.libroInventario = function (data, plan, fecha) {
    const asientos = C.todosLosAsientos(data);
    const R = C.rubrosAl(data, plan, fecha, asientos);
    const s = R.saldo;
    const cfg = C.config(data);
    const PD = root.PlanDefault;
    const secciones = PD.RUBROS_RG49.filter(r => r.grupo !== 'ER').map(r => {
      const ctas = plan.list.filter(c => c.imputable && c.rubro === r.key && Math.round(s[c.codigo] || 0)).map(c => ({ codigo: c.codigo, nombre: c.nombre, importe: Math.round((s[c.codigo] || 0) * C.signoNatural(c.tipo)) }));
      const det = [];
      if (r.key === 'AC_CRED') C.cuentasCorrientes(data, 'CLIENTES', fecha).forEach(x => det.push([x.ruc, x.razon, x.saldo]));
      if (r.key === 'PC_COM') C.cuentasCorrientes(data, 'PROVEEDORES', fecha).forEach(x => det.push([x.ruc, x.razon, x.saldo]));
      if (r.key === 'AC_INVENT') C.valuacionInventario(data, fecha).filas.forEach(f => det.push([f.codigo, `${f.descripcion} – ${fmtCant(f.cantidad)} ${f.unidad || ''} × ${Math.round(f.ppp)}`, f.valor]));
      if (r.key === 'ANC_PPE') C.cuadroBienes(data, C.inicioEjercicio(fecha, cmes(data)), fecha).forEach(b => det.push([b.descripcion, `Valor ${b.valorFin} − dep. acum. ${b.depFin}`, b.neto]));
      return { key: r.key, grupo: r.grupo, nombre: r.nombre, total: Math.round(R.rubros[r.key]), cuentas: ctas, detalle: det };
    }).filter(x => x.total || x.cuentas.length);
    return { fecha, R, secciones, cfg };
  };
  const fmtCant = n => (Math.round(n * 1000) / 1000).toLocaleString('es-PY');

  /* =================== IRE SIMPLE Y RESIMPLE =================== */
  // Ingresos y egresos del ejercicio a partir de la contabilidad (cuentas de resultado).
  function ingresosEgresos(data, plan, anio) {
    const { desde, hasta } = finEj(anio, cmes(data));
    const R = C.rubrosAl(data, plan, hasta);
    let ingresos = 0, egresos = 0, noGravados = 0, noDeducibles = 0, ire = 0;
    Object.keys(R.saldo).forEach(k => { const c = plan.by[k]; if (!c) return; const v = R.saldo[k];
      if (c.tipo === 'I') { ingresos += -v; if (c.noGravado) noGravados += -v; }
      if (c.tipo === 'E') { if (c.rubro === 'ER_IRE') ire += v; else { egresos += v; if (c.noDeducible) noDeducibles += v; } } });
    return { desde, hasta, ingresos, egresos, noGravados, noDeducibles, ire };
  }
  C.ireSimple = function (data, plan, anio) {
    const cfg = C.config(data);
    const ent = ((data.f500 || {})[anio]) || {};
    const x = ingresosEgresos(data, plan, anio);
    const ingresosBrutos = Math.round(x.ingresos - x.noGravados);
    const egresosDeducibles = Math.round(x.egresos - x.noDeducibles);
    const rentaReal = Math.max(0, ingresosBrutos - egresosDeducibles);
    const rentaPresunta = Math.round(ingresosBrutos * cfg.pctRentaPresuntaSimple / 100);
    const metodo = ent.metodoSimple || cfg.metodoSimple || 'REAL';
    const renta = metodo === 'PRESUNTA' ? rentaPresunta : rentaReal;
    const impuesto = Math.round(renta * cfg.tasaIRE / 100);
    const debe = (cta, r) => { let t = 0; C.todosLosAsientos(data).forEach(a => { if (a.fecha >= r.desde && a.fecha <= r.hasta && !a.cierre && a.origen !== 'cierre') a.lineas.forEach(l => { if (l.cuenta === cta) t += l.debe; }); }); return Math.round(t); };
    const anticipos = ent.anticipos !== undefined && ent.anticipos !== '' ? C.r0(ent.anticipos) : debe(cfg.ctaAnticiposIRE, x);
    const retenciones = ent.retenciones !== undefined && ent.retenciones !== '' ? C.r0(ent.retenciones) : C.retencionesDelPeriodo(data, x.desde, x.hasta, 'IRE');
    const saldoFavorAnterior = C.r0(ent.saldoFavorAnterior);
    const neto = impuesto - anticipos - retenciones - saldoFavorAnterior;
    const alertas = [];
    if (ingresosBrutos > cfg.topeSimple) alertas.push(`Los ingresos del ejercicio (${fmtCant(ingresosBrutos)}) superan el tope del régimen SIMPLE (${fmtCant(cfg.topeSimple)}): a partir del ejercicio siguiente corresponde el régimen GENERAL.`);
    return { anio, desde: x.desde, hasta: x.hasta, ingresosBrutos, noGravados: Math.round(x.noGravados), egresos: Math.round(x.egresos), noDeducibles: Math.round(x.noDeducibles), egresosDeducibles,
      rentaReal, rentaPresunta, metodo, renta, impuesto, anticipos, retenciones, saldoFavorAnterior, neto, alertas,
      conveniente: rentaPresunta < rentaReal ? 'PRESUNTA' : 'REAL' };
  };
  C.tramosResimple = txt => String(txt || '').split(';').map(t => { const [h, c] = t.split(':'); return { hasta: h ? C.num(h) : Infinity, cuota: C.num(c) }; }).filter(t => t.cuota);
  C.ireResimple = function (data, plan, anio) {
    const cfg = C.config(data);
    const ent = ((data.f500 || {})[anio]) || {};
    const x = ingresosEgresos(data, plan, anio);
    const ingresosBrutos = Math.round(x.ingresos - x.noGravados);
    const tramos = C.tramosResimple(cfg.resimpleTramos);
    const tramo = tramos.find(t => ingresosBrutos <= t.hasta) || tramos[tramos.length - 1] || { cuota: 0 };
    const cuotaMensualSiguiente = tramo.cuota;
    const ingresosAnt = ent.ingresosAnterior !== undefined && ent.ingresosAnterior !== '' ? C.r0(ent.ingresosAnterior) : Math.round((() => { try { return ingresosEgresos(data, plan, anio - 1).ingresos; } catch (e) { return 0; } })());
    const tramoAct = tramos.find(t => ingresosAnt <= t.hasta) || { cuota: 0 };
    const cuotasDelAnio = tramoAct.cuota * 12;
    const pagado = C.r0(ent.cuotasPagadas);
    const alertas = [];
    if (ingresosBrutos > cfg.topeResimple) alertas.push(`Los ingresos del ejercicio (${fmtCant(ingresosBrutos)}) superan el tope del régimen RESIMPLE (${fmtCant(cfg.topeResimple)}): a partir del ejercicio siguiente corresponde el régimen SIMPLE o GENERAL.`);
    return { anio, desde: x.desde, hasta: x.hasta, ingresosBrutos, ingresosAnterior: ingresosAnt, cuotaMensualActual: tramoAct.cuota, cuotasDelAnio, pagado, saldo: cuotasDelAnio - pagado, cuotaMensualSiguiente, tramos, alertas };
  };

  /* =================== ÍTEMS DE XML SIFEN → INVENTARIO =================== */
  const tagsAll = (xml, n) => { const re = new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${n}>`, 'g'); const out = []; let m; while ((m = re.exec(xml))) out.push(m[1]); return out; };
  const tag = (xml, n) => tagsAll(xml, n)[0] || '';
  C.itemsSifenXML = function (xml) {
    return tagsAll(xml, 'gCamItem').map(it => {
      const cant = C.num(tag(it, 'dCantProSer')) || 0;
      const pu = C.num(tag(it, 'dPUniProSer')) || 0;
      const iva = tag(it, 'gCamIVA');
      const tasa = C.num(tag(iva, 'dTasaIVA'));
      const base = C.num(tag(iva, 'dBasGravIVA')) + C.num(tag(iva, 'dBasExe'));
      const costoUnit = cant ? (base ? base / cant : pu / (1 + tasa / 100)) : 0;
      return { codigo: tag(it, 'dCodInt').trim(), descripcion: tag(it, 'dDesProSer').trim(), unidad: tag(it, 'dDesUniMed').trim(), cantidad: cant, costoUnit: Math.round(costoUnit * 100) / 100 };
    }).filter(i => i.codigo && i.cantidad);
  };
  const parseOrig = C.parseSifenXML;
  C.parseSifenXML = function (xml, ruc) { const r = parseOrig(xml, ruc); r.doc.items = C.itemsSifenXML(xml); if (!r.doc.items.length) delete r.doc.items; return r; };
  // Movimientos de inventario a partir de los ítems de un comprobante
  C.movimientosDesdeDoc = function (doc, esCompra) {
    const nc = C.esNC(doc);
    const tipo = esCompra ? (nc ? 'DEV_COMPRA' : 'ENTRADA') : (nc ? 'DEV_VENTA' : 'SALIDA');
    return (doc.items || []).map(i => ({ fecha: doc.fecha, tipo, codigo: i.codigo, cantidad: i.cantidad, costoUnit: esCompra ? i.costoUnit : undefined, ref: `${doc.numero || ''} ${doc.razon || ''}`.trim(), docId: doc.id }));
  };

  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
