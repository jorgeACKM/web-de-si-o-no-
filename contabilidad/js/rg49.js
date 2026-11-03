/* Estados financieros en el formato oficial de la RG 49/2014 (Anexos 1 a 6). Sin DOM.
 * Cada cuenta imputable del plan se asocia a un código RG 49 (campo rg49cod, heredable de la cuenta padre).
 * Si el código es un grupo (tiene subcuentas en la estructura oficial), la cuenta se informa como
 * "nueva cuenta a incluir" dentro de ese grupo, con su propio nombre. */
(function (root) {
  'use strict';
  const C = root.Conta || (typeof require !== 'undefined' ? require('./core-irp.js') : null);
  const E = root.RG49 || (typeof require !== 'undefined' ? require('./rg49-estructura.js') : null);

  /* ---------- Códigos RG 49 del plan de cuentas estándar ---------- */
  const MAPA = {
    '1.1.1.01.01': '1.01.01.02', '1.1.1.01.02': '1.01.01.02', '1.1.1.01.03': '1.01.01.03', '1.1.1.02': '1.01.01.04',
    '1.1.2.01.01': '1.01.02.01',
    '1.1.3.01.01': '1.01.03.01', '1.1.3.01.02': '1.01.03.01', '1.1.3.01.03': '1.01.03.99', '1.1.3.01.04': '1.01.03.01',
    '1.1.4.01.01': '1.01.03.05.03', '1.1.4.01.02': '1.01.03.05.03', '1.1.4.01.03': '1.01.03.05.02', '1.1.4.01.04': '1.01.03.05.01', '1.1.4.01.05': '1.01.03.05.01', '1.1.4.01.06': '1.01.03.05.03',
    '1.1.4.02.01': '1.01.03.06.01', '1.1.4.02.02': '1.01.03.03',
    '1.1.5.01.01': '1.01.04.01.01', '1.1.5.01.02': '1.01.04.01.02', '1.1.5.01.03': '1.01.04.01.03', '1.1.5.01.04': '1.01.04.11',
    '1.1.6.01.01': '1.01.05.02', '1.1.6.01.02': '1.01.05.01',
    '1.2.1.01.01': '1.02.01.01', '1.2.2.01.01': '1.02.03.01',
    '1.2.3.01.01': '1.02.04.01', '1.2.3.01.02': '1.02.04.02', '1.2.3.01.03': '1.02.04.03', '1.2.3.01.04': '1.02.04.05', '1.2.3.01.05': '1.02.04.04', '1.2.3.02': '1.02.04.99',
    '1.2.4.01.01': '1.02.07.01', '1.2.4.01.02': '1.02.07.99', '1.2.5.01.01': '1.02.06.01',
    '2.1.1.01.01': '2.01.01.01', '2.1.1.01.02': '2.01.01.02', '2.1.1.01.03': '2.01.01.04', '2.1.1.01.04': '2.01.01.01',
    '2.1.2.01.01': '2.01.02.01', '2.1.2.01.02': '2.01.02.05', '2.1.2.01.03': '2.01.02.04',
    '2.1.3.01.01': '2.01.03.01.02', '2.1.3.01.02': '2.01.03.01.02', '2.1.3.01.03': '2.01.03.01.02', '2.1.3.01.04': '2.01.03.01.01', '2.1.3.01.05': '2.01.03.01.03', '2.1.3.01.06': '2.01.03.01.03', '2.1.3.01.07': '2.01.03.01.01',
    '2.1.3.02': '2.01.03.02', '2.1.3.03.01': '2.01.05.01', '2.1.3.03.02': '2.01.02.02', '2.1.3.03.03': '2.01.03.03', '2.1.4.01.01': '2.01.04.03',
    '2.2.1.01.01': '2.02.01.01', '2.2.2.01.01': '2.02.02.01', '2.2.3.01.01': '2.02.03',
    '3.1.1.01.01': '3.01.01.01', '3.2.1.01.01': '3.02.01', '3.2.1.01.02': '3.02.02.01', '3.2.1.01.03': '3.02.03',
    '3.3.1.01.01': '3.03.01', '3.3.1.02.01': '3.03.02',
    '4.1.1.01.01': '4.01.01', '4.1.1.01.02': '4.01.01', '4.1.1.01.03': '4.01.02', '4.1.1.01.04': '4.08', '4.1.1.02.01': '4.09', '4.1.1.03.01': '4.99',
    '4.2.1.01.01': '8.01', '4.2.1.01.02': '8.05', '4.2.2': '8', '4.3': '8',
    '5.1.1.01.01': '5.01.01', '5.1.1.01.02': '5.01.01', '5.1.1.01.03': '5.09', '5.1.1.01.04': '5.01.01',
    '5.2.1.01.01': '11.01.01', '5.2.1.01.02': '11.01.02', '5.2.1.01.03': '11.01.03', '5.2.1.01.04': '11.01.03',
    '5.2.1.02.01': '11.05', '5.2.1.02.02': '11.06', '5.2.1.02.03': '11.06', '5.2.1.02.04': '11.06', '5.2.1.02.05': '11.04', '5.2.1.02.06': '11.11',
    '5.2.1.02.07': '11.08', '5.2.1.02.08': '11.09', '5.2.1.02.09': '11.10', '5.2.1.02.10': '11.17', '5.2.1.02.11': '11',
    '5.2.1.03.01': '15.01', '5.2.1.03.02': '15.02',
    '5.2.2.01.01': '10.04', '5.2.2.01.02': '10.02', '5.2.2.01.03': '10.05', '5.2.2.01.04': '14.02', '5.2.2.01.05': '14.02',
    '5.3.1.01.01': '13.01', '5.3.1.01.02': '13.03', '5.3.1.01.03': '13.04',
    '5.4.1.01.01': '11', '5.4.1.01.02': '11.18', '5.4.1.01.03': '11.17', '5.4.1.01.04': '11.15',
    '5.5.1.01.01': '19', '5.6': '17'
  };
  const POR_RUBRO = { AC_DISP: '1.01.01', AC_INV: '1.01.02', AC_CRED: '1.01.03', AC_OCRED: '1.01.03', AC_INVENT: '1.01.04', AC_OTROS: '1.01.05',
    ANC_CRED: '1.02.01', ANC_INV: '1.02.03', ANC_PPE: '1.02.04', ANC_INTANG: '1.02.07', ANC_OTROS: '1.02.06',
    PC_COM: '2.01.01', PC_FIN: '2.01.02', PC_OTRAS: '2.01.03', PC_PREV: '2.01.04', PNC_COM: '2.02.01', PNC_FIN: '2.02.02', PNC_OTRAS: '2.02.03',
    PN_CAP: '3.01.01', PN_RES: '3.02.03', PN_RESACUM: '3.03.01', PN_RESEJ: '3.03.02',
    ER_VENTAS: '4', ER_COSTO: '5', ER_VTAS: '10', ER_ADM: '11', ER_FIN: '8', ER_GFIN: '13', ER_OTROS: '8', ER_OTROSEG: '17', ER_IRE: '19' };

  // Índice de la estructura oficial
  const idx = lista => { const by = {}; lista.forEach(([c, n], i) => { if (c) by[c] = { codigo: c, nombre: n, orden: i, hijos: [] }; }); Object.values(by).forEach(x => { const p = padre(x.codigo); if (p && by[p]) by[p].hijos.push(x.codigo); }); return by; };
  const padre = c => { const i = c.lastIndexOf('.'); return i < 0 ? null : c.slice(0, i); };
  const BGI = idx(E.BG), ERI = idx(E.ER);
  const NUEVAS = new Set(E.NUEVAS || []);
  C.RG49_BG = BGI; C.RG49_ER = ERI;
  // Código existente más cercano (si el código no está, se sube al grupo)
  const ajustar = (cod, I) => { let c = String(cod || '').trim(); while (c && !I[c]) c = padre(c); return c || null; };

  // Código RG 49 de una cuenta: propio, heredado, del plan estándar o por rubro
  C.codigoRG49 = function (plan, codigo) {
    const c = plan.by[codigo]; if (!c) return null;
    const cadena = [codigo].concat(c.ancestros || []);
    for (const k of cadena) { const x = plan.by[k]; if (x && x.rg49cod) return String(x.rg49cod).trim(); }
    for (const k of cadena) if (MAPA[k]) return MAPA[k];
    return POR_RUBRO[c.rubro] || (['I', 'E'].includes(c.tipo) ? (c.tipo === 'I' ? '8' : '11') : null);
  };
  C.MAPA_RG49 = MAPA;

  /* ---------- Cálculo genérico: imputar saldos a la estructura ---------- */
  function imputar(plan, saldos, I, signo) {
    const directo = {}, extras = {}, cuentas = {};
    Object.keys(saldos).forEach(k => {
      const c = plan.by[k]; const v = Math.round(saldos[k] * signo(c, k)); if (!c || !v) return;
      const cod = ajustar(C.codigoRG49(plan, k), I); if (!cod) return;
      (cuentas[cod] || (cuentas[cod] = [])).push({ codigo: k, nombre: c.nombre, importe: v });
      if (I[cod].hijos.length || NUEVAS.has(cod)) (extras[cod] || (extras[cod] = [])).push({ codigo: k, nombre: c.nombre, importe: v });
      else directo[cod] = (directo[cod] || 0) + v;
    });
    const total = {};
    const calc = cod => { if (total[cod] !== undefined) return total[cod]; const x = I[cod]; let t = directo[cod] || 0; (extras[cod] || []).forEach(e => { t += e.importe; }); x.hijos.forEach(h => { t += calc(h); }); total[cod] = t; return t; };
    Object.keys(I).forEach(calc);
    return { total, extras, cuentas };
  }

  /* ---------- Anexo 1: Balance General ---------- */
  C.rg49Balance = function (data, plan, hasta, asientos) {
    const s = C.saldosAl(data, plan, hasta, asientos);
    const pat = {}; Object.keys(s.saldo).forEach(k => { const c = plan.by[k]; if (c && ['A', 'P', 'PN'].includes(c.tipo)) pat[k] = s.saldo[k]; });
    const r = imputar(plan, pat, BGI, c => C.signoNatural(c.tipo));
    // Resultado del ejercicio (las cuentas de resultado no se refunden: se calcula)
    const t = C.totalesPorTipo(plan, s.saldo);
    const res = Math.round(t.resultado);
    if (res) { ['3.03.02', '3.03', '3'].forEach(k => { r.total[k] = (r.total[k] || 0) + res; }); r.resultadoEjercicio = res; }
    r.activo = r.total['1'] || 0; r.pasivo = r.total['2'] || 0; r.pn = r.total['3'] || 0;
    r.diferencia = Math.round(r.activo - r.pasivo - r.pn);
    r.desde = s.desde; r.hasta = hasta;
    return r;
  };

  /* ---------- Anexo 2: Estado de Resultados ---------- */
  const GRUPOS_INGRESO = ['4', '7', '8', '14', '17'];
  C.rg49Resultados = function (data, plan, hasta, asientos) {
    const s = C.saldosAl(data, plan, hasta, asientos);
    const resu = {}; Object.keys(s.saldo).forEach(k => { const c = plan.by[k]; if (c && ['I', 'E'].includes(c.tipo)) resu[k] = s.saldo[k]; });
    const top = k => { const cod = ajustar(C.codigoRG49(plan, k), ERI); return cod ? cod.split('.')[0] : '11'; };
    const r = imputar(plan, resu, ERI, (c, k) => GRUPOS_INGRESO.includes(top(k)) ? -1 : 1);
    const T = k => r.total[k] || 0;
    r.total['6'] = T('4') - T('5');
    r.total['9'] = r.total['6'] + T('7') + T('8');
    r.total['12'] = r.total['9'] - T('10') - T('11');
    r.total['16'] = r.total['12'] - T('13') + T('14') - T('15');
    r.total['18'] = r.total['16'] + T('17');
    r.total['20'] = r.total['18'] - T('19');
    r.resultado = Math.round(C.totalesPorTipo(plan, s.saldo).resultado);
    r.diferencia = Math.round(r.total['20'] - r.resultado);
    r.desde = s.desde; r.hasta = hasta;
    return r;
  };
  C.RG49_SUBTOTALES_ER = ['6', '9', '12', '16', '18', '20'];

  /* ---------- Anexo 3: Estado de Flujo de Efectivo (método directo) ---------- */
  C.rg49Flujo = function (data, plan, hasta, asientos) {
    asientos = asientos || C.todosLosAsientos(data);
    const cfg = C.config(data);
    const desde = C.inicioEjercicio(hasta, (data.cliente && data.cliente.cierreMes) || 12);
    const codDe = k => { const c = C.codigoRG49(plan, k) || ''; return c; };
    const esCaja = k => codDe(k).startsWith('1.01.01');
    const IVA_OP = new Set([cfg.ctaIvaDF10, cfg.ctaIvaDF5, cfg.ctaIvaCF10, cfg.ctaIvaCF5]);
    const EMPLEADOS = new Set([cfg.ctaSueldos, cfg.ctaAportePatronal, cfg.ctaAguinaldoGasto, cfg.ctaVacacionesGasto, cfg.ctaDescuentosPersonal]);
    const categoria = k => {
      const c = plan.by[k] || {}, co = codDe(k);
      if (EMPLEADOS.has(k) || co.startsWith('2.01.03.02') || co.startsWith('1.01.03.03') || co.startsWith('11.01') || co.startsWith('10.01')) return 'empleados';
      if (co.startsWith('2.01.03.01') || co.startsWith('1.01.03.05') || co.startsWith('11.17') || co === '19' || co.startsWith('19')) return 'impuestos';
      if (co.startsWith('1.01.02')) return 'invTemp';
      if (co.startsWith('1.02.03')) return 'invLP';
      if (co.startsWith('1.02.04') || co.startsWith('1.02.06') || co.startsWith('1.02.07')) return 'ppe';
      if (co.startsWith('3.01')) return 'capital';
      if (co.startsWith('2.01.02.05') || co.startsWith('2.02.02.05') || co.startsWith('13.01') || co.startsWith('13.02') || co.startsWith('8.01')) return 'intereses';
      if (co.startsWith('2.01.02') || co.startsWith('2.02.02')) return 'prestamos';
      if (co.startsWith('2.01.03.03') || co.startsWith('3.03.01')) return 'dividendos';
      if (co.startsWith('2.01.01.02') || co.startsWith('2.02.01.02') || co.startsWith('1.01.03.06.02')) return 'provExterior';
      if (c.tipo === 'I' || co.startsWith('1.01.03.01') || co.startsWith('1.02.01.01') || co.startsWith('2.01.05') || co.startsWith('2.02.05')) return 'ventas';
      if (co.startsWith('2.01.01') || co.startsWith('2.02.01') || co.startsWith('1.01.03.06') || co.startsWith('1.01.04') || co.startsWith('1.01.05') || c.tipo === 'E') return 'provLocales';
      return 'otras';
    };
    const anio = (desde2, hasta2) => {
      const t = { ventas: 0, provLocales: 0, provExterior: 0, empleados: 0, otras: 0, impuestos: 0, invTemp: 0, invLP: 0, ppe: 0, capital: 0, prestamos: 0, dividendos: 0, intereses: 0, tc: 0 };
      asientos.forEach(a => {
        if (!a.fecha || a.fecha < desde2 || a.fecha > hasta2 || a.cierre) return;
        let caja = 0; const contra = {};
        a.lineas.forEach(l => { const n = l.debe - l.haber; if (esCaja(l.cuenta)) caja += n; else contra[l.cuenta] = (contra[l.cuenta] || 0) + n; });
        caja = Math.round(caja); if (!caja) return;
        if (a.origen === 'dif. cambio') { t.tc += caja; return; }
        let ks = Object.keys(contra).filter(k => Math.round(contra[k]) && !IVA_OP.has(k));
        if (!ks.length) ks = Object.keys(contra).filter(k => Math.round(contra[k]));
        if (!ks.length) { t.otras += caja; return; }
        const base = ks.reduce((s, k) => s + Math.abs(contra[k]), 0);
        let asignado = 0;
        ks.forEach((k, i) => { const v = i === ks.length - 1 ? caja - asignado : Math.round(caja * Math.abs(contra[k]) / base); asignado += v; t[categoria(k)] += v; });
      });
      const saldoCaja = f => { let s = 0; asientos.forEach(a => { if (a.fecha <= f && !a.cierre) a.lineas.forEach(l => { if (esCaja(l.cuenta)) s += l.debe - l.haber; }); }); return Math.round(s); };
      t.netoOp = t.ventas + t.provLocales + t.provExterior + t.empleados + t.otras + t.impuestos;
      t.netoInv = t.invTemp + t.invLP + t.ppe;
      t.netoFin = t.capital + t.prestamos + t.dividendos + t.intereses;
      t.aumento = t.netoOp + t.netoInv + t.netoFin + t.tc;
      t.inicio = saldoCaja(C.addDias(desde2, -1)); t.cierre = saldoCaja(hasta2);
      t.diferencia = Math.round(t.inicio + t.aumento - t.cierre);
      return t;
    };
    const r = anio(desde, hasta);
    r.desde = desde; r.hasta = hasta;
    return r;
  };
  C.RG49_FLUJO_FILAS = [
    ['FLUJO DE EFECTIVO POR ACTIVIDADES OPERATIVAS', null, 'titulo'], ['VENTAS NETAS (COBRO NETO)', 'ventas'], ['PAGO A PROVEEDORES LOCALES (PAGO NETO)', 'provLocales'],
    ['PAGO A PROVEEDORES DEL EXTERIOR (PAGO NETO)', 'provExterior'], ['EFECTIVO PAGADO A EMPLEADOS', 'empleados'], ['EFECTIVO GENERADO (USADO) POR OTRAS ACTIVIDADES OPERATIVAS', 'otras'],
    ['PAGO DE IMPUESTOS', 'impuestos'], ['EFECTIVO NETO POR ACTIVIDADES OPERATIVAS', 'netoOp', 'total'],
    ['FLUJO DE EFECTIVO POR ACTIVIDADES DE INVERSIÓN', null, 'titulo'], ['AUMENTO/DISMINUCIÓN NETO/A DE INVERSIONES TEMPORARIAS', 'invTemp'],
    ['AUMENTO/DISMINUCIÓN NETO/A DE INVERSIONES A LARGO PLAZO', 'invLP'], ['AUMENTO/DISMINUCIÓN NETO/A DE PROPIEDAD, PLANTA Y EQUIPO', 'ppe'], ['EFECTIVO NETO POR ACTIVIDADES DE INVERSIÓN', 'netoInv', 'total'],
    ['FLUJO DE EFECTIVO POR ACTIVIDADES DE FINANCIAMIENTO', null, 'titulo'], ['APORTE DE CAPITAL', 'capital'], ['AUMENTO/DISMINUCIÓN NETO/A DE PRÉSTAMOS', 'prestamos'],
    ['DIVIDENDOS PAGADOS', 'dividendos'], ['AUMENTO/DISMINUCIÓN NETO/A DE INTERESES', 'intereses'], ['EFECTIVO NETO POR ACTIVIDADES DE FINANCIAMIENTO', 'netoFin', 'total'],
    ['EFECTO DE LAS GANANCIAS O PÉRDIDAS POR DIFERENCIAS DE TIPO DE CAMBIO', 'tc'], ['AUMENTO/DISMINUCIÓN NETO/A DE EFECTIVOS Y SUS EQUIVALENTES', 'aumento', 'total'],
    ['EFECTIVO Y SUS EQUIVALENTES AL COMIENZO DEL PERIODO', 'inicio'], ['EFECTIVO Y SUS EQUIVALENTES AL CIERRE DEL PERIODO', 'cierre', 'gran']
  ];

  /* ---------- Anexo 4: Estado de Cambios del Patrimonio Neto ---------- */
  C.RG49_PN_COLS = ['CAPITAL INTEGRADO', 'RESERVA LEGAL', 'RESERVA DE REVALÚO', 'OTRAS RESERVAS', 'RESULTADOS ACUMULADOS', 'RESULTADO DEL EJERCICIO', 'PATRIMONIO NETO'];
  C.rg49PN = function (data, plan, hasta, asientos) {
    asientos = asientos || C.todosLosAsientos(data);
    const cm = (data.cliente && data.cliente.cierreMes) || 12;
    const finX1 = hasta, iniX1 = C.inicioEjercicio(hasta, cm), finX0 = C.addDias(iniX1, -1), iniX0 = C.inicioEjercicio(finX0, cm), finXm = C.addDias(iniX0, -1);
    const col = f => { const b = C.rg49Balance(data, plan, f, asientos).total, g = k => b[k] || 0;
      return [g('3.01'), g('3.02.01'), g('3.02.02'), g('3.02') - g('3.02.01') - g('3.02.02'), g('3.03') - g('3.03.02'), g('3.03.02')]; };
    const dividendos = (d1, d2) => Math.round((data.dividendos || []).filter(x => x.fecha >= d1 && x.fecha <= d2).reduce((s, x) => s + C.num(x.monto), 0));
    const movs = (S, Ef, d1, d2) => {
      const div = dividendos(d1, d2);
      const dCap = Ef[0] - S[0], dLeg = Ef[1] - S[1], dRev = Ef[2] - S[2], dOtr = Ef[3] - S[3];
      const ajuste = Ef[4] - (S[4] + S[5] - dLeg - dOtr - div);
      const fila = v => v.concat([v.reduce((a, b) => a + b, 0)]);
      return [
        ['INTEGRACIÓN DE CAPITAL', fila([dCap, 0, 0, 0, 0, 0])],
        ['TRANSFERENCIA A DIVIDENDOS A PAGAR', fila([0, 0, 0, 0, -div, 0])],
        ['TRANSFERENCIA A RESULTADOS ACUMULADOS', fila([0, 0, 0, 0, S[5], -S[5]])],
        ['AJUSTES/ DESAFECTAC. DE RESULT. ACUMULADOS', fila([0, 0, 0, 0, ajuste, 0])],
        ['RESERVA LEGAL', fila([0, dLeg, 0, 0, -dLeg, 0])],
        ['RESERVA DE REVALÚO', fila([0, 0, dRev, 0, 0, 0])],
        ['OTRAS RESERVAS', fila([0, 0, 0, dOtr, -dOtr, 0])],
        ['RESULTADO DEL EJERCICIO', fila([0, 0, 0, 0, 0, Ef[5]])]
      ];
    };
    const tot = v => v.concat([v.reduce((a, b) => a + b, 0)]);
    const Sm = col(finXm), S0 = col(finX0), S1 = col(finX1);
    const x0 = +finX0.slice(0, 4), x1 = +finX1.slice(0, 4);
    return {
      columnas: C.RG49_PN_COLS, desde: iniX1, hasta: finX1,
      filas: [['SALDO AL INICIO DEL EJERCICIO ' + x0, tot(Sm), 'total'], ['MOVIMIENTOS DEL EJERCICIO ' + x0, null, 'titulo']]
        .concat(movs(Sm, S0, iniX0, finX0))
        .concat([['SALDO AL CIERRE DEL EJERCICIO ' + x0 + ' E INICIO DEL EJERCICIO ' + x1, tot(S0), 'total'], ['MOVIMIENTOS DEL EJERCICIO ' + x1, null, 'titulo']])
        .concat(movs(S0, S1, iniX1, finX1))
        .concat([['SALDO AL CIERRE DEL EJERCICIO ' + x1, tot(S1), 'gran']])
    };
  };

  /* ---------- Anexo 6: Cuadro de revalúo y depreciación ---------- */
  C.rg49Revaluo = function (data, anio) {
    const cm = (data.cliente && data.cliente.cierreMes) || 12;
    const { hasta } = C.rangoEjercicio(anio, cm);
    const coef = y => C.num(((data.coefRevaluo || {})[y])) || 1;
    const filas = (data.bienes || []).filter(b => b.fechaAlta && b.fechaAlta <= hasta).map(b => {
      const costo = C.num(b.valor), vida = C.num(b.vidaUtil) || 1, y0 = +b.fechaAlta.slice(0, 4);
      let valor = costo, acum = 0, valorAnt = costo, acumAnt = 0, cuota = 0;
      for (let y = y0; y <= anio; y++) {
        if (y > y0) valor = Math.round(valor * coef(y)), acum = Math.round(acum * coef(y));
        const mesesAnio = y === y0 ? 13 - +b.fechaAlta.slice(5, 7) : 12;
        const baja = b.fechaBaja && +b.fechaBaja.slice(0, 4) < y;
        cuota = baja ? 0 : Math.min(Math.round(valor / vida * mesesAnio / 12), Math.max(0, valor - acum));
        if (y === anio) { valorAnt = y > y0 ? Math.round(valor / coef(y)) : costo; acumAnt = acum; }
        acum += cuota;
      }
      const transcurrido = C.difDias(b.fechaAlta, hasta) / 365.25;
      const depCont = C.depAcumulada(b, hasta.slice(0, 7));
      return { descripcion: b.descripcion, fecha: b.fechaAlta, vida, restante: Math.max(0, Math.round((vida - transcurrido) * 10) / 10), costo,
        fiscalAnt: valorAnt, contableAnt: costo, coeficiente: coef(anio), fiscal: valor, contable: costo, cuotaDeducible: cuota, cuotaNoDeducible: 0,
        depFiscal: Math.min(acum, valor), depContable: depCont, netoFiscal: valor - Math.min(acum, valor), netoContable: costo - depCont };
    });
    const T = k => filas.reduce((s, f) => s + (f[k] || 0), 0);
    const totales = {}; ['costo', 'fiscalAnt', 'contableAnt', 'fiscal', 'contable', 'cuotaDeducible', 'cuotaNoDeducible', 'depFiscal', 'depContable', 'netoFiscal', 'netoContable'].forEach(k => { totales[k] = T(k); });
    return { anio, hasta, filas, totales };
  };

  /* ---------- Anexo 5: Notas (contenido sugerido) ---------- */
  C.rg49NotasPorDefecto = function (data, anio) {
    const cli = data.cliente || {};
    return {
      1: `${cli.razon || ''}, RUC ${cli.ruc || ''}. Actividad principal: ${cli.actividad || '—'}. Representante legal: ${cli.representante || '—'}.`,
      2: 'Los estados financieros han sido preparados de acuerdo con las normas contables vigentes en Paraguay y se presentan en guaraníes, en forma comparativa con el ejercicio anterior, conforme a los modelos establecidos por la Resolución General N° 49/2014.',
      3: 'Disponibilidades y créditos: valor nominal. Inventarios: costo de adquisición (costo promedio ponderado). Propiedad, planta y equipo: costo de adquisición revaluado según los coeficientes oficiales, menos depreciación acumulada calculada por el método de línea recta según la vida útil. Deudas: valor nominal más intereses devengados. Moneda extranjera: tipo de cambio de cierre.',
      4: 'Ver la composición de las principales cuentas patrimoniales en forma comparativa.',
      5: 'Ver la composición de las principales cuentas de resultados en forma comparativa.',
      6: 'Ver el detalle de rentas exentas o no gravadas y gastos no deducibles del ejercicio.',
      7: 'No existen contingencias ni hechos relevantes que pudieran generar desembolsos significativos en el siguiente ejercicio fiscal.',
      8: 'No se registraron operaciones significativas con partes vinculadas durante el ejercicio.',
      9: 'No existen hechos posteriores al cierre que puedan impactar o requerir ajustes a los estados financieros presentados.',
      10: 'No existen otras notas o revelaciones que requieran ser expuestas.'
    };
  };
  // Composición de cuentas (notas 4 y 5) y partidas con diferencia fiscal (nota 6)
  C.rg49Composicion = function (data, plan, corte1, corte2) {
    const a = C.todosLosAsientos(data);
    const s2 = C.saldosAl(data, plan, corte2, a).saldo, s1 = C.saldosAl(data, plan, corte1, a).saldo;
    const filas = tipos => plan.list.filter(c => c.imputable && tipos.includes(c.tipo) && (Math.round(s2[c.codigo] || 0) || Math.round(s1[c.codigo] || 0)))
      .map(c => { const sg = ['A', 'E'].includes(c.tipo) ? 1 : -1; const cod = C.codigoRG49(plan, c.codigo); return { rg49: cod, grupo: (BGI[ajustar(cod, BGI)] || ERI[ajustar(cod, ERI)] || {}).nombre || '', codigo: c.codigo, nombre: c.nombre, x1: Math.round((s2[c.codigo] || 0) * sg), x0: Math.round((s1[c.codigo] || 0) * sg), nd: c.noDeducible, ng: c.noGravado }; });
    const pat = filas(['A', 'P', 'PN']), res = filas(['I', 'E']);
    return { patrimoniales: pat, resultados: res, fiscales: res.filter(f => f.nd || f.ng) };
  };

  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
