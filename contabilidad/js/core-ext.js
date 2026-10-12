/* Módulos adicionales del motor contable: cobros y pagos, cuentas corrientes, retenciones,
 * depreciaciones, sueldos e IPS, asientos recurrentes, diferencia de cambio, IDU, IRP,
 * flujo de efectivo, evolución del patrimonio, vencimientos, cierre de períodos,
 * importación de XML SIFEN y de archivos de Marangatu, sugerencia de cuentas. Sin DOM. */
(function (root) {
  'use strict';
  const C = root.Conta || (typeof require !== 'undefined' ? require('./core.js') : null);
  const PD = root.PlanDefault || (typeof require !== 'undefined' ? require('./plan-default.js') : null);
  const L = (...a) => C._linea(...a), K = l => C._compactar(l);
  const vacio = v => v === undefined || v === null || v === '';
  const mesSig = p => { let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${C.pad(m)}`; };
  C.mesSiguiente = mesSig;

  // Último mes a generar para movimientos periódicos: el mayor entre los datos y diciembre del año actual.
  C.horizonte = function (data) {
    let max = `${new Date().getFullYear()}-12`; // al menos hasta el cierre del año en curso
    ['ventas', 'compras', 'asientos', 'pagos', 'retenciones'].forEach(k => (data[k] || []).forEach(x => { if (x.fecha && x.fecha.slice(0, 7) > max) max = x.fecha.slice(0, 7); }));
    return max;
  };
  const meses = (desde, hasta) => { const out = []; for (let p = desde; p <= hasta; p = mesSig(p)) out.push(p); return out; };

  /* ---------- Cierre de períodos ---------- */
  C.periodoCerrado = (data, fecha) => {
    const c = C.config(data).cerradoHasta;
    return !!(c && fecha && fecha <= c);
  };

  /* ---------- Cobros y pagos ---------- */
  // pago: {fecha, tipo: 'COBRO'|'PAGO', ruc, razon, docNumero, monto (Gs.), cuenta (caja/banco), contra (opcional), moneda, montoME}
  C.cuentasME = data => new Set((data.cuentas || []).filter(c => c.me === true || c.me === 'S').map(c => String(c.codigo).trim()));
  C.asientoPago = function (p, cfg, meSet) {
    const cobro = p.tipo === 'COBRO';
    const usd = p.moneda === 'USD' ? C.num(p.montoME) : 0;
    const contra = p.contra || (cobro ? (usd ? cfg.ctaClientesME : cfg.ctaClientes) : (usd ? cfg.ctaProveedoresME : cfg.ctaProveedores));
    const caja = p.cuenta || cfg.ctaCaja;
    const m = C.r0(p.monto);
    const me = (cta, signo) => usd && meSet && meSet.has(cta) ? signo * usd : 0;
    const lineas = cobro ? [L(caja, m, 0, me(caja, 1)), L(contra, 0, m, me(contra, -1))] : [L(contra, m, 0, me(contra, 1)), L(caja, 0, m, me(caja, -1))];
    return { id: 'G' + p.id, fecha: p.fecha, origen: cobro ? 'cobro' : 'pago', ref: p.id, concepto: `${cobro ? 'Cobro' : 'Pago'} ${p.docNumero || ''} ${p.razon || ''}`.trim(), lineas: K(lineas) };
  };
  C.generadores.push((data, cfg) => { const ms = C.cuentasME(data); return (data.pagos || []).map(p => C.asientoPago(p, cfg, ms)); });

  /* ---------- Retenciones ---------- */
  // ret: {fecha, tipo: 'RECIBIDA'|'EMITIDA', impuesto: 'IVA'|'IRE'|'IRP', ruc, razon, numero, docNumero, monto}
  C.asientoRetencion = function (r, cfg) {
    const m = C.r0(r.monto);
    let lineas;
    if (r.tipo === 'EMITIDA') lineas = [L(cfg.ctaProveedores, m, 0), L(cfg.ctaRetADepositar, 0, m)];
    else lineas = [L(r.impuesto === 'IVA' ? cfg.ctaRetIVARecibidas : cfg.ctaRetencionesIRE, m, 0), L(cfg.ctaClientes, 0, m)];
    return { id: 'T' + r.id, fecha: r.fecha, origen: 'retención', ref: r.id, concepto: `Retención ${r.impuesto} ${r.tipo === 'EMITIDA' ? 'emitida' : 'recibida'} ${r.numero || ''} ${r.razon || ''}`.trim(), lineas: K(lineas) };
  };
  C.generadores.push((data, cfg) => (data.retenciones || []).map(r => C.asientoRetencion(r, cfg)));
  C.retencionesDelMes = (data, periodo, impuesto, tipo) => Math.round((data.retenciones || [])
    .filter(r => r.fecha && r.fecha.slice(0, 7) === periodo && r.impuesto === impuesto && (r.tipo || 'RECIBIDA') === (tipo || 'RECIBIDA'))
    .reduce((t, r) => t + C.num(r.monto), 0));
  C.retencionesDelPeriodo = (data, desde, hasta, impuesto, tipo) => Math.round((data.retenciones || [])
    .filter(r => r.fecha >= desde && r.fecha <= hasta && r.impuesto === impuesto && (r.tipo || 'RECIBIDA') === (tipo || 'RECIBIDA'))
    .reduce((t, r) => t + C.num(r.monto), 0));

  /* ---------- Cuentas corrientes y antigüedad de saldos ---------- */
  C.cuentasCorrientes = function (data, tipo, hasta) {
    const cfg = C.config(data);
    const esCli = tipo === 'CLIENTES';
    const docs = (esCli ? data.ventas : data.compras) || [];
    const porRuc = {};
    const g = ruc => porRuc[ruc] || (porRuc[ruc] = { ruc, razon: '', docs: [], creditos: [] });
    docs.filter(d => d.fecha <= hasta).forEach(d => {
      const x = g(d.ruc || '(sin RUC)');
      if (d.razon) x.razon = d.razon;
      const tot = C.desglose(d).total;
      if (C.esNC(d)) x.creditos.push({ monto: tot, docNumero: d.asocNumero, origen: 'NC ' + (d.numero || '') });
      else if (d.condicion === 'CREDITO') x.docs.push({ id: d.id, fecha: d.fecha, numero: d.numero, total: tot, saldo: tot, vence: d.vence || addDias(d.fecha, +d.plazo || +cfg.plazoDias || 30) });
    });
    (data.pagos || []).filter(p => p.fecha <= hasta && p.tipo === (esCli ? 'COBRO' : 'PAGO') && !p.contra)
      .forEach(p => { const x = g(p.ruc || '(sin RUC)'); if (!x.razon && p.razon) x.razon = p.razon; x.creditos.push({ monto: C.r0(p.monto), docNumero: p.docNumero, origen: (esCli ? 'Cobro ' : 'Pago ') + (p.docNumero || '') }); });
    (data.retenciones || []).filter(r => r.fecha <= hasta && (esCli ? (r.tipo || 'RECIBIDA') === 'RECIBIDA' : r.tipo === 'EMITIDA'))
      .forEach(r => { const x = g(r.ruc || '(sin RUC)'); x.creditos.push({ monto: C.r0(r.monto), docNumero: r.docNumero, origen: 'Retención ' + r.impuesto }); });
    const filas = [];
    Object.values(porRuc).forEach(x => {
      x.docs.sort((a, b) => a.fecha.localeCompare(b.fecha));
      let anticipo = 0;
      // primero los créditos imputados a un comprobante, luego el resto por antigüedad (FIFO)
      x.creditos.sort((a, b) => (b.docNumero ? 1 : 0) - (a.docNumero ? 1 : 0)).forEach(cr => {
        let resto = cr.monto;
        const dir = cr.docNumero && x.docs.find(d => d.numero === cr.docNumero);
        if (dir) { const a = Math.min(resto, dir.saldo); dir.saldo -= a; resto -= a; }
        for (const d of x.docs) { if (resto <= 0) break; const a = Math.min(resto, d.saldo); d.saldo -= a; resto -= a; }
        anticipo += resto;
      });
      const pend = x.docs.filter(d => d.saldo > 0);
      const t = { aVencer: 0, d30: 0, d60: 0, d90: 0, mas90: 0 };
      pend.forEach(d => {
        const dias = difDias(d.vence, hasta);
        d.diasVencido = dias;
        if (dias <= 0) t.aVencer += d.saldo; else if (dias <= 30) t.d30 += d.saldo; else if (dias <= 60) t.d60 += d.saldo; else if (dias <= 90) t.d90 += d.saldo; else t.mas90 += d.saldo;
      });
      const saldo = pend.reduce((s, d) => s + d.saldo, 0) - anticipo;
      if (Math.round(saldo) || pend.length) filas.push(Object.assign({ ruc: x.ruc, razon: x.razon, pendientes: pend, anticipo, saldo }, t));
    });
    filas.sort((a, b) => b.saldo - a.saldo);
    return filas;
  };
  function addDias(f, n) { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function difDias(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
  C.addDias = addDias; C.difDias = difDias;

  /* ---------- Bienes de uso y depreciación ---------- */
  // bien: {id, descripcion, fechaAlta, valor, residual, vidaUtil (años), ctaActivo, ctaDepAcum, ctaGasto, fechaBaja}
  C.cuotaMensual = b => { const v = (C.num(b.valor) - C.num(b.residual)); const n = Math.round(C.num(b.vidaUtil) * 12); return n > 0 && v > 0 ? v / n : 0; };
  // Depreciación acumulada de un bien al cierre del mes indicado (desde el mes de alta inclusive).
  C.depAcumulada = function (b, periodo) {
    if (!b.fechaAlta || periodo < b.fechaAlta.slice(0, 7)) return 0;
    let fin = periodo;
    if (b.fechaBaja && b.fechaBaja.slice(0, 7) < fin) fin = b.fechaBaja.slice(0, 7);
    const ms = meses(b.fechaAlta.slice(0, 7), fin).length;
    const total = C.num(b.valor) - C.num(b.residual);
    return Math.min(total, Math.round(C.cuotaMensual(b) * ms));
  };
  C.asientosDepreciacion = function (data, cfg) {
    const bienes = (data.bienes || []).filter(b => b.fechaAlta && C.cuotaMensual(b) > 0);
    if (!bienes.length) return [];
    const ini = bienes.reduce((m, b) => b.fechaAlta.slice(0, 7) < m ? b.fechaAlta.slice(0, 7) : m, '9999-99');
    const out = [];
    meses(ini, C.horizonte(data)).forEach(p => {
      const lin = [];
      bienes.forEach(b => {
        const cuota = C.depAcumulada(b, p) - C.depAcumulada(b, C.mesAnterior(p));
        if (cuota > 0) { lin.push(L(b.ctaGasto || cfg.ctaDepGasto, cuota, 0)); lin.push(L(b.ctaDepAcum, 0, cuota)); }
      });
      if (lin.length) out.push({ id: 'D' + p, fecha: C.finDeMes(p), origen: 'depreciación', ref: p, concepto: `Depreciación bienes de uso ${p}`, lineas: K(lin) });
    });
    return out;
  };
  C.generadores.push(C.asientosDepreciacion);
  C.cuadroBienes = function (data, desde, hasta) {
    const pIni = C.mesAnterior(desde.slice(0, 7)), pFin = hasta.slice(0, 7);
    return (data.bienes || []).map(b => {
      const alta = b.fechaAlta || '';
      const valorIni = alta < desde ? C.num(b.valor) : 0;
      const altas = alta >= desde && alta <= hasta ? C.num(b.valor) : 0;
      const bajas = b.fechaBaja && b.fechaBaja >= desde && b.fechaBaja <= hasta ? C.num(b.valor) : 0;
      const depIni = C.depAcumulada(b, pIni), depFin = C.depAcumulada(b, pFin);
      const valorFin = valorIni + altas - bajas;
      return { id: b.id, descripcion: b.descripcion, fechaAlta: alta, vidaUtil: b.vidaUtil, valorIni, altas, bajas, valorFin, depIni, depEjercicio: depFin - depIni, depFin: bajas ? 0 : depFin, neto: valorFin - (bajas ? 0 : depFin) };
    });
  };

  /* ---------- Sueldos e IPS ---------- */
  // planilla: data.planillas['YYYY-MM'] = { lineas: [{empId, nombre, ci, salario, extras, descuentos, aguinaldo (pago)}] }
  C.calcularPlanilla = function (data, periodo) {
    const cfg = C.config(data);
    const pl = (data.planillas || {})[periodo];
    if (!pl) return null;
    const t = { bruto: 0, ipsObrero: 0, ipsPatronal: 0, descuentos: 0, neto: 0, provAguinaldo: 0, aguinaldoPagado: 0 };
    const filas = (pl.lineas || []).map(l => {
      const bruto = C.r0(C.num(l.salario) + C.num(l.extras));
      const ipsO = Math.round(bruto * cfg.pctIPSObrero / 100), ipsP = Math.round(bruto * cfg.pctIPSPatronal / 100);
      const desc = C.r0(l.descuentos), prov = Math.round(bruto / 12), agui = C.r0(l.aguinaldo);
      const neto = bruto - ipsO - desc + agui;
      t.bruto += bruto; t.ipsObrero += ipsO; t.ipsPatronal += ipsP; t.descuentos += desc; t.neto += neto; t.provAguinaldo += prov; t.aguinaldoPagado += agui;
      return Object.assign({}, l, { bruto, ipsObrero: ipsO, ipsPatronal: ipsP, descuentos: desc, neto, provAguinaldo: prov, aguinaldo: agui });
    });
    return { periodo, filas, t };
  };
  C.asientosSueldos = function (data, cfg) {
    return Object.keys(data.planillas || {}).sort().map(p => {
      const r = C.calcularPlanilla(data, p);
      if (!r || !r.filas.length) return null;
      const t = r.t;
      return {
        id: 'S' + p, fecha: C.finDeMes(p), origen: 'sueldos', ref: p, concepto: `Planilla de sueldos ${p}`,
        lineas: K([
          L(cfg.ctaSueldos, t.bruto, 0), L(cfg.ctaAportePatronal, t.ipsPatronal, 0), L(cfg.ctaAguinaldoGasto, t.provAguinaldo, 0),
          L(cfg.ctaAguinaldoAPagar, t.aguinaldoPagado, 0),
          L(cfg.ctaSueldosAPagar, 0, t.neto), L(cfg.ctaIPSAPagar, 0, t.ipsObrero + t.ipsPatronal),
          L(cfg.ctaAguinaldoAPagar, 0, t.provAguinaldo), L(cfg.ctaDescuentosPersonal, 0, t.descuentos)
        ])
      };
    }).filter(Boolean);
  };
  C.generadores.push(C.asientosSueldos);

  /* ---------- Asientos recurrentes ---------- */
  // rec: {id, concepto, dia, desde 'YYYY-MM', hasta 'YYYY-MM' (opcional), activo, lineas: [{cuenta, debe, haber}]}
  C.asientosRecurrentes = function (data) {
    const out = [], hz = C.horizonte(data);
    (data.recurrentes || []).filter(r => r.activo !== false && r.desde).forEach(r => {
      const fin = r.hasta && r.hasta < hz ? r.hasta : hz;
      meses(r.desde, fin).forEach(p => {
        const ult = +C.finDeMes(p).slice(8);
        const dia = Math.min(Math.max(1, +r.dia || 1), ult);
        out.push({ id: 'R' + r.id + p, fecha: `${p}-${C.pad(dia)}`, origen: 'recurrente', ref: r.id, concepto: `${r.concepto} (${p})`, lineas: K((r.lineas || []).map(l => L(l.cuenta, C.num(l.debe), C.num(l.haber)))) });
      });
    });
    return out;
  };
  C.generadores.push(C.asientosRecurrentes);

  /* ---------- IDU: distribución de dividendos ---------- */
  // div: {id, fecha, socio, ci, residente (bool), monto}
  C.iduDe = (d, cfg) => Math.round(C.num(d.monto) * (d.residente === false ? cfg.pctIDUNoResidente : cfg.pctIDUResidente) / 100);
  C.asientosDividendos = function (data, cfg) {
    return (data.dividendos || []).map(d => {
      const m = C.r0(d.monto), idu = C.iduDe(d, cfg);
      return { id: 'U' + d.id, fecha: d.fecha, origen: 'dividendos', ref: d.id, concepto: `Distribución de utilidades – ${d.socio || ''}`.trim(),
        lineas: K([L(cfg.ctaResultadosAcum, m, 0), L(cfg.ctaDividendosAPagar, 0, m - idu), L(cfg.ctaIDUADepositar, 0, idu)]) };
    });
  };
  C.generadores.push(C.asientosDividendos);
  C.liquidacionIDU = function (data, periodo) {
    const cfg = C.config(data);
    const filas = (data.dividendos || []).filter(d => d.fecha && d.fecha.slice(0, 7) === periodo)
      .map(d => ({ fecha: d.fecha, socio: d.socio, ci: d.ci, residente: d.residente !== false, monto: C.r0(d.monto), tasa: d.residente === false ? cfg.pctIDUNoResidente : cfg.pctIDUResidente, idu: C.iduDe(d, cfg) }));
    return { filas, total: filas.reduce((t, f) => t + f.idu, 0), base: filas.reduce((t, f) => t + f.monto, 0) };
  };

  /* ---------- Diferencia de cambio ---------- */
  C.tcDelMes = (data, periodo) => C.num((data.tiposCambio || {})[periodo]);
  C.asientosDifCambio = function (data, cfg, asientos) {
    const ctasME = C.cuentasME(data);
    if (!ctasME.size) return [];
    const movs = [];
    asientos.forEach(a => a.lineas.forEach(l => { if (ctasME.has(l.cuenta)) movs.push({ fecha: a.fecha, cuenta: l.cuenta, gs: l.debe - l.haber, me: C.num(l.me) }); }));
    if (!movs.length) return [];
    movs.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const out = [], acc = {};
    let i = 0;
    meses(movs[0].fecha.slice(0, 7), C.horizonte(data)).forEach(p => {
      const fin = C.finDeMes(p);
      while (i < movs.length && movs[i].fecha <= fin) { const m = movs[i++]; const x = acc[m.cuenta] || (acc[m.cuenta] = { gs: 0, me: 0 }); x.gs += m.gs; x.me += m.me; }
      const tc = C.tcDelMes(data, p);
      if (!tc) return;
      const lin = [];
      Object.keys(acc).forEach(cta => {
        const x = acc[cta];
        const aj = Math.round(x.me * tc - x.gs);
        if (!aj) return;
        x.gs += aj;
        lin.push(aj > 0 ? L(cta, aj, 0) : L(cta, 0, -aj));
        lin.push(aj > 0 ? L(cfg.ctaDifCambioPos, 0, aj) : L(cfg.ctaDifCambioNeg, -aj, 0));
      });
      if (lin.length) out.push({ id: 'X' + p, fecha: fin, origen: 'dif. cambio', ref: p, concepto: `Diferencia de cambio ${p} (T.C. ${tc})`, lineas: K(lin) });
    });
    return out;
  };
  C.postGeneradores.push(C.asientosDifCambio);
  C.posicionME = function (data, hasta) {
    const ctas = (data.cuentas || []).filter(c => c.me === true || c.me === 'S');
    const set = new Set(ctas.map(c => String(c.codigo).trim()));
    const r = {};
    C.todosLosAsientos(data).forEach(a => { if (a.fecha <= hasta) a.lineas.forEach(l => { if (set.has(l.cuenta)) { const x = r[l.cuenta] || (r[l.cuenta] = { gs: 0, me: 0 }); x.gs += l.debe - l.haber; x.me += C.num(l.me); } }); });
    return ctas.map(c => Object.assign({ codigo: c.codigo, nombre: c.nombre }, r[String(c.codigo).trim()] || { gs: 0, me: 0 })).filter(x => Math.round(x.gs) || x.me);
  };

  /* ---------- IRP (Impuesto a la Renta Personal) ---------- */
  C.tramosIRP = txt => String(txt || '').split(';').map(t => { const [h, r] = t.split(':'); return { hasta: h ? C.num(h) : Infinity, tasa: C.num(r) }; }).filter(t => t.tasa);
  C.impuestoPorTramos = function (renta, tramos) {
    let imp = 0, prev = 0; const det = [];
    tramos.forEach(t => {
      if (renta <= prev) return;
      const base = Math.min(renta, t.hasta) - prev;
      const v = Math.round(base * t.tasa / 100);
      det.push({ desde: prev, hasta: t.hasta, base, tasa: t.tasa, impuesto: v });
      imp += v; prev = t.hasta;
    });
    return { impuesto: imp, detalle: det };
  };
  C.irp = function (data, anio) {
    const cfg = C.config(data);
    const ent = (data.irp && data.irp[anio]) || {};
    const enAnio = x => x.fecha && x.fecha.slice(0, 4) === String(anio);
    let ingresos = 0, egresos = 0;
    (data.ventas || []).filter(enAnio).forEach(v => { const d = C.desglose(v); ingresos += C.signo(v) * (d.base10 + d.base5 + d.exenta + d.exportacion); });
    (data.compras || []).filter(c => enAnio(c) && c.irp !== false && (cfg.irpTodasCompras !== false || c.irp)).forEach(c => { egresos += C.signo(c) * C.desglose(c).total; });
    const otrosIngresos = C.r0(ent.otrosIngresos), otrosEgresos = C.r0(ent.otrosEgresos), aportesIPS = C.r0(ent.aportesIPS);
    const ingresosTot = ingresos + otrosIngresos, egresosTot = egresos + otrosEgresos + aportesIPS;
    const rentaNeta = Math.max(0, ingresosTot - egresosTot);
    const t = C.impuestoPorTramos(rentaNeta, C.tramosIRP(cfg.irpTramos));
    const retenciones = vacio(ent.retenciones) ? C.retencionesDelPeriodo(data, `${anio}-01-01`, `${anio}-12-31`, 'IRP') : C.r0(ent.retenciones);
    const anticipos = C.r0(ent.anticipos), saldoFavorAnterior = C.r0(ent.saldoFavorAnterior);
    const neto = t.impuesto - retenciones - anticipos - saldoFavorAnterior;
    return { anio, ingresos, otrosIngresos, ingresosTot, egresos, otrosEgresos, aportesIPS, egresosTot, rentaNeta, impuesto: t.impuesto, tramos: t.detalle, retenciones, anticipos, saldoFavorAnterior, neto };
  };

  /* ---------- Flujo de efectivo (método indirecto) y evolución del patrimonio ---------- */
  C.flujoEfectivo = function (data, plan, corte1, corte2) {
    const cfg = C.config(data);
    const a = C.todosLosAsientos(data);
    const R1 = C.rubrosAl(data, plan, corte1, a), R2 = C.rubrosAl(data, plan, corte2, a);
    const d = k => R2.rubros[k] - R1.rubros[k];
    const grupo = String(cfg.grupoDepreciaciones || '');
    let dep = 0;
    Object.keys(R2.saldo).forEach(k => { if (grupo && (k === grupo || k.startsWith(grupo + '.') || (!grupo.includes('.') && k.startsWith(grupo)))) dep += R2.saldo[k]; });
    const resultado = R2.er.neto;
    const op = [
      ['Resultado del ejercicio', resultado],
      ['(+) Depreciaciones y amortizaciones', dep],
      ['(Aumento) disminución de créditos por ventas', -d('AC_CRED')],
      ['(Aumento) disminución de otros créditos', -d('AC_OCRED')],
      ['(Aumento) disminución de inventarios', -d('AC_INVENT')],
      ['(Aumento) disminución de gastos pagados por adelantado', -d('AC_OTROS')],
      ['Aumento (disminución) de acreedores comerciales', d('PC_COM') + d('PNC_COM')],
      ['Aumento (disminución) de otras deudas y previsiones', d('PC_OTRAS') + d('PC_PREV')]
    ];
    const inv = [
      ['Adquisición neta de bienes de uso e intangibles', -(d('ANC_PPE') + d('ANC_INTANG') + dep)],
      ['Variación de inversiones temporarias', -d('AC_INV')],
      ['Variación de inversiones permanentes', -d('ANC_INV')],
      ['Variación de créditos a largo plazo y otros activos no corrientes', -(d('ANC_CRED') + d('ANC_OTROS'))]
    ];
    const fin = [
      ['Aumento (disminución) de deudas financieras', d('PC_FIN') + d('PNC_FIN')],
      ['Aumento (disminución) de otras deudas a largo plazo', d('PNC_OTRAS')],
      ['Aportes y variaciones de capital', d('PN_CAP')],
      ['Variación de reservas', d('PN_RES')],
      ['Dividendos pagados y otras variaciones de resultados acumulados', d('PN_RESACUM') + d('PN_RESEJ') - resultado]
    ];
    const s = x => x.reduce((t, r) => t + r[1], 0);
    const tOp = s(op), tInv = s(inv), tFin = s(fin);
    return {
      op, inv, fin, tOp, tInv, tFin, variacion: tOp + tInv + tFin,
      inicial: R1.rubros.AC_DISP, final: R2.rubros.AC_DISP,
      control: Math.round(tOp + tInv + tFin - (R2.rubros.AC_DISP - R1.rubros.AC_DISP))
    };
  };
  C.evolucionPN = function (data, plan, corte1, corte2) {
    const a = C.todosLosAsientos(data);
    const R1 = C.rubrosAl(data, plan, corte1, a).rubros, R2 = C.rubrosAl(data, plan, corte2, a).rubros;
    const cm = (data.cliente && data.cliente.cierreMes) || 12;
    const nuevoEj = C.inicioEjercicio(corte2, cm) > corte1;
    const ini = [R1.PN_CAP, R1.PN_RES, R1.PN_RESACUM, R1.PN_RESEJ];
    const fin = [R2.PN_CAP, R2.PN_RES, R2.PN_RESACUM, R2.PN_RESEJ];
    const tras = nuevoEj ? [0, 0, R1.PN_RESEJ, -R1.PN_RESEJ] : [0, 0, 0, 0];
    const resEj = [0, 0, 0, R2.PN_RESEJ - (R1.PN_RESEJ + tras[3])];
    const cap = [fin[0] - ini[0], 0, 0, 0];
    const res = [0, fin[1] - ini[1], 0, 0];
    const otros = [0, 0, fin[2] - ini[2] - tras[2], 0];
    const tot = v => v.concat([v.reduce((s, x) => s + x, 0)]);
    return {
      columnas: ['Capital integrado', 'Reservas', 'Resultados acumulados', 'Resultado del ejercicio', 'Total'],
      filas: [
        ['Saldos al ' + corte1.split('-').reverse().join('/'), tot(ini)],
        ['Traslado del resultado del ejercicio anterior', tot(tras)],
        ['Aportes y variaciones de capital', tot(cap)],
        ['Constitución / variación de reservas', tot(res)],
        ['Distribución de utilidades y otros movimientos', tot(otros)],
        ['Resultado del ejercicio', tot(resEj)],
        ['Saldos al ' + corte2.split('-').reverse().join('/'), tot(fin)]
      ]
    };
  };

  /* ---------- Calendario de vencimientos (según terminación del RUC) ---------- */
  C.DIA_VTO = { 0: 7, 1: 9, 2: 11, 3: 13, 4: 15, 5: 17, 6: 19, 7: 21, 8: 23, 9: 25 };
  C.FERIADOS_FIJOS = ['01-01', '03-01', '05-01', '05-14', '05-15', '06-12', '08-15', '09-29', '12-08', '12-25'];
  C.diaHabil = function (fecha, feriadosExtra) {
    const extra = new Set(feriadosExtra || []);
    let f = fecha;
    for (let i = 0; i < 10; i++) {
      const dw = new Date(f + 'T00:00:00Z').getUTCDay();
      if (dw !== 0 && dw !== 6 && !C.FERIADOS_FIJOS.includes(f.slice(5)) && !extra.has(f)) return f;
      f = addDias(f, 1);
    }
    return f;
  };
  C.vencimientos = function (ruc, anio, cierreMes, opts) {
    opts = opts || {};
    const cuerpo = String(ruc || '').split('-')[0].replace(/\D/g, '');
    const dig = cuerpo ? +cuerpo.slice(-1) : 0;
    const dia = C.DIA_VTO[dig];
    const vto = (y, m) => { while (m > 12) { m -= 12; y++; } return C.diaHabil(`${y}-${C.pad(m)}-${C.pad(dia)}`, opts.feriados); };
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const per = `${anio}-${C.pad(m)}`;
      out.push({ fecha: vto(anio, m + 1), obligacion: 'IVA – Formulario 120', periodo: per });
      out.push({ fecha: vto(anio, m + 1), obligacion: 'Registro de comprobantes RG 90 (955)', periodo: per });
      if (opts.retenciones) out.push({ fecha: vto(anio, m + 1), obligacion: 'Retenciones / IDU a depositar', periodo: per });
      if (opts.ips) out.push({ fecha: `${m === 12 ? anio + 1 : anio}-${C.pad(m === 12 ? 1 : m + 1)}-${C.pad(opts.diaIPS || 15)}`, obligacion: 'IPS – planilla y aporte (verificar fecha)', periodo: per });
    }
    const cm = +cierreMes || 12;
    // DJ del ejercicio cerrado el año anterior y anticipos del ejercicio en curso (vencen dentro del año calendario)
    const ejAnt = anio - 1;
    out.push({ fecha: vto(ejAnt, cm + (+opts.mesesVtoIRE || 4)), obligacion: 'IRE – Formulario 500 (DJ anual)', periodo: `Ejercicio ${ejAnt}` });
    String(opts.mesesAnticiposIRE || '').split(',').map(Number).filter(Boolean).forEach((k, i) => out.push({ fecha: vto(ejAnt, cm + k), obligacion: `IRE – anticipo ${i + 1}`, periodo: `Ejercicio ${ejAnt + 1}` }));
    if (opts.irp) out.push({ fecha: vto(anio, 3), obligacion: 'IRP – DJ anual (verificar mes)', periodo: `Año ${anio - 1}` });
    out.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { digito: dig, dia, items: out };
  };

  /* ---------- Sugerencia de cuenta contable ---------- */
  const PALABRAS = [
    [/\b(ande)\b/i, '5.2.1.02.02'], [/\b(essap|aguater)/i, '5.2.1.02.03'],
    [/\b(tigo|claro|personal|copaco|vox|telecel|nucleo|núcleo)\b/i, '5.2.1.02.04'],
    [/(petro|copetrol|shell|puma|enex|esso|barcos|combustible|estacion|estación)/i, '5.2.1.02.07'],
    [/(seguro|aseguradora)/i, '5.2.1.02.09'], [/(alquiler|inmobiliaria)/i, '5.2.1.02.01'],
    [/(estudio contable|abogad|consultor|honorario)/i, '5.2.1.02.05'], [/(libreria|librería|papeleria|papelería)/i, '5.2.1.02.06'],
    [/(banco|financiera)/i, '5.3.1.01.02'], [/(publicidad|marketing|medios|radio|tv)/i, '5.2.2.01.01'],
    [/(transporte|flete|courier|logistica|logística)/i, '5.2.2.01.03'], [/(taller|repuesto|mantenimiento|ferreter)/i, '5.2.1.02.08']
  ];
  C.sugerirCuenta = function (data, ruc, razon, plan) {
    const valida = c => !plan || (plan.by[c] && plan.by[c].imputable);
    const cuenta = {};
    (data.compras || []).filter(c => c.cuenta && ruc && c.ruc === ruc).forEach(c => { cuenta[c.cuenta] = (cuenta[c.cuenta] || 0) + 1; });
    let mejor = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
    if (mejor && valida(mejor)) return { cuenta: mejor, motivo: `usada ${cuenta[mejor]} veces con este proveedor` };
    const t = String(razon || '');
    if (t) {
      const pal = t.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const votos = {};
      (data.compras || []).filter(c => c.cuenta && c.razon).forEach(c => { const r = c.razon.toLowerCase(); if (pal.some(w => r.includes(w))) votos[c.cuenta] = (votos[c.cuenta] || 0) + 1; });
      mejor = Object.keys(votos).sort((a, b) => votos[b] - votos[a])[0];
      if (mejor && valida(mejor)) return { cuenta: mejor, motivo: 'proveedores con nombre similar' };
      for (const [re, cta] of PALABRAS) if (re.test(t) && valida(cta)) return { cuenta: cta, motivo: 'por el rubro del proveedor' };
    }
    return null;
  };

  /* ---------- XML SIFEN (factura electrónica) ---------- */
  const tag = (xml, n) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${n}>`)); return m ? m[1].trim() : ''; };
  C.parseSifenXML = function (xml, rucCliente) {
    const de = tag(xml, 'DE') || xml;
    const cdcM = xml.match(/<(?:\w+:)?DE\s[^>]*Id="(\d{44})"/);
    const iTiDE = +tag(de, 'iTiDE');
    const tipoDoc = { 1: 'FACTURA', 4: 'AUTOFACTURA', 5: 'NOTA_CREDITO', 6: 'NOTA_DEBITO' }[iTiDE];
    if (!tipoDoc) throw new Error(`Tipo de documento electrónico ${iTiDE || '?'} no soportado (solo factura, autofactura, NC y ND)`);
    const gTimb = tag(de, 'gTimb'), gEmis = tag(de, 'gEmis'), gRec = tag(de, 'gDatRec'), gTot = tag(de, 'gTotSub');
    const rucEm = `${tag(gEmis, 'dRucEm')}-${tag(gEmis, 'dDVEmi')}`;
    const rucRec = tag(gRec, 'dRucRec') ? `${tag(gRec, 'dRucRec')}-${tag(gRec, 'dDVRec')}` : (tag(gRec, 'dNumIDRec') || 'X');
    const cuerpoCli = String(rucCliente || '').split('-')[0];
    const esCompra = cuerpoCli && rucEm.split('-')[0] === cuerpoCli ? false : true;
    const moneda = tag(de, 'cMoneOpe') || 'PYG';
    const n = x => C.num(String(x || '0'));
    const doc = {
      fecha: tag(de, 'dFeEmiDE').slice(0, 10), tipoDoc,
      timbrado: tag(gTimb, 'dNumTim'),
      numero: `${tag(gTimb, 'dEst')}-${tag(gTimb, 'dPunExp')}-${tag(gTimb, 'dNumDoc')}`,
      ruc: esCompra ? rucEm : rucRec, razon: esCompra ? tag(gEmis, 'dNomEmi') : tag(gRec, 'dNomRec'),
      condicion: tag(de, 'iCondOpe') === '2' ? 'CREDITO' : 'CONTADO',
      g10: n(tag(gTot, 'dSub10')), g5: n(tag(gTot, 'dSub5')), exenta: n(tag(gTot, 'dSubExe')) + n(tag(gTot, 'dSubExo')),
      electronico: true, cdc: cdcM ? cdcM[1] : ''
    };
    if (moneda !== 'PYG') { doc.moneda = 'USD'; doc.tc = n(tag(de, 'dTiCam')); }
    if (tipoDoc === 'NOTA_CREDITO' || tipoDoc === 'NOTA_DEBITO') {
      const aso = tag(de, 'gCamDEAsoc');
      doc.asocNumero = tag(aso, 'dNumDocAso') ? `${tag(aso, 'dEstDocAso')}-${tag(aso, 'dPExpDocAso')}-${tag(aso, 'dNumDocAso')}` : '';
      doc.asocTimbrado = tag(aso, 'dNTimDI');
      doc.asocCDC = tag(aso, 'dCdCDERef');
    }
    if (tipoDoc === 'NOTA_DEBITO') doc.tipoDoc = 'FACTURA'; // la ND aumenta el débito/crédito como una factura
    const totalXml = n(tag(gTot, 'dTotGralOpe'));
    const calc = doc.g10 + doc.g5 + doc.exenta;
    if (totalXml && Math.abs(totalXml - calc) > 1) doc.observacion = `Total del XML ${totalXml} ≠ suma de subtotales ${calc}`;
    return { doc, esCompra };
  };

  /* ---------- Archivo RG 90 (CSV de Marangatu) → comprobantes ---------- */
  const TIPO_DESDE_RG90 = { 101: 'AUTOFACTURA', 103: 'BOLETA', 107: 'DESPACHO', 109: 'FACTURA', 110: 'NOTA_CREDITO', 111: 'FACTURA' };
  C.importarRG90 = function (texto) {
    const ventas = [], compras = [], errores = [];
    String(texto).replace(/\r/g, '').split('\n').forEach((lin, i) => {
      if (!lin.trim()) return;
      const f = lin.split(lin.includes('\t') ? '\t' : ',').map(x => x.trim());
      const tr = +f[0];
      if (tr !== 1 && tr !== 2) { errores.push(`Línea ${i + 1}: tipo de registro ${f[0]} no soportado (solo ventas y compras)`); return; }
      const esCompra = tr === 2;
      const tipoId = +f[1], num = f[2];
      const ruc = tipoId === 11 ? `${num}-${C.dvRuc(num)}` : tipoId === 15 ? 'X' : num;
      const doc = {
        fecha: C.parseFecha(f[5]), tipoDoc: TIPO_DESDE_RG90[+f[4]] || 'FACTURA', timbrado: f[6], numero: f[7], ruc, razon: f[3],
        g10: C.r0(f[8]), g5: C.r0(f[9]), exenta: C.r0(f[10]), condicion: f[12] === '2' ? 'CREDITO' : 'CONTADO'
      };
      if (tipoId !== 11 && tipoId !== 15) doc.tipoId = tipoId;
      const asoc = esCompra ? 18 : 17;
      if (f[asoc]) { doc.asocNumero = f[asoc]; doc.asocTimbrado = f[asoc + 1]; }
      if (esCompra) { doc.afectacion = 'GRAVADA'; if (f[17] === 'S') doc.noImputa = true; }
      if (!doc.fecha) { errores.push(`Línea ${i + 1}: fecha inválida`); return; }
      (esCompra ? compras : ventas).push(doc);
    });
    return { ventas, compras, errores };
  };

  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
