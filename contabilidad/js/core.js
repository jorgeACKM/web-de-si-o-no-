/* Motor contable: cálculos puros, sin DOM. Se puede probar con Node. */
(function (root) {
  'use strict';
  const PD = root.PlanDefault || (typeof require !== 'undefined' ? require('./plan-default.js') : null);
  const C = {};

  C.num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    // Acepta "1.234.567" (formato PY) y "1234567,50"
    let s = String(v).trim().replace(/\s/g, '');
    if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  C.r0 = n => Math.round(C.num(n));
  C.r2 = n => Math.round(C.num(n) * 100) / 100;

  /* ---------- Fechas ---------- */
  C.pad = n => String(n).padStart(2, '0');
  C.parseFecha = function (v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${C.pad(v.getMonth() + 1)}-${C.pad(v.getDate())}`;
    if (typeof v === 'number') { // serial de Excel
      const d = new Date(Math.round((v - 25569) * 86400000));
      return `${d.getUTCFullYear()}-${C.pad(d.getUTCMonth() + 1)}-${C.pad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${C.pad(m[2])}-${C.pad(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${C.pad(m[2])}-${C.pad(m[1])}`; }
    return '';
  };
  C.finDeMes = function (periodo) { // 'YYYY-MM' -> 'YYYY-MM-DD'
    const [y, m] = periodo.split('-').map(Number);
    return `${periodo}-${C.pad(new Date(y, m, 0).getDate())}`;
  };
  C.mesAnterior = function (periodo) {
    let [y, m] = periodo.split('-').map(Number);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
    return `${y}-${C.pad(m)}`;
  };
  // Inicio del ejercicio fiscal que contiene la fecha, según mes de cierre (1-12).
  C.inicioEjercicio = function (fecha, cierreMes) {
    cierreMes = +cierreMes || 12;
    const y = +fecha.slice(0, 4), m = +fecha.slice(5, 7);
    const mesIni = cierreMes === 12 ? 1 : cierreMes + 1;
    const yIni = m >= mesIni ? y : y - 1;
    return `${yIni}-${C.pad(mesIni)}-01`;
  };
  // Ejercicio que cierra en el año dado.
  C.rangoEjercicio = function (anio, cierreMes) {
    cierreMes = +cierreMes || 12;
    const hasta = C.finDeMes(`${anio}-${C.pad(cierreMes)}`);
    return { desde: C.inicioEjercicio(hasta, cierreMes), hasta };
  };

  /* ---------- RUC ---------- */
  // Dígito verificador módulo 11 (algoritmo de la SET/DNIT).
  C.dvRuc = function (ruc) {
    const s = String(ruc).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!s) return null;
    let digits = '';
    for (const ch of s) digits += /\d/.test(ch) ? ch : String(ch.charCodeAt(0));
    let k = 2, total = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (k > 11) k = 2;
      total += (+digits[i]) * k++;
    }
    const r = total % 11;
    return r > 1 ? 11 - r : 0;
  };
  C.normalizarRuc = function (v) {
    const s = String(v || '').trim().replace(/\s/g, '');
    if (!s) return '';
    if (s.includes('-')) return s;
    if (/^\d+$/.test(s) && s.length >= 4) return s; // sin DV, se respeta
    return s;
  };
  C.rucValido = function (v) {
    const m = String(v || '').match(/^([0-9A-Za-z]+)-(\d)$/);
    if (!m) return null; // no se puede validar (sin DV)
    return C.dvRuc(m[1]) === +m[2];
  };

  /* ---------- Comprobantes ---------- */
  C.ivaIncluido = (total, tasa) => tasa === 10 ? Math.round(total / 11) : tasa === 5 ? Math.round(total / 21) : 0;
  C.esNC = doc => doc.tipoDoc === 'NOTA_CREDITO';
  C.signo = doc => C.esNC(doc) ? -1 : 1;
  // Montos de la factura: g10 y g5 son totales IVA incluido (como en el comprobante paraguayo).
  // Comprobantes en moneda extranjera: los importes se cargan en US$ y se convierten con doc.tc.
  C.esME = doc => doc.moneda === 'USD' && C.num(doc.tc) > 0;
  C.desglose = function (doc) {
    const f = C.esME(doc) ? C.num(doc.tc) : 1;
    const g10 = C.r0(C.num(doc.g10) * f), g5 = C.r0(C.num(doc.g5) * f), exenta = C.r0(C.num(doc.exenta) * f), exportacion = C.r0(C.num(doc.exportacion) * f);
    const iva10 = doc.iva10 !== undefined && doc.iva10 !== '' && doc.iva10 !== null ? C.r0(doc.iva10) : C.ivaIncluido(g10, 10);
    const iva5 = doc.iva5 !== undefined && doc.iva5 !== '' && doc.iva5 !== null ? C.r0(doc.iva5) : C.ivaIncluido(g5, 5);
    return {
      g10, g5, exenta, exportacion, iva10, iva5,
      base10: g10 - iva10, base5: g5 - iva5,
      iva: iva10 + iva5, total: g10 + g5 + exenta + exportacion,
      totalME: f !== 1 ? C.r2(C.num(doc.g10) + C.num(doc.g5) + C.num(doc.exenta) + C.num(doc.exportacion)) : 0
    };
  };
  C.validarNumeroComprobante = n => /^\d{3}-\d{3}-\d{7}$/.test(String(n || ''));
  C.formatearNumeroComprobante = function (n) {
    const s = String(n || '').trim();
    const m = s.match(/^(\d{1,3})-(\d{1,3})-(\d{1,7})$/);
    if (m) return `${m[1].padStart(3, '0')}-${m[2].padStart(3, '0')}-${m[3].padStart(7, '0')}`;
    const d = s.replace(/\D/g, '');
    if (d.length === 13) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return s;
  };
  C.siguienteNumero = function (n) {
    const f = C.formatearNumeroComprobante(n);
    const m = f.match(/^(\d{3}-\d{3}-)(\d{7})$/);
    return m ? m[1] + String(+m[2] + 1).padStart(7, '0') : '';
  };

  /* ---------- Plan de cuentas ---------- */
  C.cmpCodigo = function (a, b) {
    const pa = String(a).split('.'), pb = String(b).split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if (pa[i] === undefined) return -1;
      if (pb[i] === undefined) return 1;
      const na = +pa[i], nb = +pb[i];
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
  };
  C.tipoPorCodigo = function (codigo) {
    const d = String(codigo).trim()[0];
    return { 1: 'A', 2: 'P', 3: 'PN', 4: 'I' }[d] || 'E';
  };
  const RG49_FALLBACK = { A: 'AC_OTROS', P: 'PC_OTRAS', PN: 'PN_RESACUM', I: 'ER_OTROS', E: 'ER_ADM' };

  // Construye índice jerárquico: nivel, padre, ancestros, imputable, tipo y rubro heredado.
  C.prepararPlan = function (cuentas) {
    const list = (cuentas || []).filter(c => c && String(c.codigo || '').trim())
      .map(c => Object.assign({}, c, { codigo: String(c.codigo).trim() }));
    list.sort((a, b) => C.cmpCodigo(a.codigo, b.codigo));
    const by = {};
    list.forEach(c => { by[c.codigo] = c; c.hijos = []; });
    const conPuntos = list.some(c => c.codigo.includes('.'));
    list.forEach(c => {
      let p = null, code = c.codigo;
      while (!p) {
        if (conPuntos) { const i = code.lastIndexOf('.'); if (i < 0) break; code = code.slice(0, i); }
        else { if (code.length <= 1) break; code = code.slice(0, -1); }
        if (by[code]) p = by[code];
      }
      c.padre = p ? p.codigo : null;
      if (p) p.hijos.push(c.codigo);
    });
    const avisos = [];
    list.forEach(c => {
      c.ancestros = [];
      let p = c.padre;
      while (p) { c.ancestros.push(p); p = by[p].padre; }
      if (c.nivel) c.nivel = +c.nivel;
      else if (conPuntos) c.nivel = c.codigo.split('.').length;
      else c.nivel = c.ancestros.length + 1;
      if (c.imputable === undefined || c.imputable === null || c.imputable === '') c.imputable = c.hijos.length === 0;
      c.imputable = c.imputable === true || /^(s|si|sí|x|1|true)$/i.test(String(c.imputable));
      c.tipo = c.tipo && /^(A|P|PN|I|E)$/.test(c.tipo) ? c.tipo : C.tipoPorCodigo(c.codigo);
      let rubro = c.rg49 || '';
      for (let i = 0; !rubro && i < c.ancestros.length; i++) rubro = by[c.ancestros[i]].rg49 || '';
      if (!rubro && c.imputable) avisos.push(`Cuenta ${c.codigo} sin rubro RG49 (se asigna ${RG49_FALLBACK[c.tipo]})`);
      c.rubro = rubro || RG49_FALLBACK[c.tipo];
      c.noDeducible = !!c.noDeducible && c.noDeducible !== 'N';
      c.noGravado = !!c.noGravado && c.noGravado !== 'N';
    });
    return { list, by, avisos };
  };

  C.signoNatural = tipo => (tipo === 'A' || tipo === 'E') ? 1 : -1;

  /* ---------- Asientos ---------- */
  // me: importe en moneda extranjera (US$) con signo (+ debe, − haber), solo para cuentas en M/E.
  function linea(cuenta, debe, haber, me) { const l = { cuenta, debe: C.r0(debe), haber: C.r0(haber) }; if (me) l.me = C.r2(me); return l; }
  function compactar(lineas) {
    // Une líneas de la misma cuenta y lado; elimina importes cero; invierte negativos.
    const m = new Map(), me = new Map();
    lineas.forEach(l => {
      let d = l.debe || 0, h = l.haber || 0;
      if (d < 0) { h -= d; d = 0; }
      if (h < 0) { d -= h; h = 0; }
      const neto = d - h;
      if (!neto && !l.me) return;
      m.set(l.cuenta, (m.get(l.cuenta) || 0) + neto);
      if (l.me) me.set(l.cuenta, (me.get(l.cuenta) || 0) + l.me);
    });
    const out = [];
    m.forEach((neto, cuenta) => { if (neto || me.get(cuenta)) out.push(neto >= 0 ? linea(cuenta, neto, 0, me.get(cuenta)) : linea(cuenta, 0, -neto, me.get(cuenta))); });
    out.sort((a, b) => (b.debe - a.debe) || 0);
    return out;
  }

  C.asientoVenta = function (v, cfg) {
    const d = C.desglose(v), s = C.signo(v);
    const me = C.esME(v);
    const contra = v.condicion === 'CREDITO' ? (me ? cfg.ctaClientesME : cfg.ctaClientes) : (me ? cfg.ctaCajaME : cfg.ctaCaja);
    const L = [
      linea(contra, s * d.total, 0, me ? s * d.totalME : 0),
      linea(v.cuenta || cfg.ctaVentas10, 0, s * d.base10),
      linea(v.cuenta || cfg.ctaVentas5, 0, s * d.base5),
      linea(v.cuenta || cfg.ctaVentasEx, 0, s * d.exenta),
      linea(cfg.ctaExportaciones, 0, s * d.exportacion),
      linea(cfg.ctaIvaDF10, 0, s * d.iva10),
      linea(cfg.ctaIvaDF5, 0, s * d.iva5)
    ];
    return {
      id: 'V' + v.id, fecha: v.fecha, origen: 'venta', ref: v.id,
      concepto: `${C.esNC(v) ? 'NC emitida' : 'Venta'} ${v.numero || ''} ${v.razon || ''}`.trim(),
      lineas: compactar(L)
    };
  };

  C.asientoCompra = function (c, cfg) {
    const d = C.desglose(c), s = C.signo(c);
    const me = C.esME(c);
    const contra = c.condicion === 'CREDITO' ? (me ? cfg.ctaProveedoresME : cfg.ctaProveedores) : (me ? cfg.ctaCajaME : cfg.ctaCaja);
    const cta = c.cuenta || cfg.ctaCompras;
    const sinCredito = c.afectacion === 'EXENTA'; // IVA no computable: va al costo/gasto
    const L = [
      linea(cta, s * (d.base10 + d.base5 + d.exenta + d.exportacion + (sinCredito ? d.iva : 0)), 0),
      linea(cfg.ctaIvaCF10, sinCredito ? 0 : s * d.iva10, 0),
      linea(cfg.ctaIvaCF5, sinCredito ? 0 : s * d.iva5, 0),
      linea(contra, 0, s * d.total, me ? -s * d.totalME : 0)
    ];
    return {
      id: 'C' + c.id, fecha: c.fecha, origen: 'compra', ref: c.id,
      concepto: `${C.esNC(c) ? 'NC recibida' : c.tipoDoc === 'DESPACHO' ? 'Importación' : 'Compra'} ${c.numero || ''} ${c.razon || ''}`.trim(),
      lineas: compactar(L)
    };
  };

  C.periodosConDatos = function (data) {
    const s = new Set();
    (data.ventas || []).forEach(v => v.fecha && s.add(v.fecha.slice(0, 7)));
    (data.compras || []).forEach(v => v.fecha && s.add(v.fecha.slice(0, 7)));
    Object.keys(data.f120 || {}).forEach(p => s.add(p));
    return [...s].sort();
  };

  // Ajuste mensual por prorrateo de IVA (crédito fiscal no computable de compras mixtas).
  C.asientosProrrateo = function (data, cfg) {
    const out = [];
    C.periodosConDatos(data).forEach(p => {
      const f = C.f120(data, p, cfg);
      if (f.cfMixtoNoComputable10 || f.cfMixtoNoComputable5) {
        out.push({
          id: 'P' + p, fecha: C.finDeMes(p), origen: 'prorrateo', ref: p,
          concepto: `Ajuste prorrateo IVA ${p} (coef. ${(f.coeficiente * 100).toFixed(2)}%)`,
          lineas: compactar([
            linea(cfg.ctaIvaCosto, f.cfMixtoNoComputable10 + f.cfMixtoNoComputable5, 0),
            linea(cfg.ctaIvaCF10, 0, f.cfMixtoNoComputable10),
            linea(cfg.ctaIvaCF5, 0, f.cfMixtoNoComputable5)
          ])
        });
      }
    });
    return out;
  };

  C.config = data => Object.assign({}, PD.CONFIG_DEFAULT, data.config || {});

  C.todosLosAsientos = function (data) {
    const cfg = C.config(data);
    const a = [];
    (data.asientos || []).forEach(x => a.push(Object.assign({ origen: 'manual' }, x)));
    (data.ventas || []).forEach(v => a.push(C.asientoVenta(v, cfg)));
    (data.compras || []).forEach(c => a.push(C.asientoCompra(c, cfg)));
    C.asientosProrrateo(data, cfg).forEach(x => a.push(x));
    // Módulos adicionales (cobros, retenciones, depreciación, sueldos, recurrentes, IDU…)
    C.generadores.forEach(g => g(data, cfg).forEach(x => a.push(x)));
    a.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
    // Ajustes que dependen de todo lo anterior (diferencia de cambio)
    C.postGeneradores.forEach(g => g(data, cfg, a).forEach(x => a.push(x)));
    if (C.postGeneradores.length) a.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
    return a;
  };
  C.generadores = [];
  C.postGeneradores = [];
  C._linea = linea;
  C._compactar = compactar;

  C.validarAsiento = function (a, plan) {
    const errores = [];
    let d = 0, h = 0;
    (a.lineas || []).forEach((l, i) => {
      d += C.num(l.debe); h += C.num(l.haber);
      const c = plan && plan.by[l.cuenta];
      if (plan && !c) errores.push(`Línea ${i + 1}: la cuenta ${l.cuenta} no existe`);
      else if (c && !c.imputable) errores.push(`Línea ${i + 1}: la cuenta ${l.cuenta} no es imputable`);
    });
    if (Math.round(d) !== Math.round(h)) errores.push(`El asiento no balancea: Debe ${d} ≠ Haber ${h}`);
    if (!a.fecha) errores.push('Falta la fecha');
    return errores;
  };

  /* ---------- Saldos y balances ---------- */
  // Saldos (debe - haber) por cuenta imputable para la fecha de corte.
  // Cuentas patrimoniales: acumuladas hasta 'hasta'. Cuentas de resultado: desde inicio del ejercicio.
  // Los resultados de ejercicios anteriores no refundidos se suman a la cuenta de resultados acumulados.
  C.saldosAl = function (data, plan, hasta, asientos) {
    const cfg = C.config(data);
    const desde = C.inicioEjercicio(hasta, data.cierreMes || (data.cliente && data.cliente.cierreMes) || 12);
    asientos = asientos || C.todosLosAsientos(data);
    const saldo = {}, mov = {};
    let resAnterior = 0, sinCuenta = 0;
    asientos.forEach(a => {
      if (!a.fecha || a.fecha > hasta || a.cierre) return;
      a.lineas.forEach(l => {
        const c = plan.by[l.cuenta];
        const n = C.num(l.debe) - C.num(l.haber);
        if (!c) { sinCuenta += n; return; }
        const esResultado = c.tipo === 'I' || c.tipo === 'E';
        if (esResultado && a.fecha < desde) { resAnterior += n; return; }
        saldo[c.codigo] = (saldo[c.codigo] || 0) + n;
        const m = mov[c.codigo] || (mov[c.codigo] = { debe: 0, haber: 0 });
        m.debe += C.num(l.debe); m.haber += C.num(l.haber);
      });
    });
    if (resAnterior) saldo[cfg.ctaResultadosAcum] = (saldo[cfg.ctaResultadosAcum] || 0) + resAnterior;
    return { saldo, mov, desde, hasta, resultadoAnterior: -resAnterior, sinCuenta };
  };

  C.totalesPorTipo = function (plan, saldo) {
    const t = { A: 0, P: 0, PN: 0, I: 0, E: 0 };
    Object.keys(saldo).forEach(k => { const c = plan.by[k]; if (c) t[c.tipo] += saldo[k] * C.signoNatural(c.tipo); });
    t.resultado = t.I - t.E;
    t.diferencia = Math.round(t.A - t.P - t.PN - t.resultado);
    return t;
  };

  // Saldos agregados hasta el nivel indicado (signo natural de cada cuenta).
  C.agregarPorNivel = function (plan, saldo, nivelMax) {
    const agg = {};
    Object.keys(saldo).forEach(k => {
      const c = plan.by[k]; if (!c) return;
      [k].concat(c.ancestros).forEach(code => {
        const a = plan.by[code];
        if (a.nivel <= nivelMax) agg[code] = (agg[code] || 0) + saldo[k];
      });
    });
    return agg;
  };

  // Balance comparativo por nivel en Gs. y USD para N fechas de corte.
  // cortes: [{hasta, tc}] ; tc = guaraníes por dólar al cierre (opcional).
  C.balanceComparativo = function (data, plan, cortes, nivelMax) {
    nivelMax = nivelMax || 4;
    const asientos = C.todosLosAsientos(data);
    const res = cortes.map(k => {
      const s = C.saldosAl(data, plan, k.hasta, asientos);
      return { corte: k, s, agg: C.agregarPorNivel(plan, s.saldo, nivelMax), tot: C.totalesPorTipo(plan, s.saldo) };
    });
    const filas = plan.list.filter(c => c.nivel <= nivelMax)
      .filter(c => res.some(r => Math.round(r.agg[c.codigo] || 0) !== 0))
      .map(c => ({
        codigo: c.codigo, nombre: c.nombre, nivel: c.nivel, tipo: c.tipo,
        gs: res.map(r => C.r0((r.agg[c.codigo] || 0) * C.signoNatural(c.tipo))),
        usd: res.map(r => r.corte.tc ? C.r2((r.agg[c.codigo] || 0) * C.signoNatural(c.tipo) / r.corte.tc) : null)
      }));
    return { filas, totales: res.map(r => r.tot), periodos: res.map(r => ({ desde: r.s.desde, hasta: r.s.hasta, tc: r.corte.tc, resultadoAnterior: r.s.resultadoAnterior })) };
  };

  // Montos por rubro RG49 (signo natural: activos/pasivos positivos; en ER ingresos + y egresos -).
  C.rubrosAl = function (data, plan, hasta, asientos) {
    const s = C.saldosAl(data, plan, hasta, asientos);
    const r = {};
    PD.RUBROS_RG49.forEach(x => { r[x.key] = 0; });
    Object.keys(s.saldo).forEach(k => {
      const c = plan.by[k]; if (!c) return;
      const grupo = (PD.RUBROS_RG49.find(x => x.key === c.rubro) || {}).grupo;
      const v = grupo === 'ER' ? -s.saldo[k] : s.saldo[k] * C.signoNatural(c.tipo);
      r[c.rubro] = (r[c.rubro] || 0) + v;
    });
    const t = C.totalesPorTipo(plan, s.saldo);
    r.PN_RESEJ = (r.PN_RESEJ || 0) + t.resultado;
    const sum = g => PD.RUBROS_RG49.filter(x => x.grupo === g).reduce((a, x) => a + r[x.key], 0);
    const er = {
      ventas: r.ER_VENTAS, costo: r.ER_COSTO,
      gastosVentas: r.ER_VTAS, gastosAdm: r.ER_ADM,
      ingFin: r.ER_FIN, gastosFin: r.ER_GFIN, otrosIng: r.ER_OTROS, otrosEg: r.ER_OTROSEG, ire: r.ER_IRE
    };
    er.utilidadBruta = er.ventas + er.costo;
    er.resultadoOperativo = er.utilidadBruta + er.gastosVentas + er.gastosAdm;
    er.resultadoFinanciero = er.ingFin + er.gastosFin;
    er.otrosNeto = er.otrosIng + er.otrosEg;
    er.antesImpuesto = er.resultadoOperativo + er.resultadoFinanciero + er.otrosNeto;
    er.neto = er.antesImpuesto + er.ire;
    const tot = { AC: sum('AC'), ANC: sum('ANC'), PC: sum('PC'), PNC: sum('PNC'), PN: sum('PN') };
    tot.A = tot.AC + tot.ANC; tot.P = tot.PC + tot.PNC; tot.PPN = tot.P + tot.PN;
    tot.diferencia = Math.round(tot.A - tot.PPN);
    return { rubros: r, er, tot, desde: s.desde, hasta, saldo: s.saldo, mov: s.mov };
  };

  // Estructura de presentación del Balance General RG 49 (comparativo).
  C.estructuraRG49 = function () {
    const R = k => ({ tipo: 'rubro', key: k, nombre: PD.RUBROS_RG49.find(x => x.key === k).nombre });
    const rub = g => PD.RUBROS_RG49.filter(x => x.grupo === g).map(x => R(x.key));
    return [
      { tipo: 'titulo', nombre: 'ACTIVO' },
      { tipo: 'subtitulo', nombre: 'ACTIVO CORRIENTE' }, ...rub('AC'), { tipo: 'total', nombre: 'Total activo corriente', val: t => t.tot.AC },
      { tipo: 'subtitulo', nombre: 'ACTIVO NO CORRIENTE' }, ...rub('ANC'), { tipo: 'total', nombre: 'Total activo no corriente', val: t => t.tot.ANC },
      { tipo: 'gran', nombre: 'TOTAL ACTIVO', val: t => t.tot.A },
      { tipo: 'titulo', nombre: 'PASIVO' },
      { tipo: 'subtitulo', nombre: 'PASIVO CORRIENTE' }, ...rub('PC'), { tipo: 'total', nombre: 'Total pasivo corriente', val: t => t.tot.PC },
      { tipo: 'subtitulo', nombre: 'PASIVO NO CORRIENTE' }, ...rub('PNC'), { tipo: 'total', nombre: 'Total pasivo no corriente', val: t => t.tot.PNC },
      { tipo: 'gran', nombre: 'TOTAL PASIVO', val: t => t.tot.P },
      { tipo: 'titulo', nombre: 'PATRIMONIO NETO' }, ...rub('PN'),
      { tipo: 'gran', nombre: 'TOTAL PATRIMONIO NETO', val: t => t.tot.PN },
      { tipo: 'gran', nombre: 'TOTAL PASIVO Y PATRIMONIO NETO', val: t => t.tot.PPN }
    ];
  };
  C.estructuraER = function () {
    return [
      ['Ventas netas', t => t.er.ventas], ['Costo de ventas', t => t.er.costo],
      ['UTILIDAD BRUTA', t => t.er.utilidadBruta, 1],
      ['Gastos de ventas', t => t.er.gastosVentas], ['Gastos de administración', t => t.er.gastosAdm],
      ['RESULTADO OPERATIVO', t => t.er.resultadoOperativo, 1],
      ['Ingresos financieros', t => t.er.ingFin], ['Gastos financieros', t => t.er.gastosFin],
      ['Otros ingresos', t => t.er.otrosIng], ['Otros egresos', t => t.er.otrosEg],
      ['RESULTADO ANTES DEL IMPUESTO A LA RENTA', t => t.er.antesImpuesto, 1],
      ['Impuesto a la renta (IRE)', t => t.er.ire],
      ['RESULTADO NETO DEL EJERCICIO', t => t.er.neto, 1]
    ].map(([nombre, val, total]) => ({ nombre, val, total: !!total }));
  };

  /* ---------- Formulario 120 V4 (IVA General, mensual) – casillas oficiales ---------- */
  // Clase de la operación: 'AGRO' (productos agrícolas en estado natural y derivados del primer proceso),
  // 'FLETE' (flete internacional para exportación) o 'GENERAL'.
  C.claseDoc = (doc, cfg) => doc.clase || (cfg && cfg.agro5 ? 'AGRO' : 'GENERAL');
  const sumaMeses = (periodo, n, fn) => { let t = 0, p = periodo; for (let i = 0; i < n; i++) { t += fn(p); p = C.mesAnterior(p); } return t; };
  const vacio = v => v === undefined || v === null || v === '';

  // Montos de ventas del mes por casilla de Rubro 1 col. I (base imponible, sin IVA).
  C.ventasRubro1 = function (data, periodo, cfg) {
    const r = { c10: 0, c22: 0, c150: 0, c156: 0, c151: 0, c157: 0, c12: 0, c152: 0, c153: 0, c14: 0 };
    (data.ventas || []).filter(v => v.fecha && v.fecha.slice(0, 7) === periodo && !C.esNC(v)).forEach(v => {
      const d = C.desglose(v), agro = C.claseDoc(v, cfg) === 'AGRO';
      r.c10 += d.base10; r.c22 += d.iva10;
      if (agro) { r.c150 += d.base5; r.c156 += d.iva5; } else { r.c151 += d.base5; r.c157 += d.iva5; }
      r.c12 += d.exenta;
      const cl = C.claseDoc(v, cfg);
      if (cl === 'AGRO') r.c152 += d.exportacion; else if (cl === 'FLETE') r.c153 += d.exportacion; else r.c14 += d.exportacion;
    });
    return r;
  };

  C.f120 = function (data, periodo, cfg, _memo) {
    cfg = cfg || C.config(data);
    const memo = _memo || {};
    if (memo[periodo]) return memo[periodo];
    const ent = (data.f120 && data.f120[periodo]) || {};
    const enMes = x => x.fecha && x.fecha.slice(0, 7) === periodo;
    const k = {};

    // RUBRO 1 – Enajenaciones del período (+ NC recibidas por compras: ajustes que aumentan el débito)
    Object.assign(k, C.ventasRubro1(data, periodo, cfg));
    k.c15 = 0; k.c23 = 0; k.c154 = 0; k.c158 = 0; k.c155 = 0; k.c159 = 0; k.c17 = 0;
    // RUBRO 3 – compras
    k.c32 = 0; k.c35 = 0; k.c38 = 0; k.c33 = 0; k.c36 = 0; k.c39 = 0; k.c34 = 0; k.c37 = 0; k.c42 = 0;
    let mix10 = 0, mix5 = 0;
    // RUBRO 6 – compras vinculadas a operaciones exoneradas
    k.c59 = 0; k.c65 = 0; k.c60 = 0; k.c66 = 0; k.c61 = 0; k.c62 = 0; k.c63 = 0;

    (data.compras || []).filter(enMes).forEach(c => {
      const d = C.desglose(c);
      if (C.esNC(c)) { // devoluciones realizadas / descuentos obtenidos
        k.c15 += d.base10; k.c23 += d.iva10;
        if (C.claseDoc(c, cfg) === 'AGRO') { k.c154 += d.base5; k.c158 += d.iva5; } else { k.c155 += d.base5; k.c159 += d.iva5; }
        k.c17 += d.exenta;
        return;
      }
      if (c.afectacion === 'EXENTA') { k.c59 += d.base10; k.c65 += d.iva10; k.c60 += d.base5; k.c66 += d.iva5; k.c62 += d.exenta; return; }
      if (c.afectacion === 'MIXTA') { k.c33 += d.base5; k.c36 += d.base10; k.c39 += d.iva; mix10 += d.iva10; mix5 += d.iva5; k.c62 += d.exenta; return; }
      k.c32 += d.base5; k.c35 += d.base10; k.c38 += d.iva; k.c62 += d.exenta;
    });
    // NC emitidas (ajustes por ventas ya declaradas): Rubro 3 inc. e; exentas en Rubro 6 inc. e
    (data.ventas || []).filter(v => enMes(v) && C.esNC(v)).forEach(v => {
      const d = C.desglose(v);
      k.c34 += d.base5; k.c37 += d.base10; k.c42 += d.iva; k.c63 += d.exenta + d.exportacion;
    });

    k.c18 = k.c10 + k.c150 + k.c151 + k.c12 + k.c152 + k.c153 + k.c14 + k.c15 + k.c154 + k.c155 + k.c17;
    k.c21 = k.c156 + k.c157 + k.c158 + k.c159;
    k.c24 = k.c22 + k.c23;

    // RUBRO 2 – acumulado de los últimos 6 meses (incluido el período); se puede cargar a mano.
    const r1 = p => C.ventasRubro1(data, p, cfg);
    const acum = (cas, fn) => vacio(ent['a' + cas]) ? sumaMeses(periodo, 6, p => fn(r1(p))) : C.r0(ent['a' + cas]);
    k.c160 = acum(160, x => x.c10 + x.c151);
    k.c161 = acum(161, x => x.c150);
    k.c26 = acum(26, x => x.c12);
    k.c27 = k.c160 + k.c161 + k.c26;
    k.c162 = acum(162, x => x.c152);
    k.c163 = acum(163, x => x.c153);
    k.c29 = acum(29, x => x.c14);
    k.c30 = k.c162 + k.c163 + k.c29;
    k.c31 = k.c27 + k.c30;

    // Prorrateo: inc. c (sin exportaciones) o inc. d (con exportaciones – hoja de cálculo, casilla 216)
    let coeficiente;
    if (!vacio(ent.coeficiente)) coeficiente = C.num(ent.coeficiente) / 100;
    else if (k.c30) coeficiente = k.c31 ? (k.c160 + k.c161 + k.c30) / k.c31 : 1;
    else coeficiente = k.c27 ? (k.c160 + k.c161) / k.c27 : 1;
    coeficiente = Math.max(0, Math.min(1, coeficiente));
    const comp10 = Math.round(mix10 * coeficiente), comp5 = Math.round(mix5 * coeficiente);
    k.c164 = k.c30 ? 0 : comp10 + comp5;
    k.c165 = k.c30 ? comp10 + comp5 : 0;
    k.c43 = k.c38 + k.c164 + k.c165 + k.c42;

    // Encadenamiento con el período anterior (casilla 47 → 46 y 54 → 51)
    const ps = C.periodosConDatos(data), prev = C.mesAnterior(periodo);
    const ant = ps.length && prev >= ps[0] ? () => C.f120(data, prev, cfg, memo) : null;
    const saldoTec = vacio(ent.saldoAnterior) ? (ant ? ant().k.c47 : 0) : C.r0(ent.saldoAnterior);
    const saldoFin = vacio(ent.saldoAnteriorFin) ? (ant ? ant().k.c54 : 0) : C.r0(ent.saldoAnteriorFin);

    // RUBRO 4 – determinación del impuesto o saldo técnico
    k.c44 = k.c21 + k.c24;
    k.c45 = k.c43;
    k.c46 = saldoTec;
    k.c166 = k.c44 < k.c45 + k.c46 ? k.c45 + k.c46 - k.c44 : 0;
    k.c167 = Math.min(C.r0(ent.remision), k.c166);
    k.c47 = k.c166 - k.c167;
    k.c48 = k.c44 > k.c45 + k.c46 ? k.c44 - k.c45 - k.c46 : 0;
    k.c49 = C.r0(ent.anexoExportador);
    k.c168 = C.r0(ent.deduccionDiscapacidad);
    k.c50 = Math.max(0, k.c48 - k.c49 - k.c168);

    // RUBRO 5 – impuesto determinado y saldo financiero
    k.c55 = k.c50;
    k.c51 = saldoFin;
    k.c52 = vacio(ent.retenciones) ? (C.retencionesDelMes ? C.retencionesDelMes(data, periodo, 'IVA') : 0) : C.r0(ent.retenciones);
    k.c169 = C.r0(ent.percepciones);
    k.c56 = C.r0(ent.multa);
    k.c53 = k.c51 + k.c52 + k.c169;
    k.c57 = k.c55 + k.c56;
    k.c54 = k.c53 > k.c57 ? k.c53 - k.c57 : 0;
    k.c58 = k.c57 > k.c53 ? k.c57 - k.c53 : 0;

    // RUBRO 6 – IVA costo o gasto
    k.c64 = k.c65 + k.c66 + (mix10 - comp10) + (mix5 - comp5);
    k.c170 = k.c167;

    Object.keys(k).forEach(x => { k[x] = Math.round(k[x]) || 0; });
    const r = {
      periodo, k, coeficiente,
      debito: k.c44, cfComputable: k.c43,
      cfMixtoNoComputable10: mix10 - comp10, cfMixtoNoComputable5: mix5 - comp5,
      impuestoAIngresar: k.c58, saldoFavorSiguiente: k.c47 + k.c54,
      ventasTotales: k.c10 + k.c150 + k.c151 + k.c12 + k.c152 + k.c153 + k.c14 - (k.c34 + k.c37 + k.c63),
      retenciones: k.c52, percepciones: k.c169
    };
    r.rubros = C.estructuraF120(k, coeficiente);
    memo[periodo] = r;
    return r;
  };

  // Estructura para pantalla y Excel: cada fila [inciso, concepto, [casilla, valor] por columna].
  C.estructuraF120 = function (k, coef) {
    const c = n => [n, k['c' + n]];
    return [
      { rubro: 1, titulo: 'RUBRO 1 – ENAJENACIÓN DE BIENES Y/O PRESTACIÓN DE SERVICIOS DEL PERÍODO', cols: ['Monto imponible -I-', 'IVA débito 5% -II-', 'IVA débito 10% -III-'], filas: [
        ['a', 'Enajenación de bienes y/o prestación de servicios gravados con tasa del 10%', [c(10), null, c(22)]],
        ['b', 'Enajenación de productos agrícolas en estado natural y sus derivados del primer proceso de elaboración o industrialización gravados con tasa del 5%', [c(150), c(156), null]],
        ['c', 'Enajenación de otros bienes y/o prestación de servicios gravados con tasa del 5%', [c(151), c(157), null]],
        ['d', 'Enajenación de bienes, prestación de servicios o ingresos exonerados o no alcanzados por el Impuesto', [c(12), null, null]],
        ['e', 'Exportación de productos agrícolas en estado natural y sus derivados del primer proceso de elaboración o industrialización', [c(152), null, null]],
        ['f', 'Prestación de servicios de flete internacional para la exportación de bienes', [c(153), null, null]],
        ['g', 'Exportación de otros bienes', [c(14), null, null]],
        ['h', 'Ajustes de precios, devoluciones realizadas, descuentos obtenidos y recupero de impuestos por operaciones incobrables, declaradas a la tasa del 10%', [c(15), null, c(23)]],
        ['i', 'Ajustes de precios, devoluciones realizadas, descuentos obtenidos… tasa del 5%, productos agrícolas', [c(154), c(158), null]],
        ['j', 'Ajustes de precios, devoluciones realizadas, descuentos obtenidos… tasa del 5%, otros bienes y servicios', [c(155), c(159), null]],
        ['k', 'Ajustes de precios, devoluciones realizadas, descuentos obtenidos y recupero por operaciones incobrables, exonerados o no alcanzados', [c(17), null, null]],
        ['l', 'TOTAL (Col. I: a+b+c+d+e+f+g+h+i+j+k); (Col. II: b+c+i+j); (Col. III: a+h)', [c(18), c(21), c(24)], 1]] },
      { rubro: 2, titulo: 'RUBRO 2 – ENAJENACIONES DE LOS ÚLTIMOS SEIS (6) MESES (INCLUIDO EL PERÍODO QUE SE DECLARA)', cols: ['Monto acumulado'], filas: [
        ['a', 'Enajenación de bienes y/o prestación de servicios gravados en el mercado interno, con excepción de los productos agrícolas en estado natural', [c(160)]],
        ['b', 'Enajenación de productos agrícolas en estado natural y sus derivados del primer proceso de elaboración o industrialización en el mercado interno', [c(161)]],
        ['c', 'Enajenación de bienes y/o prestación de servicios exonerados o no alcanzados', [c(26)]],
        ['d', 'TOTAL DE OPERACIONES EN EL MERCADO INTERNO (Inc. a+b+c)', [c(27)], 1],
        ['e', 'Exportación de productos agrícolas en estado natural y sus derivados del primer proceso de elaboración o industrialización', [c(162)]],
        ['f', 'Servicios de flete internacional prestados por empresas transportadoras para la exportación de bienes', [c(163)]],
        ['g', 'Exportación de otros bienes', [c(29)]],
        ['h', 'TOTAL DE OPERACIONES DE EXPORTACIÓN (Inc. e+f+g)', [c(30)], 1],
        ['i', 'TOTAL DE OPERACIONES ACUMULADAS (Inc. d+h)', [c(31)], 1]] },
      { rubro: 3, titulo: 'RUBRO 3 – COMPRAS LOCALES E IMPORTACIONES DEL PERÍODO', cols: ['Monto imponible 5% -I-', 'Monto imponible 10% -II-', 'IVA crédito -III-'], filas: [
        ['a', 'IVA crédito atribuido directamente a operaciones gravadas en el mercado interno', [c(32), c(35), c(38)]],
        ['b', 'IVA crédito atribuido indistintamente a operaciones gravadas, exoneradas o no alcanzadas', [c(33), c(36), c(39)]],
        ['c', `IVA crédito atribuido proporcionalmente a operaciones gravadas en el mercado interno (Inc. b × (Rubro 2 a+b)/d) – coeficiente ${(coef * 100).toFixed(4)}%`, [null, null, c(164)]],
        ['d', 'IVA crédito atribuido proporcionalmente a operaciones gravadas en el mercado interno y a exportación (casilla 216 de la hoja de cálculo)', [null, null, c(165)]],
        ['e', 'IVA crédito por ajustes de precios, devoluciones y descuentos otorgados, por ventas ya declaradas y operaciones declaradas incobrables', [c(34), c(37), c(42)]],
        ['f', 'TOTAL DE IVA CRÉDITO PARA OPERACIONES EN EL MERCADO INTERNO (Col. III: Inc. a+c+d+e)', [null, null, c(43)], 1]] },
      { rubro: 4, titulo: 'RUBRO 4 – DETERMINACIÓN DEL IMPUESTO O DEL SALDO TÉCNICO', cols: ['Monto'], filas: [
        ['a', 'IVA débito (Rubro 1, Col. II y III: Inc. l)', [c(44)]],
        ['b', 'IVA crédito (Rubro 3, Inc. f)', [c(45)]],
        ['c', 'Saldo a favor del contribuyente del período anterior por operaciones en el mercado interno (Rubro 4 Inc. f de la DJ anterior)', [c(46)]],
        ['d', 'SALDO A FAVOR DEL CONTRIBUYENTE cuando el Inc. a sea menor que Inc. b + Inc. c', [c(166)], 1],
        ['e', 'Saldo a favor del contribuyente a remitir en beneficio del Fisco (Art. 91 de la Ley). Hasta el monto del Inc. d', [c(167)]],
        ['f', 'SALDO A FAVOR DEL CONTRIBUYENTE (a trasladar al Inc. c del período siguiente), Inc. d − Inc. e', [c(47)], 1],
        ['g', 'Saldo a favor del fisco, cuando Inc. a sea mayor que Inc. b + Inc. c', [c(48)], 1],
        ['h', 'Monto del IVA crédito utilizado en el período para operaciones gravadas (casilla 148 del Anexo Exportador)', [c(49)]],
        ['i', 'Deducción Arts. 7° y 8° de la Ley N° 4.962/2013 (personas con discapacidad) – no trasladable', [c(168)]],
        ['j', 'IMPUESTO DETERMINADO (Inc. g − Inc. h − Inc. i)', [c(50)], 1]] },
      { rubro: 5, titulo: 'RUBRO 5 – IMPUESTO DETERMINADO Y/O SALDO FINANCIERO A FAVOR DEL CONTRIBUYENTE', cols: ['A favor del contribuyente -I-', 'A favor del fisco -II-'], filas: [
        ['a', 'Impuesto determinado para operaciones gravadas (Rubro 4, Inc. j)', [null, c(55)]],
        ['b', 'Saldo a favor del contribuyente del período anterior (Rubro 5, Col. I: Inc. g de la DJ anterior)', [c(51), null]],
        ['c', 'Retenciones computables por operaciones gravadas', [c(52), null]],
        ['d', 'Percepciones computables por operaciones gravadas', [c(169), null]],
        ['e', 'Multa por presentar la declaración jurada con posterioridad al vencimiento', [null, c(56)]],
        ['f', 'SUBTOTALES (Col. I: b+c+d); (Col. II: a+e)', [c(53), c(57)], 1],
        ['g', 'SALDO A FAVOR DEL CONTRIBUYENTE (a trasladar al Inc. b del período siguiente). No trasladable al Rubro 4', [c(54), null], 1],
        ['h', 'SALDO A PAGAR A FAVOR DEL FISCO', [null, c(58)], 1]] },
      { rubro: 6, titulo: 'RUBRO 6 – COMPRAS DEL PERÍODO VINCULADAS A OPERACIONES EXONERADAS O NO ALCANZADAS', cols: ['Monto -I-', 'IVA -II-'], filas: [
        ['a', 'Compras con IVA crédito del 10% relacionadas directamente a operaciones exoneradas o no alcanzadas', [c(59), c(65)]],
        ['b', 'Compras con IVA crédito del 5% relacionadas directamente a operaciones exoneradas o no alcanzadas', [c(60), c(66)]],
        ['c', 'Compras exentas relacionadas a operaciones exoneradas, no alcanzadas y a exportaciones', [c(61), null]],
        ['d', 'Compras exentas relacionadas a operaciones exoneradas o no alcanzadas por el Impuesto', [c(62), null]],
        ['e', 'Ajustes de precios, descuentos otorgados y/o devoluciones recibidas, por operaciones exoneradas o no alcanzadas', [c(63), null]],
        ['f', 'Impuesto al Valor Agregado – costo o gasto deducible en el IRE o IRP', [null, c(64)]],
        ['g', 'Impuesto al Valor Agregado – costo o gasto por remisión del saldo IVA crédito al fisco, no deducible en el IRE o IRP', [null, c(170)]]] }
    ];
  };

  /* ---------- RG 90/2021: registro de comprobantes en Marangatu ---------- */
  // Tabla 4 (tipos de comprobante), Tabla 3 (identificación), Tabla 2 (condición).
  C.RG90_COMPROBANTE = { AUTOFACTURA: 101, BOLETA: 103, DESPACHO: 107, FACTURA: 109, NOTA_CREDITO: 110, NOTA_DEBITO: 111 };
  C.RG90_ID = { RUC: 11, CEDULA: 12, PASAPORTE: 13, CEDULA_EXTRANJERO: 14, SIN_NOMBRE: 15, DIPLOMATICO: 16, ID_TRIBUTARIA: 17 };
  const rg90Txt = (v, max) => String(v === null || v === undefined ? '' : v).replace(/[\r\n,";\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  C.rg90Identificacion = function (doc) {
    if (doc.tipoId) return { tipo: +doc.tipoId, numero: rg90Txt(String(doc.ruc || '').split('-')[0], 20) };
    const s = String(doc.ruc || '').trim().toUpperCase();
    if (!s || /^(X|SN|S\/N|SIN NOMBRE|0+|44444401(-7)?)$/.test(s)) return { tipo: C.RG90_ID.SIN_NOMBRE, numero: '0' };
    if (s.includes('-')) return { tipo: C.RG90_ID.RUC, numero: s.split('-')[0].replace(/[^0-9A-Z]/g, '') };
    if (/^\d+$/.test(s)) return { tipo: C.RG90_ID.CEDULA, numero: s };
    return { tipo: C.RG90_ID.PASAPORTE, numero: rg90Txt(s, 20) };
  };
  C.rg90NombreArchivo = function (ruc, periodo, version, anual) {
    const r = String(ruc || '').split('-')[0].replace(/\D/g, '') || '00000000';
    const p = anual ? String(periodo).slice(0, 4) : `${String(periodo).slice(5, 7)}${String(periodo).slice(0, 4)}`;
    return `${r}_REG_${p}_V${String(version || 1).padStart(4, '0')}`;
  };
  // Devuelve las líneas (arrays de campos) y los errores de validación de cada comprobante.
  C.rg90 = function (data, periodo, opts) {
    opts = opts || {};
    const cfg = C.config(data);
    const flag = v => (v === false || v === 'N') ? 'N' : 'S';
    const imp = { iva: flag(cfg.rg90ImputaIVA), ire: flag(cfg.rg90ImputaIRE), irp: cfg.rg90ImputaIRP === 'S' || cfg.rg90ImputaIRP === true ? 'S' : 'N' };
    const enPeriodo = x => x.fecha && (opts.anual ? x.fecha.slice(0, 4) === String(periodo).slice(0, 4) : x.fecha.slice(0, 7) === periodo);
    const lineas = [], errores = [], excluidos = [];
    const proc = (doc, esCompra) => {
      const ref = [esCompra ? 'Compra' : 'Venta', doc.numero || '(s/n)', doc.razon, doc.fecha].filter(Boolean).join(' ');
      if (doc.electronico) { excluidos.push(ref + ': comprobante electrónico/virtual (Marangatu ya lo tiene)'); return; }
      const d = C.desglose(doc);
      const id = C.rg90Identificacion(doc);
      const tipoComp = C.RG90_COMPROBANTE[doc.tipoDoc] || 109;
      const exento = d.exenta + d.exportacion;
      const esNC = tipoComp === 110 || tipoComp === 111;
      const e = [];
      if (!/^\d{8}$/.test(String(doc.timbrado || '')) && tipoComp !== 107) e.push('timbrado de 8 dígitos');
      if (!C.validarNumeroComprobante(doc.numero) && tipoComp !== 107) e.push('número ###-###-#######');
      if (id.tipo === C.RG90_ID.RUC && C.rucValido(doc.ruc) === false) e.push('DV del RUC inválido');
      if ([13, 14, 16, 17].includes(id.tipo) && !doc.razon) e.push('nombre requerido');
      if (d.total <= 0) e.push('total debe ser mayor a cero');
      if (esNC && !doc.asocNumero) e.push('NC/ND requiere comprobante asociado');
      if (e.length) errores.push(`${ref}: ${e.join(', ')}`);
      const f = [esCompra ? 2 : 1, id.tipo, id.numero, rg90Txt(doc.razon, 250), tipoComp, C.parseFecha(doc.fecha).split('-').reverse().join('/'),
        rg90Txt(doc.timbrado, 8), rg90Txt(doc.numero, 20), d.g10, d.g5, exento, d.total, doc.condicion === 'CREDITO' ? 2 : 1,
        doc.monedaExtranjera || C.esME(doc) ? 'S' : 'N', imp.iva, imp.ire, imp.irp];
      if (esCompra) f.push(doc.noImputa ? 'S' : 'N');
      f.push(esNC ? rg90Txt(doc.asocNumero, 20) : '', esNC ? rg90Txt(doc.asocTimbrado, 8) : '');
      lineas.push({ campos: f, ref, ok: !e.length, esCompra });
    };
    if (opts.ventas !== false) (data.ventas || []).filter(enPeriodo).sort((a, b) => (a.fecha + a.numero).localeCompare(b.fecha + b.numero)).forEach(v => proc(v, false));
    if (opts.compras !== false) (data.compras || []).filter(enPeriodo).sort((a, b) => (a.fecha + a.numero).localeCompare(b.fecha + b.numero)).forEach(c => proc(c, true));
    const csv = lineas.length ? lineas.map(l => l.campos.join(',')).join('\r\n') + '\r\n' : '';
    return { lineas, errores, excluidos, csv };
  };

  /* ---------- Formulario 500 (IRE General, anual) ---------- */
  C.f500 = function (data, plan, anio) {
    const cfg = C.config(data);
    const cierreMes = data.cierreMes || (data.cliente && data.cliente.cierreMes) || 12;
    const { desde, hasta } = C.rangoEjercicio(anio, cierreMes);
    const ent = (data.f500 && data.f500[anio]) || {};
    const asientos = C.todosLosAsientos(data);
    const R = C.rubrosAl(data, plan, hasta, asientos);
    const s = R.saldo;

    let ingresos = 0, egresos = 0, noGravados = 0, noDeducibles = 0, ireContab = 0;
    Object.keys(s).forEach(k => {
      const c = plan.by[k]; if (!c) return;
      if (c.tipo === 'I') { ingresos += -s[k]; if (c.noGravado) noGravados += -s[k]; }
      if (c.tipo === 'E') {
        egresos += s[k];
        if (c.noDeducible) noDeducibles += s[k];
        if (c.rubro === 'ER_IRE') ireContab += s[k];
      }
    });
    const resultadoContable = ingresos - egresos;          // después de IRE contabilizado
    const resultadoAntesIRE = resultadoContable + ireContab;

    // Donaciones: deducibles hasta el límite % de la renta neta (se calcula sobre la renta antes de donaciones).
    const donaciones = ent.donaciones !== undefined && ent.donaciones !== '' ? C.r0(ent.donaciones) : C.r0(s[cfg.ctaDonaciones] || 0);
    const ajustesMas = C.r0(ent.ajustesMas), ajustesMenos = C.r0(ent.ajustesMenos);
    const difDepreciacion = C.r0(ent.difDepreciacion); // + si la depreciación contable supera a la fiscal

    // noDeducibles ya incluye el IRE contabilizado si la cuenta está marcada; evitamos duplicarlo.
    const ndSinIRE = noDeducibles - (plan.list.some(c => c.rubro === 'ER_IRE' && c.noDeducible) ? ireContab : 0);
    const rentaAntesDonaciones = resultadoAntesIRE + ndSinIRE - noGravados + ajustesMas - ajustesMenos + difDepreciacion + donaciones;
    const limiteDonaciones = Math.max(0, Math.round(rentaAntesDonaciones * cfg.limiteDonacionesPct / 100));
    const donacionesDeducibles = Math.min(donaciones, limiteDonaciones);
    const excesoDonaciones = donaciones - donacionesDeducibles;
    const rentaNeta = rentaAntesDonaciones - donacionesDeducibles;

    const quebrantoAnterior = C.r0(ent.quebrantoAnterior);
    const limiteQuebranto = rentaNeta > 0 ? Math.round(rentaNeta * cfg.limiteQuebrantoPct / 100) : 0;
    const quebrantoCompensado = Math.min(quebrantoAnterior, limiteQuebranto);
    const rentaNetaImponible = Math.max(0, rentaNeta - quebrantoCompensado);
    const quebrantoEjercicio = rentaNeta < 0 ? -rentaNeta : 0;
    const quebrantoRemanente = quebrantoAnterior - quebrantoCompensado + quebrantoEjercicio;

    const impuesto = Math.round(rentaNetaImponible * cfg.tasaIRE / 100);
    const debeEnPeriodo = cta => {
      let t = 0;
      asientos.forEach(a => { if (a.fecha >= desde && a.fecha <= hasta && !a.cierre) a.lineas.forEach(l => { if (l.cuenta === cta) t += C.num(l.debe); }); });
      return Math.round(t);
    };
    const anticipos = ent.anticipos !== undefined && ent.anticipos !== '' ? C.r0(ent.anticipos) : debeEnPeriodo(cfg.ctaAnticiposIRE);
    const retenciones = ent.retenciones !== undefined && ent.retenciones !== '' ? C.r0(ent.retenciones) : debeEnPeriodo(cfg.ctaRetencionesIRE);
    const saldoFavorAnterior = C.r0(ent.saldoFavorAnterior);
    const neto = impuesto - anticipos - retenciones - saldoFavorAnterior;

    const baseAnticipo = Math.max(0, impuesto - retenciones);
    const anticipo = Math.round(baseAnticipo * cfg.pctAnticipo / 100);

    // Conciliación IVA (F120 del ejercicio) vs ingresos contables
    let ventasF120 = 0, debitoF120 = 0, creditoF120 = 0;
    const memo = {};
    let p = desde.slice(0, 7);
    for (let i = 0; i < 12; i++) {
      const f = C.f120(data, p, cfg, memo);
      ventasF120 += f.ventasTotales; debitoF120 += f.debito; creditoF120 += f.cfComputable;
      let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } p = `${y}-${C.pad(m)}`;
    }

    const T = R.tot, E = R.er;
    const div = (a, b) => b ? a / b : null;
    const inventarios = R.rubros.AC_INVENT;
    const indicadores = [
      ['Liquidez corriente (AC / PC)', div(T.AC, T.PC), 'x'],
      ['Prueba ácida ((AC − Inventarios) / PC)', div(T.AC - inventarios, T.PC), 'x'],
      ['Capital de trabajo (AC − PC)', T.AC - T.PC, 'gs'],
      ['Endeudamiento total (Pasivo / Activo)', div(T.P, T.A), '%'],
      ['Endeudamiento sobre patrimonio (Pasivo / PN)', div(T.P, T.PN), 'x'],
      ['Solvencia (Activo / Pasivo)', div(T.A, T.P), 'x'],
      ['Margen bruto (Utilidad bruta / Ventas)', div(E.utilidadBruta, E.ventas), '%'],
      ['Margen operativo (Resultado operativo / Ventas)', div(E.resultadoOperativo, E.ventas), '%'],
      ['Margen neto (Resultado neto / Ventas)', div(E.neto, E.ventas), '%'],
      ['Rentabilidad del patrimonio – ROE (Resultado neto / PN)', div(E.neto, T.PN), '%'],
      ['Rentabilidad del activo – ROA (Resultado neto / Activo)', div(E.neto, T.A), '%'],
      ['Rotación de activos (Ventas / Activo)', div(E.ventas, T.A), 'x'],
      ['Presión fiscal IRE (Impuesto / Ventas)', div(impuesto, E.ventas), '%'],
      ['Tasa efectiva IRE (Impuesto / Resultado antes IRE)', div(impuesto, resultadoAntesIRE), '%']
    ].map(([nombre, valor, fmt]) => ({ nombre, valor, fmt }));

    const lineas = [
      ['1', 'ESTADO DE SITUACIÓN PATRIMONIAL AL CIERRE', null, 'titulo'],
      ['1', 'Activo corriente', T.AC], ['1', 'Activo no corriente', T.ANC], ['1', 'TOTAL ACTIVO', T.A, 'total'],
      ['1', 'Pasivo corriente', T.PC], ['1', 'Pasivo no corriente', T.PNC], ['1', 'TOTAL PASIVO', T.P, 'total'],
      ['1', 'Patrimonio neto', T.PN, 'total'],
      ['2', 'ESTADO DE RESULTADOS DEL EJERCICIO', null, 'titulo'],
      ['2', 'Ventas netas de bienes y servicios', E.ventas], ['2', 'Costo de ventas', -E.costo],
      ['2', 'Utilidad bruta', E.utilidadBruta, 'total'],
      ['2', 'Gastos de ventas', -E.gastosVentas], ['2', 'Gastos de administración', -E.gastosAdm],
      ['2', 'Ingresos financieros', E.ingFin], ['2', 'Gastos financieros', -E.gastosFin],
      ['2', 'Otros ingresos', E.otrosIng], ['2', 'Otros egresos', -E.otrosEg],
      ['2', 'Total ingresos del ejercicio', ingresos], ['2', 'Total costos y gastos (incluye IRE contabilizado)', egresos],
      ['2', 'RESULTADO CONTABLE ANTES DEL IRE', resultadoAntesIRE, 'total'],
      ['3', 'DETERMINACIÓN DE LA RENTA NETA', null, 'titulo'],
      ['3', 'Resultado contable antes del IRE', resultadoAntesIRE],
      ['3', '(+) Gastos no deducibles (cuentas marcadas ND, sin IRE)', ndSinIRE],
      ['3', '(+) Diferencia depreciación contable vs. fiscal', difDepreciacion],
      ['3', '(+) Otros ajustes positivos', ajustesMas],
      ['3', '(−) Ingresos no gravados / exentos (cuentas marcadas NG)', -noGravados],
      ['3', '(−) Otros ajustes negativos', -ajustesMenos],
      ['3', `(+) Donaciones contabilizadas`, donaciones],
      ['3', `(−) Donaciones deducibles (límite ${cfg.limiteDonacionesPct}% de la renta neta: ${fmtGs(limiteDonaciones)})`, -donacionesDeducibles],
      ['3', 'RENTA NETA DEL EJERCICIO (o quebranto)', rentaNeta, 'total'],
      ['3', 'Quebranto fiscal de ejercicios anteriores disponible', quebrantoAnterior],
      ['3', `(−) Quebranto compensado (límite ${cfg.limiteQuebrantoPct}% de la renta neta)`, -quebrantoCompensado],
      ['3', 'RENTA NETA IMPONIBLE', rentaNetaImponible, 'total'],
      ['4', 'LIQUIDACIÓN DEL IMPUESTO', null, 'titulo'],
      ['4', `Impuesto liquidado (${cfg.tasaIRE}% s/ renta neta imponible)`, impuesto, 'total'],
      ['4', '(−) Anticipos ingresados', -anticipos],
      ['4', '(−) Retenciones de IRE sufridas', -retenciones],
      ['4', '(−) Saldo a favor del ejercicio anterior', -saldoFavorAnterior],
      ['4', 'SALDO A INGRESAR', neto > 0 ? neto : 0, 'total'],
      ['4', 'SALDO A FAVOR DEL CONTRIBUYENTE', neto < 0 ? -neto : 0, 'total'],
      ['5', 'INFORMACIÓN COMPLEMENTARIA', null, 'titulo'],
      ['5', 'Quebranto fiscal del ejercicio', quebrantoEjercicio],
      ['5', 'Quebranto acumulado a trasladar a ejercicios siguientes', quebrantoRemanente],
      ['5', `Anticipo para el ejercicio siguiente (${cfg.cantAnticipos} cuotas de ${cfg.pctAnticipo}%)`, anticipo],
      ['5', 'Exceso de donaciones no deducible', excesoDonaciones],
      ['5', 'Ingresos declarados en Form. 120 del ejercicio (ventas netas sin IVA)', ventasF120],
      ['5', 'Ventas netas contables', E.ventas],
      ['5', 'Diferencia ventas F120 vs. contabilidad (debe explicarse)', ventasF120 - E.ventas, 'alerta'],
      ['5', 'Débito fiscal IVA del ejercicio (Σ F120)', debitoF120],
      ['5', 'Crédito fiscal IVA computable del ejercicio (Σ F120)', creditoF120]
    ].map(([rubro, concepto, monto, estilo]) => ({ rubro, concepto, monto: monto === null ? null : Math.round(monto), estilo: estilo || '' }));

    const controles = [];
    if (R.tot.diferencia) controles.push(`El balance no cuadra: diferencia de ${fmtGs(R.tot.diferencia)} entre Activo y Pasivo + PN.`);
    if (Math.abs(ventasF120 - E.ventas) > 1) controles.push('Las ventas del Form. 120 no coinciden con las ventas contables del ejercicio. Revise ventas registradas por asiento manual o cuentas de ventas mal imputadas.');
    if (quebrantoAnterior && rentaNeta > 0 && quebrantoCompensado < quebrantoAnterior) controles.push('Quebranto anterior compensado parcialmente por el límite legal; verifique la antigüedad (máx. 5 ejercicios).');
    if (!E.ventas) controles.push('No hay ventas registradas en el ejercicio.');

    return {
      anio, desde, hasta, cfg, R, lineas, indicadores, controles,
      ingresos, egresos, noGravados, noDeducibles: ndSinIRE, resultadoAntesIRE, rentaNeta, rentaNetaImponible,
      quebrantoCompensado, quebrantoEjercicio, quebrantoRemanente, impuesto, anticipos, retenciones, neto, anticipo,
      donaciones, donacionesDeducibles, ventasF120
    };
  };

  function fmtGs(n) { return 'Gs. ' + Math.round(n).toLocaleString('es-PY'); }
  C.fmtGs = fmtGs;

  root.Conta = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
