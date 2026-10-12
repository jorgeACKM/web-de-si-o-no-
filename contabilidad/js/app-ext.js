/* Pantallas de los módulos adicionales. Se registran en la navegación de app.js. */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, X, $, $$, esc, fmt, fmt2, fd, hoy, MESES, TIPOS_DOC, st, toast, datos, cfg, nombreCta, ctaValida, pedirArchivo, slug, cliente, render, bloqueado } = A;
  const arr = k => { const d = datos(); return d[k] || (d[k] = []); };
  const obj = k => { const d = datos(); return d[k] || (d[k] = {}); };
  const v = id => ($(id) ? $(id).value : '');
  const num = id => C.num(v(id));
  const montoInp = (id, val, size) => `<input id="${id}" class="n" value="${val ? fmt(val) : ''}" size="${size || 12}" inputmode="numeric">`;
  const formatearMontos = () => $$('input.n.gs').forEach(i => i.addEventListener('blur', () => { const n = C.num(i.value); i.value = n ? fmt(n) : ''; }));
  const perSel = () => `<label>Período <input type="month" id="per" value="${st.periodo}"></label>`;
  const bindPer = () => { if ($('#per')) $('#per').onchange = e => { if (e.target.value) { st.periodo = e.target.value; render(); } }; };
  const terceros = () => Object.entries(datos().terceros || {});
  const dlTerceros = () => `<datalist id="dl-terceros">${terceros().map(([r, t]) => `<option value="${esc(r)}">${esc(t.razon || '')}</option>`).join('')}</datalist>`;
  const autoRazon = (idRuc, idRazon) => $(idRuc).addEventListener('change', () => { const t = (datos().terceros || {})[v(idRuc).trim()]; if (t && !v(idRazon)) $(idRazon).value = t.razon || ''; });
  const borrar = (lista, id, msg) => { const d = datos(); const x = d[lista].find(y => y.id === id); if (!x || bloqueado(x.fecha)) return; if (confirm(msg || '¿Eliminar el registro?')) { d[lista] = d[lista].filter(y => y.id !== id); S.save(); render(); } };

  /* ======================= IMPORTAR ======================= */
  function incorporar(docs, esCompra) {
    const d = datos(), lista = esCompra ? arr('compras') : arr('ventas');
    let ok = 0, dup = 0, cerr = 0;
    docs.forEach(doc => {
      if (C.periodoCerrado(d, doc.fecha)) { cerr++; return; }
      const existe = lista.some(x => (doc.cdc && x.cdc === doc.cdc) || (doc.numero && x.numero === doc.numero && x.ruc === doc.ruc && x.tipoDoc === doc.tipoDoc && (!doc.timbrado || x.timbrado === doc.timbrado)));
      if (existe) { dup++; return; }
      doc.id = S.uid();
      if (esCompra) {
        doc.afectacion = doc.afectacion || ((d.terceros || {})[doc.ruc] || {}).afectacion || 'GRAVADA';
        if (!doc.cuenta) { const sg = C.sugerirCuenta(d, doc.ruc, doc.razon, A.plan); if (sg) doc.cuenta = sg.cuenta; }
      }
      lista.push(doc); ok++;
      if (doc.ruc && doc.razon) { const t = d.terceros[doc.ruc] || (d.terceros[doc.ruc] = {}); t.razon = doc.razon; if (esCompra) { t.electronico = !!doc.electronico; if (doc.cuenta) t.cuenta = doc.cuenta; } }
    });
    return { ok, dup, cerr };
  }
  const resumen = (r, extra) => `${r.ok} importados${r.dup ? `, ${r.dup} duplicados omitidos` : ''}${r.cerr ? `, ${r.cerr} en períodos cerrados` : ''}${extra ? '. ' + extra : ''}`;
  async function leerTextos(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 0x50 && buf[1] === 0x4B) { // ZIP
      const z = XLSX.CFB.read(buf, { type: 'array' });
      return z.FileIndex.filter(f => f.type === 2 && /\.(csv|txt)$/i.test(f.name)).map(f => new TextDecoder('utf-8').decode(f.content));
    }
    return [new TextDecoder('utf-8').decode(buf)];
  }

  A.registrar('importar', 'Importar (XML / Marangatu)', 'Carga', {
    html() {
      return `<section class="card"><h2>Importar comprobantes</h2>
        <h3>1. Facturas electrónicas (XML SIFEN)</h3>
        <p class="muted">Seleccione uno o varios XML de facturas, notas de crédito o débito electrónicas. Se detecta solo si es compra o venta comparando el RUC del emisor con el del cliente, y se marcan como electrónicas (no van al RG 90). A las compras se les asigna la cuenta sugerida.</p>
        <div class="acciones"><button id="i-xml" class="primary">Seleccionar archivos XML</button></div>
        <h3>2. Archivo de registro de comprobantes (RG 90)</h3>
        <p class="muted">Archivo CSV/TXT o ZIP con el formato de importación de Marangatu (por ejemplo, el que generó otro sistema o un período ya registrado). Carga ventas (tipo 1) y compras (tipo 2).</p>
        <div class="acciones"><button id="i-rg90">Seleccionar CSV / ZIP</button></div>
        <h3>3. Planilla descargada de Marangatu u otro sistema (Excel/CSV)</h3>
        <p class="muted">Consulta de comprobantes registrados o de comprobantes electrónicos exportada a Excel. Se reconocen automáticamente columnas como Fecha de emisión, Timbrado, Número, RUC, Razón social, Monto gravado 10%/5%, Exento, Condición y CDC (si hay CDC, se marcan como electrónicos).</p>
        <div class="acciones"><label>Cargar como <select id="i-dest"><option value="compras">Compras</option><option value="ventas">Ventas</option></select></label> <button id="i-xls">Seleccionar Excel / CSV</button></div>
        <div id="i-res"></div></section>`;
    },
    bind() {
      const res = html => { $('#i-res').innerHTML = html; };
      $('#i-xml').onclick = () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xml'; inp.multiple = true;
        inp.onchange = async () => {
          const comp = [], vent = [], errs = [];
          for (const f of inp.files) {
            try { const r = C.parseSifenXML(await f.text(), cliente().ruc); (r.esCompra ? comp : vent).push(r.doc); if (r.doc.observacion) errs.push(`${f.name}: ${r.doc.observacion}`); }
            catch (e) { errs.push(`${f.name}: ${e.message}`); }
          }
          const rc = incorporar(comp, true), rv = incorporar(vent, false);
          S.save();
          res(`<div class="${errs.length ? 'alerta' : 'okbox'}">Compras: ${resumen(rc)} · Ventas: ${resumen(rv)}${errs.length ? `<ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`);
          toast(`XML procesados: ${rc.ok + rv.ok} comprobantes nuevos`);
        };
        inp.click();
      };
      $('#i-rg90').onclick = () => pedirArchivo('.csv,.txt,.zip', async f => {
        try {
          const textos = await leerTextos(f);
          let rv = { ok: 0, dup: 0, cerr: 0 }, rc = { ok: 0, dup: 0, cerr: 0 }; const errs = [];
          textos.forEach(t => { const r = C.importarRG90(t); errs.push(...r.errores); const a = incorporar(r.ventas, false), b = incorporar(r.compras, true); ['ok', 'dup', 'cerr'].forEach(k => { rv[k] += a[k]; rc[k] += b[k]; }); });
          S.save();
          res(`<div class="${errs.length ? 'alerta' : 'okbox'}">Ventas: ${resumen(rv)} · Compras: ${resumen(rc)}${errs.length ? `<ul>${errs.slice(0, 20).map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
      $('#i-xls').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        try {
          const esCompra = v('#i-dest') === 'compras';
          const filas = X.filas(await X.leerArchivo(f));
          const r = X.importarComprobantes(filas, esCompra);
          const rr = incorporar(r.docs, esCompra);
          S.save();
          res(`<div class="${r.errores.length ? 'alerta' : 'okbox'}">${resumen(rr)}${r.errores.length ? `<ul>${r.errores.slice(0, 20).map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
    }
  }, 'asientos');

  /* ======================= TESORERÍA: COBROS, PAGOS Y CUENTAS CORRIENTES ======================= */
  A.registrar('tesoreria', 'Cobros, pagos y ctas. ctes.', 'Tesorería', {
    html() {
      const c = cfg(), pre = st.pagoPre || {};
      const pagos = arr('pagos').filter(p => p.fecha && p.fecha.slice(0, 7) === st.periodo).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const tipoCC = st.ccTipo || 'CLIENTES', corte = st.ccCorte || hoy();
      const cc = C.cuentasCorrientes(datos(), tipoCC, corte);
      const T = k => cc.reduce((s, x) => s + x[k], 0);
      return `<section class="card"><h2>Registrar cobro o pago</h2>${dlTerceros()}
        <div class="form cols4">
          <label>Fecha <input type="date" id="p-fecha" value="${esc(pre.fecha || hoy())}"></label>
          <label>Tipo <select id="p-tipo"><option value="COBRO">Cobro a cliente</option><option value="PAGO" ${pre.tipo === 'PAGO' ? 'selected' : ''}>Pago a proveedor</option></select></label>
          <label>RUC <input id="p-ruc" list="dl-terceros" value="${esc(pre.ruc || '')}"></label>
          <label>Razón social <input id="p-razon" value="${esc(pre.razon || '')}"></label>
          <label>Comprobante que cancela <input id="p-doc" value="${esc(pre.docNumero || '')}" placeholder="001-001-0000001 (opcional)"></label>
          <label>Monto Gs. ${montoInp('p-monto', pre.monto)}</label>
          <label>Caja / banco <input id="p-cta" list="dl-cuentas" value="${esc(pre.cuenta || c.ctaCaja)}"></label>
          <label>Contrapartida (opcional) <input id="p-contra" list="dl-cuentas" placeholder="clientes / proveedores"></label>
          <label>Moneda <select id="p-mon"><option value="">Gs.</option><option value="USD">US$</option></select></label>
          <label>Importe en US$ (si corresponde) <input id="p-me" class="n" inputmode="decimal"></label>
        </div>
        <div class="acciones"><button id="p-ok" class="primary">Guardar</button></div>
      </section>
      <section class="card"><h2>Cobros y pagos del período</h2><div class="acciones">${perSel()}</div>
        <table class="grid"><thead><tr><th>Fecha</th><th>Tipo</th><th>RUC</th><th>Razón social</th><th>Comprobante</th><th>Caja/banco</th><th>Monto</th><th></th></tr></thead><tbody>
        ${pagos.map(p => `<tr><td>${fd(p.fecha)}</td><td>${p.tipo === 'COBRO' ? 'Cobro' : 'Pago'}</td><td>${esc(p.ruc)}</td><td>${esc(p.razon)}</td><td>${esc(p.docNumero)}</td><td title="${esc(nombreCta(p.cuenta))}">${esc(p.cuenta)}</td><td class="n">${fmt(p.monto)}${p.moneda === 'USD' ? ` <small>(US$ ${fmt2(p.montoME)})</small>` : ''}</td><td><button class="mini danger" data-rmp="${p.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin movimientos</td></tr>'}
        </tbody></table></section>
      <section class="card"><h2>Cuentas corrientes y antigüedad de saldos</h2>
        <div class="acciones"><label>Cuentas de <select id="cc-tipo"><option value="CLIENTES">Clientes</option><option value="PROVEEDORES" ${tipoCC === 'PROVEEDORES' ? 'selected' : ''}>Proveedores</option></select></label>
          <label>Al <input type="date" id="cc-corte" value="${corte}"></label> <button id="cc-exp">Exportar a Excel</button></div>
        <p class="muted">Incluye comprobantes a crédito. Los cobros/pagos, retenciones y notas de crédito se imputan al comprobante indicado y el resto a los más antiguos. Vencimiento: fecha + ${c.plazoDias} días (configurable).</p>
        <div class="scroll"><table class="grid"><thead><tr><th>RUC</th><th>Razón social</th><th>A vencer</th><th>1–30 días</th><th>31–60</th><th>61–90</th><th>+90</th><th>Anticipos</th><th>Saldo</th><th></th></tr></thead><tbody>
        ${cc.map((x, i) => `<tr><td>${esc(x.ruc)}</td><td><details><summary>${esc(x.razon)}</summary>${x.pendientes.map(p => `<div class="muted">${fd(p.fecha)} ${esc(p.numero)} · saldo ${fmt(p.saldo)} · ${p.diasVencido > 0 ? p.diasVencido + ' días vencido' : 'vence ' + fd(p.vence)}</div>`).join('')}</details></td>
          <td class="n">${fmt(x.aVencer)}</td><td class="n">${fmt(x.d30)}</td><td class="n">${fmt(x.d60)}</td><td class="n">${fmt(x.d90)}</td><td class="n ${x.mas90 ? 'err' : ''}">${fmt(x.mas90)}</td><td class="n">${fmt(-x.anticipo)}</td><td class="n"><b>${fmt(x.saldo)}</b></td>
          <td>${x.saldo > 0 ? `<button class="mini" data-cc="${i}">${tipoCC === 'CLIENTES' ? 'Cobrar' : 'Pagar'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">Sin saldos pendientes</td></tr>'}
        </tbody><tfoot><tr><td colspan="2">TOTAL</td><td class="n">${fmt(T('aVencer'))}</td><td class="n">${fmt(T('d30'))}</td><td class="n">${fmt(T('d60'))}</td><td class="n">${fmt(T('d90'))}</td><td class="n">${fmt(T('mas90'))}</td><td class="n">${fmt(-T('anticipo'))}</td><td class="n">${fmt(T('saldo'))}</td><td></td></tr></tfoot></table></div>
      </section>`;
    },
    bind() {
      bindPer(); autoRazon('#p-ruc', '#p-razon');
      $('#p-monto').classList.add('gs'); formatearMontos();
      $('#p-ok').onclick = () => {
        const p = { fecha: v('#p-fecha'), tipo: v('#p-tipo'), ruc: v('#p-ruc').trim(), razon: v('#p-razon').trim(), docNumero: C.formatearNumeroComprobante(v('#p-doc')), monto: C.r0(num('#p-monto')), cuenta: v('#p-cta').trim(), contra: v('#p-contra').trim() || undefined };
        if (v('#p-mon') === 'USD') { p.moneda = 'USD'; p.montoME = C.r2(num('#p-me')); }
        if (!p.fecha || !p.monto) return toast('Ingrese fecha y monto', 'error');
        if (!ctaValida(p.cuenta) || (p.contra && !ctaValida(p.contra))) return toast('Cuenta inexistente o no imputable', 'error');
        if (bloqueado(p.fecha)) return;
        p.id = S.uid(); arr('pagos').push(p); st.pagoPre = null; S.save(); toast('Movimiento registrado'); render();
      };
      $$('[data-rmp]').forEach(b => b.onclick = () => borrar('pagos', b.dataset.rmp));
      $('#cc-tipo').onchange = e => { st.ccTipo = e.target.value; render(); };
      $('#cc-corte').onchange = e => { st.ccCorte = e.target.value; render(); };
      const cc = () => C.cuentasCorrientes(datos(), st.ccTipo || 'CLIENTES', st.ccCorte || hoy());
      $$('[data-cc]').forEach(b => b.onclick = () => {
        const x = cc()[+b.dataset.cc];
        st.pagoPre = { tipo: (st.ccTipo || 'CLIENTES') === 'CLIENTES' ? 'COBRO' : 'PAGO', ruc: x.ruc, razon: x.razon, monto: x.saldo, docNumero: x.pendientes.length === 1 ? x.pendientes[0].numero : '' };
        render(); window.scrollTo(0, 0);
      });
      $('#cc-exp').onclick = () => {
        const tipo = st.ccTipo || 'CLIENTES', corte = st.ccCorte || hoy(), r = cc();
        const res = [['RUC', 'Razón social', 'A vencer', '1-30', '31-60', '61-90', '+90', 'Anticipos', 'Saldo']].concat(r.map(x => [x.ruc, x.razon, x.aVencer, x.d30, x.d60, x.d90, x.mas90, -x.anticipo, x.saldo]));
        const det = [['RUC', 'Razón social', 'Fecha', 'Comprobante', 'Vencimiento', 'Total', 'Saldo', 'Días vencido']];
        r.forEach(x => x.pendientes.forEach(p => det.push([x.ruc, x.razon, fd(p.fecha), p.numero, fd(p.vence), p.total, p.saldo, Math.max(0, p.diasVencido)])));
        X.descargar([{ nombre: 'Antigüedad', ws: X.hoja(X.encabezado(cliente(), `CUENTAS CORRIENTES – ${tipo} – ANTIGÜEDAD DE SALDOS`, `Al ${fd(corte)}`).concat(res), { anchos: [13, 35, 14, 14, 14, 14, 14, 14, 15] }) },
          { nombre: 'Detalle', ws: X.hoja(det, { anchos: [13, 35, 11, 17, 11, 14, 14, 10] }) }], `ctas_ctes_${tipo.toLowerCase()}_${corte}_${slug(cliente().razon)}.xlsx`);
      };
    }
  }, 'importar');

  /* ======================= CONCILIACIÓN BANCARIA ======================= */
  function conciliar(d, cta, periodo) {
    const ext = (d.extractos || {})[`${cta}|${periodo}`] || { lineas: [] };
    const libro = [];
    C.todosLosAsientos(d).forEach(a => { if (a.fecha && a.fecha.slice(0, 7) === periodo) a.lineas.forEach(l => { if (l.cuenta === cta) libro.push({ fecha: a.fecha, concepto: a.concepto, monto: l.debe - l.haber, usado: false }); }); });
    const banco = ext.lineas.map(l => Object.assign({}, l, { match: null }));
    banco.forEach(b => {
      let mejor = null, dist = 99;
      libro.forEach(l => { if (!l.usado && Math.round(l.monto) === Math.round(b.monto)) { const dd = Math.abs(C.difDias(l.fecha, b.fecha)); if (dd <= 7 && dd < dist) { mejor = l; dist = dd; } } });
      if (mejor) { mejor.usado = true; b.match = mejor; }
    });
    const ini = C.inicioEjercicio(C.finDeMes(periodo), (d.cliente || {}).cierreMes);
    let saldoLibro = 0;
    C.todosLosAsientos(d).forEach(a => { if (a.fecha <= C.finDeMes(periodo) && !a.cierre) a.lineas.forEach(l => { if (l.cuenta === cta) saldoLibro += l.debe - l.haber; }); });
    const sinLibro = banco.filter(b => !b.match), sinBanco = libro.filter(l => !l.usado);
    const saldoBanco = ext.saldoBanco !== undefined && ext.saldoBanco !== '' ? C.num(ext.saldoBanco) : null;
    // Saldo banco = saldo libro + movimientos del banco no registrados − movimientos del libro no reflejados en el banco
    const saldoConciliado = saldoLibro + sinLibro.reduce((s, b) => s + b.monto, 0) - sinBanco.reduce((s, l) => s + l.monto, 0);
    return { ext, banco, libro, sinLibro, sinBanco, saldoLibro, saldoBanco, saldoConciliado, diferencia: saldoBanco === null ? null : Math.round(saldoBanco - saldoConciliado), ini };
  }
  A.registrar('bancos', 'Conciliación bancaria', 'Tesorería', {
    html() {
      const cta = st.bcoCta || '1.1.1.02.01';
      const r = conciliar(datos(), cta, st.periodo);
      return `<section class="card"><h2>Conciliación bancaria</h2>
        <div class="acciones"><label>Cuenta bancaria <input id="b-cta" list="dl-cuentas" value="${esc(cta)}"></label> <span class="muted">${esc(nombreCta(cta))}</span> ${perSel()}
          <button id="b-imp" class="primary">Importar extracto (Excel/CSV)</button> <button id="b-exp">Exportar conciliación</button></div>
        <p class="muted">El extracto debe tener columnas Fecha, Descripción/Concepto y Débito/Crédito (o Monto con signo) y opcionalmente Saldo. Los movimientos se concilian solos por importe y fecha (± 7 días). Los que figuran en el banco y no en la contabilidad se pueden registrar con un clic.</p>
        <div class="form cols4"><label>Saldo según extracto al cierre <input id="b-saldo" class="n gs" value="${r.saldoBanco === null ? '' : fmt(r.saldoBanco)}"></label>
          <label>Saldo según libros <input disabled class="n" value="${fmt(r.saldoLibro)}"></label>
          <label>Saldo libros conciliado <input disabled class="n" value="${fmt(r.saldoConciliado)}"></label>
          <label>Diferencia <input disabled class="n ${r.diferencia ? 'err' : ''}" value="${r.diferencia === null ? '' : fmt(r.diferencia)}"></label></div>
        <h3>Movimientos del banco no registrados en la contabilidad (${r.sinLibro.length})</h3>
        <table class="grid"><thead><tr><th>Fecha</th><th>Descripción</th><th>Importe</th><th>Contrapartida</th><th></th></tr></thead><tbody>
        ${r.sinLibro.map((b, i) => `<tr><td>${fd(b.fecha)}</td><td>${esc(b.desc)}</td><td class="n">${fmt(b.monto)}</td><td><input list="dl-cuentas" data-bc="${i}" placeholder="${b.monto < 0 ? '5.3.1.01.02 gastos bancarios' : '4.2.1.01.01 intereses'}"></td><td><button class="mini" data-bok="${i}">Registrar asiento</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Ninguno</td></tr>'}
        </tbody></table>
        <h3>Movimientos de la contabilidad no reflejados en el banco (${r.sinBanco.length})</h3>
        <table class="grid"><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th></tr></thead><tbody>
        ${r.sinBanco.map(l => `<tr><td>${fd(l.fecha)}</td><td>${esc(l.concepto)}</td><td class="n">${fmt(l.monto)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Ninguno</td></tr>'}</tbody></table>
        <h3>Conciliados (${r.banco.length - r.sinLibro.length})</h3>
        <table class="grid"><thead><tr><th>Fecha banco</th><th>Descripción</th><th>Fecha libro</th><th>Concepto</th><th>Importe</th></tr></thead><tbody>
        ${r.banco.filter(b => b.match).map(b => `<tr><td>${fd(b.fecha)}</td><td>${esc(b.desc)}</td><td>${fd(b.match.fecha)}</td><td>${esc(b.match.concepto)}</td><td class="n">${fmt(b.monto)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Ninguno</td></tr>'}</tbody></table>
      </section>`;
    },
    bind() {
      bindPer(); formatearMontos();
      const d = datos(), cta = () => st.bcoCta || '1.1.1.02.01', key = () => `${cta()}|${st.periodo}`;
      const ext = () => { const e = obj('extractos'); return e[key()] || (e[key()] = { lineas: [] }); };
      $('#b-cta').onchange = e => { st.bcoCta = e.target.value.trim(); render(); };
      $('#b-saldo').onchange = e => { ext().saldoBanco = e.target.value.trim() === '' ? '' : C.num(e.target.value); S.save(); render(); };
      $('#b-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        try {
          const filas = X.filas(await X.leerArchivo(f));
          const h = filas.findIndex(r => r.some(c => /fecha/i.test(String(c))));
          const head = (filas[h] || []).map(c => String(c).toLowerCase());
          const col = re => head.findIndex(c => re.test(c));
          const cF = col(/fecha/), cD = col(/descrip|concepto|detalle|movimiento/), cDeb = col(/d[ée]bito|egreso|retiro|cargo/), cCre = col(/cr[ée]dito|ingreso|dep[óo]sito|abono/), cM = col(/^monto|^importe/), cS = col(/saldo/);
          const lineas = []; let saldo = null;
          filas.slice(h + 1).forEach(r => {
            const fecha = C.parseFecha(r[cF]); if (!fecha) return;
            const monto = cM >= 0 && cDeb < 0 ? C.num(r[cM]) : C.num(r[cCre]) - C.num(r[cDeb]);
            if (!monto) return;
            lineas.push({ fecha, desc: String(r[cD] || '').trim(), monto: Math.round(monto) });
            if (cS >= 0 && r[cS] !== '') saldo = C.num(r[cS]);
          });
          const e = ext(); e.lineas = lineas; if (saldo !== null) e.saldoBanco = saldo;
          S.save(); render(); toast(`${lineas.length} movimientos del extracto importados`);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
      $$('[data-bok]').forEach(b => b.onclick = () => {
        const i = +b.dataset.bok, r = conciliar(d, cta(), st.periodo), m = r.sinLibro[i];
        const contra = ($(`[data-bc="${i}"]`).value || '').trim();
        if (!ctaValida(contra)) return toast('Indique una contrapartida válida', 'error');
        if (bloqueado(m.fecha)) return;
        const a = m.monto > 0 ? [{ cuenta: cta(), debe: m.monto, haber: 0 }, { cuenta: contra, debe: 0, haber: m.monto }] : [{ cuenta: contra, debe: -m.monto, haber: 0 }, { cuenta: cta(), debe: 0, haber: -m.monto }];
        arr('asientos').push({ id: S.uid(), fecha: m.fecha, concepto: `Banco: ${m.desc}`, lineas: a });
        S.save(); toast('Asiento registrado'); render();
      });
      $('#b-exp').onclick = () => {
        const r = conciliar(d, cta(), st.periodo);
        const aoa = X.encabezado(cliente(), `CONCILIACIÓN BANCARIA – ${cta()} ${nombreCta(cta())}`, `Período ${st.periodo}`).concat([
          ['Saldo según libros', C.r0(r.saldoLibro)], ['(+/−) Movimientos del banco no registrados', C.r0(r.sinLibro.reduce((s, b) => s + b.monto, 0))],
          ['(−/+) Movimientos registrados no reflejados en el banco', C.r0(-r.sinBanco.reduce((s, l) => s + l.monto, 0))], ['Saldo conciliado', C.r0(r.saldoConciliado)],
          ['Saldo según extracto', r.saldoBanco], ['Diferencia', r.diferencia], [], ['BANCO NO REGISTRADO'], ['Fecha', 'Descripción', 'Importe']],
          r.sinLibro.map(b => [fd(b.fecha), b.desc, b.monto]), [[], ['LIBROS NO REFLEJADO EN BANCO'], ['Fecha', 'Concepto', 'Importe']], r.sinBanco.map(l => [fd(l.fecha), l.concepto, l.monto]));
        X.descargar([{ nombre: 'Conciliación', ws: X.hoja(aoa, { anchos: [50, 40, 16] }) }], `conciliacion_${cta()}_${st.periodo}_${slug(cliente().razon)}.xlsx`);
      };
    }
  }, 'tesoreria');

  /* ======================= RETENCIONES ======================= */
  A.registrar('retenciones', 'Retenciones', 'Impuestos', {
    html() {
      const lst = arr('retenciones').filter(r => r.fecha && r.fecha.slice(0, 7) === st.periodo).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const tot = (t, i) => lst.filter(r => (r.tipo || 'RECIBIDA') === t && r.impuesto === i).reduce((s, r) => s + C.num(r.monto), 0);
      return `<section class="card"><h2>Comprobantes de retención</h2>${dlTerceros()}
        <div class="form cols4">
          <label>Fecha <input type="date" id="r-fecha" value="${hoy().slice(0, 7) === st.periodo ? hoy() : C.finDeMes(st.periodo)}"></label>
          <label>Tipo <select id="r-tipo"><option value="RECIBIDA">Recibida (me retuvieron)</option><option value="EMITIDA">Emitida (soy agente de retención)</option></select></label>
          <label>Impuesto <select id="r-imp"><option>IVA</option><option>IRE</option><option>IRP</option></select></label>
          <label>RUC del ${'agente / proveedor'} <input id="r-ruc" list="dl-terceros"></label>
          <label>Razón social <input id="r-razon"></label>
          <label>N° comprobante de retención <input id="r-num"></label>
          <label>Comprobante relacionado (factura) <input id="r-doc" placeholder="001-001-0000001"></label>
          <label>Monto retenido ${montoInp('r-monto')}</label>
        </div>
        <div class="acciones"><button id="r-ok" class="primary">Guardar retención</button> ${perSel()} <button id="r-exp">Exportar del mes</button> <button id="r-imp-x">Importar Excel</button></div>
        <p class="muted">Las retenciones de IVA recibidas completan solas la casilla 52 del Form. 120; las de IRE se descuentan en el Form. 500 y las de IRP en la liquidación del IRP. Cada retención genera su asiento y reduce el saldo de la cuenta corriente.</p>
        <div class="form cols4"><label>IVA recibidas <input disabled class="n" value="${fmt(tot('RECIBIDA', 'IVA'))}"></label><label>IRE recibidas <input disabled class="n" value="${fmt(tot('RECIBIDA', 'IRE'))}"></label>
          <label>IRP recibidas <input disabled class="n" value="${fmt(tot('RECIBIDA', 'IRP'))}"></label><label>Emitidas a depositar <input disabled class="n" value="${fmt(tot('EMITIDA', 'IVA') + tot('EMITIDA', 'IRE') + tot('EMITIDA', 'IRP'))}"></label></div>
        <table class="grid"><thead><tr><th>Fecha</th><th>Tipo</th><th>Impuesto</th><th>RUC</th><th>Razón social</th><th>N° retención</th><th>Factura</th><th>Monto</th><th></th></tr></thead><tbody>
        ${lst.map(r => `<tr><td>${fd(r.fecha)}</td><td>${r.tipo === 'EMITIDA' ? 'Emitida' : 'Recibida'}</td><td>${r.impuesto}</td><td>${esc(r.ruc)}</td><td>${esc(r.razon)}</td><td>${esc(r.numero)}</td><td>${esc(r.docNumero)}</td><td class="n">${fmt(r.monto)}</td><td><button class="mini danger" data-rmr="${r.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Sin retenciones en el período</td></tr>'}
        </tbody></table></section>`;
    },
    bind() {
      bindPer(); autoRazon('#r-ruc', '#r-razon'); $('#r-monto').classList.add('gs'); formatearMontos();
      $('#r-ok').onclick = () => {
        const r = { fecha: v('#r-fecha'), tipo: v('#r-tipo'), impuesto: v('#r-imp'), ruc: v('#r-ruc').trim(), razon: v('#r-razon').trim(), numero: v('#r-num').trim(), docNumero: C.formatearNumeroComprobante(v('#r-doc')), monto: C.r0(num('#r-monto')) };
        if (!r.fecha || !r.monto) return toast('Ingrese fecha y monto', 'error');
        if (bloqueado(r.fecha)) return;
        r.id = S.uid(); arr('retenciones').push(r); S.save(); toast('Retención registrada'); render();
      };
      $$('[data-rmr]').forEach(b => b.onclick = () => borrar('retenciones', b.dataset.rmr));
      $('#r-exp').onclick = () => {
        const lst = arr('retenciones').filter(r => r.fecha.slice(0, 7) === st.periodo);
        X.descargar([{ nombre: 'Retenciones', ws: X.hoja(X.encabezado(cliente(), 'COMPROBANTES DE RETENCIÓN', `Período ${st.periodo}`).concat([['Fecha', 'Tipo', 'Impuesto', 'RUC', 'Razón social', 'N° retención', 'Factura', 'Monto']],
          lst.map(r => [fd(r.fecha), r.tipo, r.impuesto, r.ruc, r.razon, r.numero, r.docNumero, C.r0(r.monto)])), { anchos: [11, 10, 9, 13, 30, 18, 17, 14] }) }], `retenciones_${st.periodo}_${slug(cliente().razon)}.xlsx`);
      };
      $('#r-imp-x').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        // Fecha | Tipo | Impuesto | RUC | Razón social | N° retención | Factura | Monto
        const filas = X.filas(await X.leerArchivo(f)); let n = 0;
        filas.forEach(r => { const fecha = C.parseFecha(r[0]); const monto = C.r0(r[7]); if (!fecha || !monto || C.periodoCerrado(datos(), fecha)) return;
          arr('retenciones').push({ id: S.uid(), fecha, tipo: /emit/i.test(r[1]) ? 'EMITIDA' : 'RECIBIDA', impuesto: /ire/i.test(r[2]) ? 'IRE' : /irp/i.test(r[2]) ? 'IRP' : 'IVA', ruc: String(r[3] || '').trim(), razon: String(r[4] || '').trim(), numero: String(r[5] || '').trim(), docNumero: C.formatearNumeroComprobante(r[6]), monto }); n++; });
        S.save(); render(); toast(`${n} retenciones importadas`);
      });
    }
  }, 'rg90');

  /* ======================= BIENES DE USO ======================= */
  A.registrar('bienes', 'Bienes de uso', 'Carga', {
    html() {
      const corte = C.finDeMes(st.periodo);
      const bienes = arr('bienes');
      const ed = st.bienEdit ? bienes.find(b => b.id === st.bienEdit) : null, b0 = ed || {};
      return `<section class="card"><h2>${ed ? 'Editar bien' : 'Alta de bien de uso'}</h2>
        <div class="form cols4">
          <label>Descripción <input id="bi-desc" value="${esc(b0.descripcion || '')}"></label>
          <label>Fecha de alta <input type="date" id="bi-alta" value="${esc(b0.fechaAlta || hoy())}"></label>
          <label>Valor de origen (Gs.) ${montoInp('bi-valor', b0.valor)}</label>
          <label>Valor residual ${montoInp('bi-res', b0.residual)}</label>
          <label>Vida útil (años) <input id="bi-vida" type="number" step="any" value="${esc(b0.vidaUtil || 5)}"></label>
          <label>Cuenta del bien <input id="bi-cta" list="dl-cuentas" value="${esc(b0.ctaActivo || '1.2.3.01.03')}"></label>
          <label>Cuenta depreciación acumulada <input id="bi-acum" list="dl-cuentas" value="${esc(b0.ctaDepAcum || '1.2.3.02.03')}"></label>
          <label>Cuenta de gasto <input id="bi-gasto" list="dl-cuentas" value="${esc(b0.ctaGasto || cfg().ctaDepGasto)}"></label>
          <label>Fecha de baja (opcional) <input type="date" id="bi-baja" value="${esc(b0.fechaBaja || '')}"></label>
        </div>
        <div class="acciones"><button id="bi-ok" class="primary">${ed ? 'Actualizar' : 'Agregar bien'}</button> ${ed ? '<button id="bi-cancel">Cancelar</button>' : ''}</div>
        <p class="muted">La compra del bien se carga en Compras con la cuenta del bien. Aquí se registra para calcular la depreciación: el sistema genera solo el asiento mensual (línea recta, desde el mes de alta). Use las vidas útiles del reglamento del IRE.</p>
      </section>
      <section class="card"><h2>Cuadro de bienes de uso</h2><div class="acciones">${perSel()} <span class="muted">al ${fd(corte)}</span> <button id="bi-exp">Exportar cuadro del ejercicio</button></div>
        <table class="grid"><thead><tr><th>Descripción</th><th>Alta</th><th>Vida útil</th><th>Valor origen</th><th>Cuota mensual</th><th>Dep. acumulada</th><th>Valor neto</th><th></th></tr></thead><tbody>
        ${bienes.map(b => { const da = C.depAcumulada(b, st.periodo); return `<tr><td>${esc(b.descripcion)}${b.fechaBaja ? ' <small>(baja ' + fd(b.fechaBaja) + ')</small>' : ''}</td><td>${fd(b.fechaAlta)}</td><td class="n">${b.vidaUtil}</td><td class="n">${fmt(b.valor)}</td><td class="n">${fmt(C.cuotaMensual(b))}</td><td class="n">${fmt(da)}</td><td class="n">${fmt(C.num(b.valor) - da)}</td>
          <td><button class="mini" data-bie="${b.id}">✎</button><button class="mini danger" data-bir="${b.id}">✕</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Sin bienes registrados</td></tr>'}
        </tbody></table></section>`;
    },
    bind() {
      bindPer(); ['#bi-valor', '#bi-res'].forEach(i => $(i).classList.add('gs')); formatearMontos();
      $('#bi-ok').onclick = () => {
        const b = { descripcion: v('#bi-desc').trim(), fechaAlta: v('#bi-alta'), valor: C.r0(num('#bi-valor')), residual: C.r0(num('#bi-res')), vidaUtil: num('#bi-vida'),
          ctaActivo: v('#bi-cta').trim(), ctaDepAcum: v('#bi-acum').trim(), ctaGasto: v('#bi-gasto').trim(), fechaBaja: v('#bi-baja') || undefined };
        if (!b.descripcion || !b.valor || !b.vidaUtil) return toast('Complete descripción, valor y vida útil', 'error');
        if (![b.ctaDepAcum, b.ctaGasto].every(ctaValida)) return toast('Revise las cuentas (deben existir y ser imputables)', 'error');
        if (st.bienEdit) Object.assign(arr('bienes').find(x => x.id === st.bienEdit), b); else { b.id = S.uid(); arr('bienes').push(b); }
        st.bienEdit = null; S.save(); toast('Bien guardado'); render();
      };
      if ($('#bi-cancel')) $('#bi-cancel').onclick = () => { st.bienEdit = null; render(); };
      $$('[data-bie]').forEach(b => b.onclick = () => { st.bienEdit = b.dataset.bie; render(); window.scrollTo(0, 0); });
      $$('[data-bir]').forEach(b => b.onclick = () => { if (confirm('¿Eliminar el bien? Se dejarán de generar sus depreciaciones.')) { datos().bienes = arr('bienes').filter(x => x.id !== b.dataset.bir); S.save(); render(); } });
      $('#bi-exp').onclick = () => {
        const hasta = C.finDeMes(st.periodo), desde = C.inicioEjercicio(hasta, cliente().cierreMes);
        const q = C.cuadroBienes(datos(), desde, hasta);
        X.descargar([{ nombre: 'Bienes de uso', ws: X.hoja(X.encabezado(cliente(), 'CUADRO DE BIENES DE USO Y DEPRECIACIONES', `Del ${fd(desde)} al ${fd(hasta)}`).concat(
          [['Descripción', 'Alta', 'Vida útil', 'Valor inicio', 'Altas', 'Bajas', 'Valor cierre', 'Dep. acum. inicio', 'Dep. ejercicio', 'Dep. acum. cierre', 'Valor neto']],
          q.map(b => [b.descripcion, fd(b.fechaAlta), b.vidaUtil, b.valorIni, b.altas, b.bajas, b.valorFin, b.depIni, b.depEjercicio, b.depFin, b.neto])), { anchos: [35, 11, 9, 15, 15, 15, 15, 15, 15, 15, 15] }) }],
          `bienes_de_uso_${hasta}_${slug(cliente().razon)}.xlsx`);
      };
    }
  }, 'importar');

  /* ======================= SUELDOS E IPS ======================= */
  A.registrar('sueldos', 'Sueldos e IPS', 'Personal', {
    html() {
      const c = cfg(), emp = arr('empleados'), pl = C.calcularPlanilla(datos(), st.periodo);
      return `<section class="card"><h2>Empleados</h2>
        <div class="form cols4"><label>Nombre <input id="e-nom"></label><label>C.I. <input id="e-ci"></label><label>Salario mensual ${montoInp('e-sal')}</label><label>Fecha de ingreso <input type="date" id="e-ing"></label></div>
        <div class="acciones"><button id="e-ok" class="primary">Agregar empleado</button></div>
        <table class="grid"><thead><tr><th>Nombre</th><th>C.I.</th><th>Ingreso</th><th>Salario</th><th>Activo</th><th></th></tr></thead><tbody>
        ${emp.map(e => `<tr><td>${esc(e.nombre)}</td><td>${esc(e.ci)}</td><td>${fd(e.ingreso)}</td><td><input class="n gs" data-esal="${e.id}" value="${fmt(e.salario)}" size="12"></td><td class="c"><input type="checkbox" data-eact="${e.id}" ${e.activo !== false ? 'checked' : ''}></td><td><button class="mini danger" data-erm="${e.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin empleados</td></tr>'}
        </tbody></table></section>
      <section class="card"><h2>Planilla de sueldos</h2>
        <div class="acciones">${perSel()} ${pl ? '<button id="pl-del" class="danger">Eliminar planilla</button> <button id="pl-exp">Exportar planilla</button>' : '<button id="pl-gen" class="primary">Generar planilla desde empleados activos</button>'}</div>
        <p class="muted">IPS: aporte obrero ${c.pctIPSObrero}% y patronal ${c.pctIPSPatronal}% sobre el salario bruto; provisión de aguinaldo 1/12. El asiento del mes se genera solo (sueldos, aporte patronal y aguinaldo contra sueldos a pagar, IPS a pagar y aguinaldos a pagar). El pago se registra en "Cobros, pagos" con contrapartida Sueldos a pagar / IPS a pagar.</p>
        ${pl ? `<div class="scroll"><table class="grid"><thead><tr><th>Empleado</th><th>C.I.</th><th>Salario</th><th>Horas extra / otros</th><th>Bruto</th><th>IPS ${c.pctIPSObrero}%</th><th>Descuentos</th><th>Aguinaldo pagado</th><th>Neto a cobrar</th><th>IPS patronal</th><th>Prov. aguinaldo</th></tr></thead><tbody>
          ${pl.filas.map((f, i) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.ci)}</td><td><input class="n gs" data-pl="${i}" data-k="salario" value="${fmt(f.salario)}" size="11"></td><td><input class="n gs" data-pl="${i}" data-k="extras" value="${fmt(f.extras)}" size="10"></td>
            <td class="n">${fmt(f.bruto)}</td><td class="n">${fmt(f.ipsObrero)}</td><td><input class="n gs" data-pl="${i}" data-k="descuentos" value="${fmt(f.descuentos)}" size="10"></td><td><input class="n gs" data-pl="${i}" data-k="aguinaldo" value="${fmt(f.aguinaldo)}" size="10"></td>
            <td class="n"><b>${fmt(f.neto)}</b></td><td class="n">${fmt(f.ipsPatronal)}</td><td class="n">${fmt(f.provAguinaldo)}</td></tr>`).join('')}
          </tbody><tfoot><tr><td colspan="4">TOTALES</td><td class="n">${fmt(pl.t.bruto)}</td><td class="n">${fmt(pl.t.ipsObrero)}</td><td class="n">${fmt(pl.t.descuentos)}</td><td class="n">${fmt(pl.t.aguinaldoPagado)}</td><td class="n">${fmt(pl.t.neto)}</td><td class="n">${fmt(pl.t.ipsPatronal)}</td><td class="n">${fmt(pl.t.provAguinaldo)}</td></tr></tfoot></table></div>
          <p>Total a depositar en IPS: <b>Gs. ${fmt(pl.t.ipsObrero + pl.t.ipsPatronal)}</b></p>` : '<p class="muted">No hay planilla para este período.</p>'}
      </section>`;
    },
    bind() {
      bindPer(); $('#e-sal').classList.add('gs'); formatearMontos();
      const d = datos();
      $('#e-ok').onclick = () => {
        const e = { id: S.uid(), nombre: v('#e-nom').trim(), ci: v('#e-ci').trim(), salario: C.r0(num('#e-sal')), ingreso: v('#e-ing'), activo: true };
        if (!e.nombre || !e.salario) return toast('Ingrese nombre y salario', 'error');
        arr('empleados').push(e); S.save(); render();
      };
      $$('[data-esal]').forEach(i => i.onchange = () => { arr('empleados').find(e => e.id === i.dataset.esal).salario = C.r0(C.num(i.value)); S.save(); });
      $$('[data-eact]').forEach(i => i.onchange = () => { arr('empleados').find(e => e.id === i.dataset.eact).activo = i.checked; S.save(); });
      $$('[data-erm]').forEach(b => b.onclick = () => { if (confirm('¿Eliminar el empleado?')) { d.empleados = arr('empleados').filter(e => e.id !== b.dataset.erm); S.save(); render(); } });
      if ($('#pl-gen')) $('#pl-gen').onclick = () => {
        if (bloqueado(C.finDeMes(st.periodo))) return;
        const act = arr('empleados').filter(e => e.activo !== false);
        if (!act.length) return toast('No hay empleados activos', 'error');
        obj('planillas')[st.periodo] = { lineas: act.map(e => ({ empId: e.id, nombre: e.nombre, ci: e.ci, salario: e.salario, extras: 0, descuentos: 0, aguinaldo: st.periodo.endsWith('-12') ? '' : 0 })) };
        S.save(); render();
      };
      if ($('#pl-del')) $('#pl-del').onclick = () => { if (bloqueado(C.finDeMes(st.periodo))) return; if (confirm('¿Eliminar la planilla del período?')) { delete obj('planillas')[st.periodo]; S.save(); render(); } };
      $$('[data-pl]').forEach(i => i.onchange = () => { if (bloqueado(C.finDeMes(st.periodo))) return render(); obj('planillas')[st.periodo].lineas[+i.dataset.pl][i.dataset.k] = C.r0(C.num(i.value)); S.save(); render(); });
      if ($('#pl-exp')) $('#pl-exp').onclick = () => {
        const pl = C.calcularPlanilla(d, st.periodo);
        X.descargar([{ nombre: 'Planilla', ws: X.hoja(X.encabezado(cliente(), 'PLANILLA DE SUELDOS Y JORNALES', `Período ${st.periodo}`).concat(
          [['Empleado', 'C.I.', 'Salario', 'Extras/otros', 'Bruto', 'IPS obrero', 'Descuentos', 'Aguinaldo', 'Neto', 'IPS patronal', 'Prov. aguinaldo']],
          pl.filas.map(f => [f.nombre, f.ci, C.r0(f.salario), C.r0(f.extras), f.bruto, f.ipsObrero, f.descuentos, f.aguinaldo, f.neto, f.ipsPatronal, f.provAguinaldo]),
          [['TOTALES', '', '', '', pl.t.bruto, pl.t.ipsObrero, pl.t.descuentos, pl.t.aguinaldoPagado, pl.t.neto, pl.t.ipsPatronal, pl.t.provAguinaldo]]), { anchos: [30, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13] }) }],
          `planilla_${st.periodo}_${slug(cliente().razon)}.xlsx`);
      };
    }
  });

  /* ======================= ASIENTOS RECURRENTES ======================= */
  A.registrar('recurrentes', 'Asientos recurrentes', 'Carga', {
    html() {
      const rec = arr('recurrentes');
      const fila = () => `<tr><td><input class="rl-cta" list="dl-cuentas" size="14"></td><td><input class="rl-d n gs" size="12"></td><td><input class="rl-h n gs" size="12"></td></tr>`;
      return `<section class="card"><h2>Nuevo asiento recurrente</h2>
        <p class="muted">Para gastos fijos (alquiler, cuotas, honorarios, seguros). Se genera solo cada mes entre las fechas indicadas, sin cargarlo de nuevo.</p>
        <div class="form cols4"><label>Concepto <input id="rc-con"></label><label>Día del mes <input id="rc-dia" type="number" min="1" max="31" value="1"></label>
          <label>Desde <input type="month" id="rc-desde" value="${st.periodo}"></label><label>Hasta (vacío = sin fin) <input type="month" id="rc-hasta"></label></div>
        <table class="grid asiento"><thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead><tbody id="rc-lin">${fila()}${fila()}${fila()}</tbody></table>
        <div class="acciones"><button id="rc-ok" class="primary">Guardar</button></div></section>
      <section class="card"><h2>Asientos recurrentes</h2>
        <table class="grid"><thead><tr><th>Concepto</th><th>Día</th><th>Desde</th><th>Hasta</th><th>Líneas</th><th>Activo</th><th></th></tr></thead><tbody>
        ${rec.map(r => `<tr><td>${esc(r.concepto)}</td><td>${r.dia}</td><td>${r.desde}</td><td>${r.hasta || '—'}</td><td>${r.lineas.map(l => `${esc(l.cuenta)} ${l.debe ? 'D ' + fmt(l.debe) : 'H ' + fmt(l.haber)}`).join('<br>')}</td>
          <td class="c"><input type="checkbox" data-rca="${r.id}" ${r.activo !== false ? 'checked' : ''}></td><td><button class="mini danger" data-rcr="${r.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sin asientos recurrentes</td></tr>'}
        </tbody></table></section>`;
    },
    bind() {
      formatearMontos();
      $('#rc-ok').onclick = () => {
        const r = { concepto: v('#rc-con').trim(), dia: +v('#rc-dia') || 1, desde: v('#rc-desde'), hasta: v('#rc-hasta') || '', activo: true,
          lineas: $$('#rc-lin tr').map(tr => ({ cuenta: $('.rl-cta', tr).value.trim(), debe: C.r0(C.num($('.rl-d', tr).value)), haber: C.r0(C.num($('.rl-h', tr).value)) })).filter(l => l.cuenta && (l.debe || l.haber)) };
        if (!r.concepto || !r.desde) return toast('Complete concepto y mes de inicio', 'error');
        const errs = C.validarAsiento({ fecha: r.desde + '-01', lineas: r.lineas }, A.plan);
        if (r.lineas.length < 2 || errs.length) return toast(errs.join('. ') || 'Al menos dos líneas', 'error');
        r.id = S.uid(); arr('recurrentes').push(r); S.save(); toast('Asiento recurrente guardado'); render();
      };
      $$('[data-rca]').forEach(i => i.onchange = () => { arr('recurrentes').find(r => r.id === i.dataset.rca).activo = i.checked; S.save(); });
      $$('[data-rcr]').forEach(b => b.onclick = () => { if (confirm('¿Eliminar? También desaparecen los asientos ya generados por este recurrente.')) { datos().recurrentes = arr('recurrentes').filter(r => r.id !== b.dataset.rcr); S.save(); render(); } });
    }
  }, 'bienes');

  /* ======================= IRP e IDU ======================= */
  A.registrar('irpidu', 'IRP e IDU', 'Impuestos', {
    html() {
      const anio = st.anioIRP || +hoy().slice(0, 4) - 1;
      const ent = obj('irp')[anio] || {}, r = C.irp(datos(), anio), c = cfg();
      const inp = (k, n, ph) => `<label>${n}<input class="n gs" data-irp="${k}" value="${ent[k] !== undefined && ent[k] !== '' ? fmt(ent[k]) : ''}" placeholder="${esc(ph === undefined ? '0' : ph)}"></label>`;
      const liq = C.liquidacionIDU(datos(), st.periodo);
      return `<section class="card"><h2>IRP – Impuesto a la Renta Personal (preliquidación anual)</h2>
        <div class="acciones"><label>Año <input type="number" id="irp-anio" value="${anio}" style="width:6em"></label> <button id="irp-exp">Exportar</button></div>
        <div class="form cols3">${inp('otrosIngresos', 'Otros ingresos gravados (salarios, alquileres…)')}${inp('otrosEgresos', 'Otros gastos deducibles')}${inp('aportesIPS', 'Aportes IPS / jubilación')}
          ${inp('retenciones', 'Retenciones de IRP', `de los comprobantes: ${fmt(r.retenciones)}`)}${inp('anticipos', 'Anticipos pagados')}${inp('saldoFavorAnterior', 'Saldo a favor año anterior')}</div>
        <p class="muted">Ingresos: ventas del año sin IVA. Gastos: compras del año con IVA incluido. Tramos (configurables en Clientes): ${esc(c.irpTramos)}. Verifique gastos deducibles, topes y tasas vigentes.</p>
        <table class="grid f120"><tbody>
          <tr><td>Ingresos por ventas/servicios (sin IVA)</td><td class="n">${fmt(r.ingresos)}</td></tr><tr><td>Otros ingresos</td><td class="n">${fmt(r.otrosIngresos)}</td></tr><tr class="total"><td>Total ingresos</td><td class="n">${fmt(r.ingresosTot)}</td></tr>
          <tr><td>Compras y gastos</td><td class="n">${fmt(r.egresos)}</td></tr><tr><td>Otros gastos y aportes</td><td class="n">${fmt(r.otrosEgresos + r.aportesIPS)}</td></tr><tr class="total"><td>Total gastos deducibles</td><td class="n">${fmt(r.egresosTot)}</td></tr>
          <tr class="total"><td>RENTA NETA</td><td class="n">${fmt(r.rentaNeta)}</td></tr>
          ${r.tramos.map(t => `<tr><td class="ind">Tramo ${fmt(t.desde)} – ${t.hasta === Infinity ? 'en adelante' : fmt(t.hasta)} al ${t.tasa}% sobre ${fmt(t.base)}</td><td class="n">${fmt(t.impuesto)}</td></tr>`).join('')}
          <tr class="total"><td>IMPUESTO LIQUIDADO</td><td class="n">${fmt(r.impuesto)}</td></tr>
          <tr><td>(−) Retenciones, anticipos y saldo a favor</td><td class="n">${fmt(-(r.retenciones + r.anticipos + r.saldoFavorAnterior))}</td></tr>
          <tr class="total"><td>${r.neto >= 0 ? 'SALDO A PAGAR' : 'SALDO A FAVOR'}</td><td class="n">${fmt(Math.abs(r.neto))}</td></tr></tbody></table>
      </section>
      <section class="card"><h2>IDU – Distribución de dividendos y utilidades</h2>
        <div class="form cols4"><label>Fecha <input type="date" id="dv-fecha" value="${hoy()}"></label><label>Socio / accionista <input id="dv-socio"></label><label>C.I. / RUC <input id="dv-ci"></label>
          <label>Residencia <select id="dv-res"><option value="S">Residente (${c.pctIDUResidente}%)</option><option value="N">No residente (${c.pctIDUNoResidente}%)</option></select></label><label>Monto distribuido ${montoInp('dv-monto')}</label></div>
        <div class="acciones"><button id="dv-ok" class="primary">Registrar distribución</button> ${perSel()} <button id="dv-exp">Exportar liquidación del mes</button></div>
        <p class="muted">Cada distribución genera el asiento: Resultados acumulados a Dividendos a pagar (neto) e IDU retenido a depositar.</p>
        <table class="grid"><thead><tr><th>Fecha</th><th>Socio</th><th>C.I./RUC</th><th>Residente</th><th>Monto</th><th>Tasa</th><th>IDU</th><th></th></tr></thead><tbody>
        ${liq.filas.map((f, i) => `<tr><td>${fd(f.fecha)}</td><td>${esc(f.socio)}</td><td>${esc(f.ci)}</td><td>${f.residente ? 'Sí' : 'No'}</td><td class="n">${fmt(f.monto)}</td><td class="n">${f.tasa}%</td><td class="n">${fmt(f.idu)}</td><td><button class="mini danger" data-dvr="${arr('dividendos').filter(x => x.fecha.slice(0, 7) === st.periodo)[i].id}">✕</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin distribuciones en el período</td></tr>'}
        </tbody><tfoot><tr><td colspan="4">TOTAL IDU A INGRESAR</td><td class="n">${fmt(liq.base)}</td><td></td><td class="n">${fmt(liq.total)}</td><td></td></tr></tfoot></table>
      </section>`;
    },
    bind() {
      bindPer(); $('#dv-monto').classList.add('gs'); formatearMontos();
      const anio = () => st.anioIRP || +hoy().slice(0, 4) - 1;
      $('#irp-anio').onchange = e => { st.anioIRP = +e.target.value; render(); };
      $$('[data-irp]').forEach(i => i.onchange = () => { const e = obj('irp')[anio()] || (obj('irp')[anio()] = {}); if (i.value.trim() === '') delete e[i.dataset.irp]; else e[i.dataset.irp] = C.num(i.value); S.save(); render(); });
      $('#irp-exp').onclick = () => {
        const r = C.irp(datos(), anio());
        const aoa = X.encabezado(cliente(), `IRP – PRELIQUIDACIÓN AÑO ${anio()}`).concat([['Concepto', 'Importe']], [['Ingresos por ventas/servicios', r.ingresos], ['Otros ingresos', r.otrosIngresos], ['Total ingresos', r.ingresosTot],
          ['Compras y gastos', r.egresos], ['Otros gastos', r.otrosEgresos], ['Aportes IPS', r.aportesIPS], ['Total gastos', r.egresosTot], ['Renta neta', r.rentaNeta]],
          r.tramos.map(t => [`Tramo al ${t.tasa}% sobre ${t.base}`, t.impuesto]), [['Impuesto liquidado', r.impuesto], ['Retenciones', -r.retenciones], ['Anticipos', -r.anticipos], ['Saldo a favor anterior', -r.saldoFavorAnterior], ['Saldo', r.neto]]);
        X.descargar([{ nombre: 'IRP', ws: X.hoja(aoa, { anchos: [50, 18] }) }], `IRP_${anio()}_${slug(cliente().razon)}.xlsx`);
      };
      $('#dv-ok').onclick = () => {
        const dv = { fecha: v('#dv-fecha'), socio: v('#dv-socio').trim(), ci: v('#dv-ci').trim(), residente: v('#dv-res') === 'S', monto: C.r0(num('#dv-monto')) };
        if (!dv.fecha || !dv.monto || !dv.socio) return toast('Complete fecha, socio y monto', 'error');
        if (bloqueado(dv.fecha)) return;
        dv.id = S.uid(); arr('dividendos').push(dv); st.periodo = dv.fecha.slice(0, 7); S.save(); toast('Distribución registrada'); render();
      };
      $$('[data-dvr]').forEach(b => b.onclick = () => borrar('dividendos', b.dataset.dvr));
      $('#dv-exp').onclick = () => {
        const l = C.liquidacionIDU(datos(), st.periodo);
        X.descargar([{ nombre: 'IDU', ws: X.hoja(X.encabezado(cliente(), 'LIQUIDACIÓN IDU – DIVIDENDOS Y UTILIDADES', `Período ${st.periodo}`).concat([['Fecha', 'Socio', 'C.I./RUC', 'Residente', 'Monto', 'Tasa %', 'IDU']],
          l.filas.map(f => [fd(f.fecha), f.socio, f.ci, f.residente ? 'S' : 'N', f.monto, f.tasa, f.idu]), [['TOTAL', '', '', '', l.base, '', l.total]]), { anchos: [11, 30, 14, 10, 15, 8, 14] }) }], `IDU_${st.periodo}_${slug(cliente().razon)}.xlsx`);
      };
    }
  }, 'retenciones');

  /* ======================= VENCIMIENTOS ======================= */
  function opcionesVto(cli) {
    const d = S.db().data[cli.id] || {}, c = C.config(d);
    return { mesesAnticiposIRE: c.mesesAnticiposIRE, mesesVtoIRE: c.mesesVtoIRE, ips: (d.empleados || []).length > 0,
      retenciones: (d.retenciones || []).some(r => r.tipo === 'EMITIDA') || (d.dividendos || []).length > 0, irp: c.rg90ImputaIRP === 'S' };
  }
  A.registrar('vencimientos', 'Vencimientos', 'Control', {
    html() {
      const anio = st.anioVto || +hoy().slice(0, 4), cli = cliente(), h = hoy();
      const r = C.vencimientos(cli.ruc, anio, cli.cierreMes, opcionesVto(cli));
      const lim = C.addDias(h, 30);
      const todos = [];
      S.db().clientes.forEach(c => C.vencimientos(c.ruc, +h.slice(0, 4), c.cierreMes, opcionesVto(c)).items.concat(C.vencimientos(c.ruc, +h.slice(0, 4) - 1, c.cierreMes, opcionesVto(c)).items)
        .filter(x => x.fecha >= h && x.fecha <= lim).forEach(x => todos.push(Object.assign({ cliente: c.razon, ruc: c.ruc }, x))));
      todos.sort((a, b) => a.fecha.localeCompare(b.fecha));
      const estado = f => f < h ? '<span class="muted">vencido</span>' : f <= C.addDias(h, 7) ? '<b class="err">esta semana</b>' : f <= lim ? '<b>próximo</b>' : '';
      return `<section class="card"><h2>Próximos 30 días – todos los clientes</h2>
        <table class="grid"><thead><tr><th>Fecha</th><th>Cliente</th><th>RUC</th><th>Obligación</th><th>Período</th></tr></thead><tbody>
        ${todos.map(x => `<tr><td>${fd(x.fecha)} ${estado(x.fecha)}</td><td>${esc(x.cliente)}</td><td>${esc(x.ruc)}</td><td>${esc(x.obligacion)}</td><td>${esc(x.periodo)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin vencimientos en los próximos 30 días</td></tr>'}</tbody></table></section>
      <section class="card"><h2>Calendario anual de ${esc(cli.razon)}</h2>
        <div class="acciones"><label>Año <input type="number" id="vt-anio" value="${anio}" style="width:6em"></label> <span class="muted">RUC terminado en ${r.digito} → vence el día ${r.dia} (o el siguiente día hábil)</span> <button id="vt-exp">Exportar</button></div>
        <table class="grid"><thead><tr><th>Fecha</th><th>Obligación</th><th>Período</th><th></th></tr></thead><tbody>
        ${r.items.map(x => `<tr><td>${fd(x.fecha)}</td><td>${esc(x.obligacion)}</td><td>${esc(x.periodo)}</td><td>${estado(x.fecha)}</td></tr>`).join('')}</tbody></table>
        <p class="muted">Calendario general según terminación del RUC (día 7 al 25). Los feriados móviles no se consideran: confirme con el calendario oficial de la DNIT de cada año.</p></section>`;
    },
    bind() {
      $('#vt-anio').onchange = e => { st.anioVto = +e.target.value; render(); };
      $('#vt-exp').onclick = () => {
        const anio = st.anioVto || +hoy().slice(0, 4), cli = cliente(), r = C.vencimientos(cli.ruc, anio, cli.cierreMes, opcionesVto(cli));
        X.descargar([{ nombre: 'Vencimientos', ws: X.hoja(X.encabezado(cli, `CALENDARIO DE VENCIMIENTOS ${anio}`).concat([['Fecha', 'Obligación', 'Período']], r.items.map(x => [fd(x.fecha), x.obligacion, x.periodo])), { anchos: [12, 45, 16] }) }],
          `vencimientos_${anio}_${slug(cli.razon)}.xlsx`);
      };
    }
  });

  /* ======================= CIERRE DE PERÍODOS ======================= */
  A.registrar('cierre', 'Cierre de períodos', 'Control', {
    html() {
      const c = cfg().cerradoHasta;
      return `<section class="card"><h2>Cierre de períodos</h2>
        <p>${c ? `Períodos <b>cerrados hasta el ${fd(c)}</b>: no se pueden agregar, modificar ni eliminar comprobantes, asientos, cobros, retenciones ni planillas con fecha anterior o igual.` : 'No hay períodos cerrados.'}</p>
        <div class="acciones">${perSel()} <button id="ci-cerrar" class="primary">Cerrar hasta el fin de ${st.periodo}</button> ${c ? '<button id="ci-abrir" class="danger">Reabrir todos los períodos</button>' : ''}</div>
        <p class="muted">Cierre cada mes después de presentar el Form. 120 y el registro RG 90, para que los datos declarados no cambien por error.</p></section>`;
    },
    bind() {
      bindPer();
      const set = val => { const d = datos(); d.config = Object.assign({}, d.config, { cerradoHasta: val }); S.save(); render(); };
      $('#ci-cerrar').onclick = () => { const f = C.finDeMes(st.periodo); if (confirm(`¿Cerrar todos los períodos hasta el ${fd(f)}?`)) set(f); };
      if ($('#ci-abrir')) $('#ci-abrir').onclick = () => { if (confirm('¿Reabrir los períodos cerrados?')) set(''); };
    }
  }, 'vencimientos');
})();
