/* Pantallas del IRP (Form. 515 y 516) e IDU, con formularios en formato oficial, ayuda por casilla y proforma imprimible. */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, X, $, $$, esc, fmt, fd, hoy, st, toast, datos, cfg, pedirArchivo, slug, cliente, render, bloqueado } = A;
  const AY = window.AyudaFormularios || {};
  const v = id => ($(id) ? $(id).value : '');
  const obj = (k, anio) => { const d = datos(); const o = d[k] || (d[k] = {}); return o[anio] || (o[anio] = {}); };
  const anioIRP = () => st.anioIRP || (+hoy().slice(0, 4) - 1);

  /* ---------- Renderizado genérico de formularios (pantalla e impresión) ---------- */
  // rubros: [{titulo, cols, filas: [[inciso, texto, [ [casilla, valor] | null, ...], esTotal]]}]
  A.tablaFormulario = function (rubros, editables) {
    editables = editables || {};
    const celda = x => {
      if (!x) return '<td class="cas"></td><td></td>';
      const [n, val] = x, ed = editables[n];
      return `<td class="cas" data-cas="${n}">${n}</td><td class="n">${ed ? `<input class="n cas-in" data-k="${ed}" value="${val ? fmt(val) : ''}" placeholder="0">` : fmt(val)}</td>`;
    };
    return rubros.map(r => `<table class="grid f120 v4"><thead><tr class="titulo"><td colspan="${2 + r.cols.length * 2}">${esc(r.titulo)}</td></tr>
      <tr><th>Inc.</th><th>Concepto</th>${r.cols.map(c => `<th colspan="2">${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${r.filas.map(([inc, txt, cel, tot]) => `<tr class="${tot ? 'total' : ''}"><td class="c">${inc}</td><td>${esc(txt)}</td>${cel.map(celda).join('')}</tr>`).join('')}</tbody></table>`).join('');
  };
  A.ayudaCasillas = function (tabla) {
    const caja = $('#ayuda-cas');
    $$('td.cas[data-cas]').forEach(td => {
      const n = td.dataset.cas, a = tabla[n]; if (!a) return;
      td.classList.add('ayuda'); td.title = `${a[0]}${a[1] ? '\nEn ContaPY: ' + a[1] : ''}`;
      td.onclick = () => { if (!caja) return; caja.innerHTML = `<b>Casilla ${n}.</b> ${esc(a[0])}${a[1] ? `<br><b>En ContaPY:</b> ${esc(a[1])}` : ''}`; caja.classList.remove('muted'); $$('td.cas.activa').forEach(x => x.classList.remove('activa')); td.classList.add('activa'); };
    });
  };
  A.imprimirFormulario = function (numero, nombre, version, periodo, rubros, extra) {
    const cli = cliente();
    const celda = x => x ? `<td class="cas">${x[0]}</td><td class="n">${(Math.round(x[1]) || 0).toLocaleString('es-PY')}</td>` : '<td class="cas vac"></td><td class="vac"></td>';
    const cuerpo = rubros.map(r => `<table><tr class="tit"><td colspan="${2 + r.cols.length * 2}">${esc(r.titulo)}</td></tr><tr class="sub"><td>INC.</td><td></td>${r.cols.map(c => `<td colspan="2">${esc(c)}</td>`).join('')}</tr>
      ${r.filas.map(([inc, txt, cel, tot]) => `<tr class="${tot ? 'tot' : ''}"><td class="inc">${inc}</td><td>${esc(txt)}</td>${cel.map(celda).join('')}</tr>`).join('')}</table>`).join('');
    const w = window.open('', '_blank');
    if (!w) return toast('Permita ventanas emergentes para imprimir la proforma.', 'error');
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Form. ${numero} ${periodo} – ${esc(cli.razon || '')}</title><style>
      body{font:10px Arial,sans-serif;margin:10mm}table{width:100%;border-collapse:collapse;margin-bottom:6px}td{border:1px solid #555;padding:2px 4px;vertical-align:middle}
      .enc{display:grid;grid-template-columns:110px 1fr 1fr;border:2px solid #000;margin-bottom:6px}.enc>div{padding:4px 6px;border-right:1px solid #000}.enc .f{font-size:26px;font-weight:bold;text-align:center}
      tr.tit td{background:#ddd;font-weight:bold}tr.sub td{background:#f2f2f2;font-weight:bold;text-align:center}td.cas{width:28px;text-align:center;background:#f2f2f2;font-weight:bold}td.n{width:90px;text-align:right}
      td.inc{width:18px;text-align:center}td.vac{background:#e6e6e6}tr.tot td{font-weight:bold}.pie{margin-top:14px}.barra{text-align:center;margin-bottom:8px}@media print{.barra{display:none}}</style></head><body>
      <div class="barra"><button onclick="print()">Imprimir / Guardar como PDF</button></div>
      <div class="enc"><div class="f">${numero}<br><small style="font-size:9px">${esc(nombre)}<br>${esc(version)}</small></div>
        <div><b>RUC:</b> ${esc(cli.ruc || '')}<br><b>Nombre / razón social:</b> ${esc(cli.razon || '')}<br>01 Declaración Jurada Original</div>
        <div><b>Período / Ejercicio fiscal:</b> ${esc(String(periodo))}<br><small>Importes sin céntimos – proforma de control generada por ContaPY</small></div></div>
      ${cuerpo}${extra || ''}<div class="pie">Proforma para transcribir en el Sistema Marangatu. Los importes son de control y no reemplazan a la declaración presentada.</div></body></html>`);
    w.document.close();
  };
  const ayudaBox = '<div id="ayuda-cas" class="ayuda-cas muted">💡 Toque un número de casilla para ver qué va ahí según el instructivo de la DNIT y de dónde lo toma el sistema. Las casillas con recuadro blanco se cargan; el resto se calcula solo.</div>';
  const alertasHTML = l => l.length ? `<div class="alerta">${l.map(esc).join('<br>')}</div>` : '';

  /* ======================= FORM. 515 – IRP RSP ======================= */
  const EDIT_515 = { 10: 'c10', 11: 'c11', 12: 'c12', 13: 'c13', 15: 'c15', 16: 'c16', 17: 'c17', 18: 'c18', 19: 'c19', 20: 'c20', 21: 'c21', 23: 'c23', 34: 'c34', 36: 'c36', 38: 'c38', 40: 'c40', 41: 'c41', 42: 'c42', 49: 'c49' };
  A.registrar('f515', 'IRP – Servicios personales (Form. 515)', 'Impuestos', {
    html() {
      const anio = anioIRP(), r = C.f515(datos(), anio), e = (datos().irp515 || {})[anio] || {}, sg = r.sugeridos;
      const pres = r.prestamos.concat(new Array(Math.max(0, Math.min(10, r.prestamos.length + 1) - r.prestamos.length)).fill(null)).slice(0, 10);
      return `<section class="card"><h2>Formulario 515 – IRP Rentas derivadas de la prestación de servicios personales</h2>
        <div class="acciones"><label>Ejercicio fiscal <input type="number" id="i5-anio" value="${anio}" style="width:6em"></label>
          <label class="chk"><input type="checkbox" id="i5-sug" ${e.usarSugeridos !== false ? 'checked' : ''}> Usar valores sugeridos por la contabilidad</label>
          <button id="i5-print" class="primary">Imprimir proforma</button> <button id="i5-exp">Exportar a Excel</button></div>
        <p class="muted">Sugeridos para ${anio}: ingresos gravados ${fmt(sg.c12)} (cas. 12) · egresos de la actividad ${fmt(sg.c15)} (cas. 15) · aporte patronal IPS ${fmt(sg.c19)} (cas. 19) · retenciones IRP ${fmt(sg.c41)} (cas. 41).
          Lo que escriba en una casilla reemplaza al valor sugerido; deje vacío para volver al sugerido.</p>
        ${(datos().cuentas || []).some(c => c.irp) ? '' : '<div class="alerta">El plan de cuentas de este cliente no tiene cuentas con casilla del IRP: todas las compras irán a la casilla 15. Agréguelas en Cliente → Plan de cuentas → "Agregar cuentas de IRP".</div>'}
        ${alertasHTML(r.alertas)}${ayudaBox}
        ${A.tablaFormulario(r.rubros, EDIT_515)}
        <div class="resultado ${r.k.c51 ? 'pagar' : 'favor'}">${r.k.c51 ? `IRP a ingresar (cas. 51): <b>Gs. ${fmt(r.k.c51)}</b>` : `Saldo a favor del contribuyente (cas. 44): <b>Gs. ${fmt(r.k.c44)}</b>`} · Renta neta imponible (cas. 45): <b>Gs. ${fmt(r.k.c45)}</b></div>
      </section>
      <section class="card"><h2>Anexo – Cuadro 1: préstamos y remanente de ingresos gravados de ejercicios anteriores</h2>
        <table class="grid"><thead><tr><th>I – Préstamo o remanente</th><th>II – RUC entidad (sin DV)</th><th>III – Fecha</th><th>IV – Monto total</th><th>V – Utilizado en el ejercicio</th><th></th></tr></thead><tbody>
        ${pres.map((p, i) => `<tr><td><select data-pr="${i}" data-f="tipo"><option value="PRESTAMO">Préstamo obtenido</option><option value="REMANENTE" ${p && p.tipo === 'REMANENTE' ? 'selected' : ''}>Remanente de ingresos gravados</option></select></td>
          <td><input data-pr="${i}" data-f="ruc" value="${esc(p ? p.ruc : '')}" size="10"></td><td><input type="date" data-pr="${i}" data-f="fecha" value="${esc(p ? p.fecha : '')}"></td>
          <td><input class="n" data-pr="${i}" data-f="monto" value="${p && p.monto ? fmt(p.monto) : ''}"></td><td><input class="n" data-pr="${i}" data-f="utilizado" value="${p && p.utilizado ? fmt(p.utilizado) : ''}"></td>
          <td>${p ? `<button class="mini danger" data-prx="${i}">✕</button>` : ''}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="4">TOTAL (cas. 102)</td><td class="n">${fmt(r.k.c102)}</td><td></td></tr></tfoot></table></section>
      <section class="card"><h2>Anexo – Cuadro 2: familiares a cargo</h2>
        <div class="form cols3"><label>Tipo de familiar <select id="fa-tipo">${Object.entries(C.TIPOS_FAMILIAR).map(([k, n]) => `<option value="${k}">${k}) ${n}</option>`).join('')}</select></label>
          <label>Documento de identidad N° <input id="fa-ci"></label><label>&nbsp;<button id="fa-ok">Agregar familiar</button></label></div>
        <table class="grid"><thead><tr><th>Inc.</th><th>Tipo</th><th>Documento</th><th></th></tr></thead><tbody>
        ${r.familiares.map((f, i) => `<tr><td>${f.tipo}</td><td>${esc(C.TIPOS_FAMILIAR[f.tipo])}</td><td>${esc(f.ci)}</td><td><button class="mini danger" data-fax="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin familiares cargados</td></tr>'}
        </tbody></table>
        <p class="muted">Cantidades por tipo (cas. 147 a 154): ${Object.keys(C.TIPOS_FAMILIAR).map((k, i) => `${k}) ${r.k['c' + (147 + i)]}`).join(' · ')}</p></section>`;
    },
    bind() {
      const anio = anioIRP(), e = () => obj('irp515', anio);
      $('#i5-anio').onchange = ev => { st.anioIRP = +ev.target.value; render(); };
      $('#i5-sug').onchange = ev => { e().usarSugeridos = ev.target.checked; S.save(); render(); };
      $$('.cas-in').forEach(i => { if (e()[i.dataset.k] === undefined && C.num(i.value)) { i.classList.add('auto'); i.title = 'Valor sugerido por la contabilidad: escriba para reemplazarlo'; } i.onchange = () => { const k = i.dataset.k; if (i.value.trim() === '') delete e()[k]; else e()[k] = C.num(i.value); S.save(); render(); }; });
      A.ayudaCasillas(AY.F515 || {});
      $$('[data-pr]').forEach(i => i.onchange = () => {
        const lst = e().prestamos || (e().prestamos = []), idx = +i.dataset.pr;
        const p = lst[idx] || (lst[idx] = { tipo: 'PRESTAMO' });
        p[i.dataset.f] = ['monto', 'utilizado'].includes(i.dataset.f) ? C.num(i.value) : i.value.trim();
        e().prestamos = lst.filter(Boolean); S.save(); render();
      });
      $$('[data-prx]').forEach(b => b.onclick = () => { e().prestamos.splice(+b.dataset.prx, 1); S.save(); render(); });
      $('#fa-ok').onclick = () => { const ci = v('#fa-ci').trim(); if (!ci) return toast('Ingrese el documento', 'error'); (e().familiares || (e().familiares = [])).push({ tipo: v('#fa-tipo'), ci }); S.save(); render(); };
      $$('[data-fax]').forEach(b => b.onclick = () => { e().familiares.splice(+b.dataset.fax, 1); S.save(); render(); });
      const r = () => C.f515(datos(), anio);
      $('#i5-print').onclick = () => {
        const x = r();
        const anexo = `<table><tr class="tit"><td colspan="5">ANEXO – CUADRO 1: PRÉSTAMOS Y REMANENTE DE LOS INGRESOS GRAVADOS DE EJERCICIOS FISCALES ANTERIORES</td></tr>
          <tr class="sub"><td>I</td><td>II – RUC</td><td>III – Fecha</td><td>IV – Monto total</td><td>V – Utilizado</td></tr>
          ${x.prestamos.map(p => `<tr><td>${p.cas[0]} ${p.tipo === 'REMANENTE' ? 'Remanente' : 'Préstamo'}</td><td>${p.cas[1]} ${esc(p.ruc)}</td><td>${p.cas[2]} ${fd(p.fecha)}</td><td>${p.cas[3]} ${fmt(p.monto)}</td><td>${p.cas[4]} ${fmt(p.utilizado)}</td></tr>`).join('')}
          <tr class="tot"><td colspan="4">TOTAL (102)</td><td class="n">${fmt(x.k.c102)}</td></tr></table>
          <table><tr class="tit"><td colspan="3">ANEXO – CUADRO 2: FAMILIARES A CARGO DEL CONTRIBUYENTE</td></tr>
          ${Object.entries(C.TIPOS_FAMILIAR).map(([k, n], i) => `<tr><td class="inc">${k}</td><td>${n}: ${x.familiares.filter(f => f.tipo === k).map(f => esc(f.ci)).join(', ') || '—'}</td><td class="n">${147 + i} · ${x.k['c' + (147 + i)]}</td></tr>`).join('')}</table>`;
        A.imprimirFormulario(515, 'IRP – Servicios personales', 'Versión 1', anio, x.rubros, anexo);
      };
      $('#i5-exp').onclick = () => exportarRubros(`FORMULARIO 515 – IRP SERVICIOS PERSONALES – EJERCICIO ${anio}`, r().rubros, `form515_${anio}_${slug(cliente().razon)}.xlsx`);
    }
  }, 'f500');

  /* ======================= FORM. 516 – IRP RGC ======================= */
  A.registrar('f516', 'IRP – Rentas del capital (Form. 516)', 'Impuestos', {
    html() {
      const anio = anioIRP(), r = C.f516(datos(), anio), e = (datos().irp516 || {})[anio] || {};
      const fila = x => `<tr><td>${esc(x.nombre)} <small class="muted">(${x.n} op.)</small></td><td class="n">${fmt(x.I)}</td><td class="n">${fmt(x.II)}</td><td class="n">${x.real === null ? '' : fmt(x.real)}</td><td class="n">${x.presunta === null ? '' : fmt(x.presunta)}</td><td class="n"><b>${fmt(x.imponible)}</b></td></tr>`;
      const tablaR = (tit, filas, cas, total, sinPres) => `<table class="grid f120"><thead><tr class="titulo"><td colspan="6">${tit}</td></tr><tr><th>Inciso (agrupado por el sistema)</th><th>I – Ventas / ingresos</th><th>II – Costo y gastos</th><th>${sinPres ? 'III – Renta neta' : 'III – Renta real'}</th><th>${sinPres ? '' : 'IV – Renta presunta (30%)'}</th><th>V – Renta neta imponible</th></tr></thead>
        <tbody>${filas.map(fila).join('') || '<tr><td colspan="6" class="muted">Sin operaciones</td></tr>'}<tr class="total"><td colspan="5">TOTAL DEL RUBRO</td><td class="n"><span class="cas-tag" data-cas="${cas}">${cas}</span> ${fmt(total)}</td></tr></tbody></table>`;
      const tipoOpts = rb => C.TIPOS_516[rb].map(t => `<option>${t}</option>`).join('');
      return `<section class="card"><h2>Formulario 516 – IRP Rentas y ganancias del capital (versión 2)</h2>
        <div class="acciones"><label>Ejercicio fiscal <input type="number" id="i6-anio" value="${anio}" style="width:6em"></label> <button id="i6-print" class="primary">Imprimir proforma</button> <button id="i6-exp">Exportar a Excel</button></div>
        ${alertasHTML(r.alertas)}
        <h3>Agregar operación</h3>
        <div class="form cols4"><label>Rubro <select id="op-rub"><option value="1">1 – Enajenación de bienes, acciones, cuotas, derechos</option><option value="2">2 – Arrendamiento de inmuebles</option><option value="3">3 – Rescate de acciones o cuotas partes</option></select></label>
          <label>Tipo <select id="op-tipo">${tipoOpts(1)}</select></label><label>Descripción <input id="op-des" placeholder="Ej.: venta camioneta, alquiler depto. centro"></label><label>Fecha <input type="date" id="op-fecha"></label>
          <label>Col. I – Precio de venta / alquileres / rescate (sin IVA) <input id="op-i" class="n"></label><label>Col. II – Precio de compra + gastos / costo deducido / costo integrado <input id="op-ii" class="n"></label>
          <label>&nbsp;<button id="op-ok" class="primary">Agregar operación</button></label></div>
        <table class="grid"><thead><tr><th>Rubro</th><th>Tipo</th><th>Descripción</th><th>I</th><th>II</th><th>Inciso</th><th>Imponible</th><th></th></tr></thead><tbody>
        ${r.operaciones.map((o, i) => `<tr><td class="c">${o.rubro}</td><td>${esc(o.tipo)}</td><td>${esc(o.descripcion || '')} ${o.fecha ? `<small class="muted">${fd(o.fecha)}</small>` : ''}</td><td class="n">${fmt(o.I)}</td><td class="n">${fmt(o.II)}</td><td class="c">${o.grupo}</td><td class="n">${fmt(o.imponible)}</td><td><button class="mini danger" data-opx="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin operaciones cargadas</td></tr>'}
        </tbody></table>
        ${ayudaBox}
        ${tablaR('RUBRO 1 – ENAJENACIÓN DE BIENES MUEBLES, INMUEBLES A PLAZO, ACCIONES, CUOTAS DE CAPITAL, CESIÓN DE DERECHOS Y SIMILARES', r.r1, 76, r.k.c76)}
        ${tablaR('RUBRO 2 – ARRENDAMIENTO Y SUBARRENDAMIENTO DE INMUEBLES', r.r2, 107, r.k.c107)}
        ${tablaR('RUBRO 3 – RESCATE TOTAL O PARCIAL DE ACCIONES O CUOTAS PARTES NO ALCANZADO POR EL IDU', r.r3, 120, r.k.c120, true)}
        ${A.tablaFormulario(C.estructura516(r.k, r.regalias), { 122: 'regalias', 124: 'incorporacion', 126: 'indemnizaciones', 127: 'otros', 131: 'multa' })}
        <div class="resultado ${r.k.c132 ? 'pagar' : 'favor'}">IRP rentas del capital a ingresar (cas. 132): <b>Gs. ${fmt(r.k.c132)}</b></div>
      </section>`;
    },
    bind() {
      const anio = anioIRP(), e = () => obj('irp516', anio);
      $('#i6-anio').onchange = ev => { st.anioIRP = +ev.target.value; render(); };
      $('#op-rub').onchange = () => { $('#op-tipo').innerHTML = C.TIPOS_516[v('#op-rub')].map(t => `<option>${t}</option>`).join(''); };
      $('#op-ok').onclick = () => {
        const o = { rubro: +v('#op-rub'), tipo: v('#op-tipo'), descripcion: v('#op-des').trim(), fecha: v('#op-fecha'), ingreso: C.r0(C.num(v('#op-i'))), costo: C.r0(C.num(v('#op-ii'))) };
        if (!o.ingreso) return toast('Ingrese el importe de la columna I', 'error');
        (e().operaciones || (e().operaciones = [])).push(o); S.save(); render();
      };
      $$('[data-opx]').forEach(b => b.onclick = () => { e().operaciones.splice(+b.dataset.opx, 1); S.save(); render(); });
      $$('.cas-in').forEach(i => i.onchange = () => { const k = i.dataset.k; if (i.value.trim() === '') delete e()[k]; else e()[k] = C.num(i.value); S.save(); render(); });
      $$('.cas-tag').forEach(t => { t.classList.add('cas'); });
      A.ayudaCasillas(AY.F516 || {});
      $$('.cas-tag[data-cas]').forEach(t => { const a = (AY.F516 || {})[t.dataset.cas]; if (a) t.title = a[0]; });
      const rub = () => { const x = C.f516(datos(), anio); return [
        { titulo: 'RUBRO 1 – ENAJENACIÓN DE BIENES MUEBLES, INMUEBLES A PLAZO, ACCIONES, CUOTAS DE CAPITAL, CESIÓN DE DERECHOS Y SIMILARES', cols: ['Total renta neta imponible'], filas: x.r1.map(f => ['', `${f.nombre} – I: ${fmt(f.I)} · II: ${fmt(f.II)}`, [null]]).concat([['', 'TOTAL RUBRO 1', [[76, x.k.c76]], 1]]) },
        { titulo: 'RUBRO 2 – ARRENDAMIENTO Y SUBARRENDAMIENTO DE INMUEBLES', cols: ['Total renta neta imponible'], filas: x.r2.map(f => ['', `${f.nombre} – I: ${fmt(f.I)} · II: ${fmt(f.II)}`, [null]]).concat([['', 'TOTAL RUBRO 2', [[107, x.k.c107]], 1]]) },
        { titulo: 'RUBRO 3 – RESCATE TOTAL O PARCIAL DE ACCIONES O CUOTAS PARTES', cols: ['Total renta neta imponible'], filas: x.r3.map(f => ['', `${f.nombre} – I: ${fmt(f.I)} · II: ${fmt(f.II)}`, [null]]).concat([['', 'TOTAL RUBRO 3', [[120, x.k.c120]], 1]]) }
      ].concat(C.estructura516(x.k, x.regalias)); };
      $('#i6-print').onclick = () => A.imprimirFormulario(516, 'IRP – Rentas y ganancias del capital', 'Versión 2', anio, rub());
      $('#i6-exp').onclick = () => exportarRubros(`FORMULARIO 516 – IRP RENTAS Y GANANCIAS DEL CAPITAL – EJERCICIO ${anio}`, rub(), `form516_${anio}_${slug(cliente().razon)}.xlsx`);
    }
  }, 'f515');
  C.estructura516 = function (k, regalias) {
    const c = n => [n, k['c' + n]];
    return [
      { titulo: 'RUBRO 4 – OTRAS RENTAS Y GANANCIAS DEL CAPITAL QUE NO FUERON OBJETO DE RETENCIÓN', cols: ['Importe'], filas: [
        ['a', `Regalías con aprovechamiento parcial en el país y en el exterior: 70% del monto percibido${regalias ? ` (percibido: ${regalias.toLocaleString('es-PY')})` : ''}`, [c(122)]],
        ['b', 'Incorporación de dinero sin contraprestación', [c(124)]],
        ['c', 'Indemnizaciones en dinero de contratos de seguro de vida, prestaciones vitalicias y temporarias', [c(126)]],
        ['d', 'Otros conceptos no señalados, incluido cualquiera sobre el que no se practicó la retención del IRP', [c(127)]],
        ['e', 'TOTAL (122 + 124 + 126 + 127)', [c(128)], 1]] },
      { titulo: 'RUBRO 5 – DETERMINACIÓN DEL IMPUESTO Y LIQUIDACIÓN FINAL', cols: ['Importe'], filas: [
        ['a', 'Total de renta neta imponible del ejercicio fiscal (76 + 107 + 120 + 128)', [c(129)], 1],
        ['b', 'Impuesto: tasa del 8% sobre la casilla 129', [c(130)]],
        ['c', 'Multa por presentar la declaración jurada con posterioridad al vencimiento', [c(131)]],
        ['d', 'TOTAL (130 + 131)', [c(132)], 1]] }
    ];
  };
  function exportarRubros(titulo, rubros, archivo) {
    const aoa = X.encabezado(cliente(), titulo, 'Proforma de control').concat([['Inc.', 'Concepto', 'Cas.', 'Columna I', 'Cas.', 'Columna II']]);
    rubros.forEach(r => { aoa.push([], [r.titulo]); r.filas.forEach(([inc, txt, cel]) => aoa.push([inc, txt].concat(...cel.map(x => x ? [x[0], x[1]] : ['', ''])))); });
    const ws = X.hoja(aoa, { anchos: [5, 90, 6, 16, 6, 16] });
    Object.keys(ws).forEach(ref => { if (ref[0] !== '!' && 'CE'.includes(ref.replace(/\d+/g, '')) && ws[ref].t === 'n') ws[ref].z = '0'; });
    X.descargar([{ nombre: titulo.slice(0, 28), ws }], archivo);
  }

  /* ======================= IDU ======================= */
  A.registrar('idu', 'IDU – Dividendos y utilidades', 'Impuestos', {
    html() {
      const c = cfg(), liq = C.liquidacionIDU(datos(), st.periodo);
      const delMes = (datos().dividendos || []).filter(x => x.fecha && x.fecha.slice(0, 7) === st.periodo);
      return `<section class="card"><h2>IDU – Distribución de dividendos y utilidades</h2>
        <div class="form cols4"><label>Fecha <input type="date" id="dv-fecha" value="${hoy().slice(0, 7) === st.periodo ? hoy() : C.finDeMes(st.periodo)}"></label><label>Socio / accionista <input id="dv-socio"></label><label>C.I. / RUC <input id="dv-ci"></label>
          <label>Residencia <select id="dv-res"><option value="S">Residente (${c.pctIDUResidente}%)</option><option value="N">No residente (${c.pctIDUNoResidente}%)</option></select></label><label>Monto distribuido <input id="dv-monto" class="n"></label></div>
        <div class="acciones"><button id="dv-ok" class="primary">Registrar distribución</button> <button id="dv-exp">Exportar liquidación del mes</button></div>
        <table class="grid"><thead><tr><th>Fecha</th><th>Socio</th><th>C.I./RUC</th><th>Residente</th><th>Monto</th><th>Tasa</th><th>IDU</th><th></th></tr></thead><tbody>
        ${liq.filas.map((f, i) => `<tr><td>${fd(f.fecha)}</td><td>${esc(f.socio)}</td><td>${esc(f.ci)}</td><td>${f.residente ? 'Sí' : 'No'}</td><td class="n">${fmt(f.monto)}</td><td class="n">${f.tasa}%</td><td class="n">${fmt(f.idu)}</td><td><button class="mini danger" data-dvr="${delMes[i].id}">✕</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin distribuciones en el período</td></tr>'}
        </tbody><tfoot><tr><td colspan="4">TOTAL IDU A INGRESAR</td><td class="n">${fmt(liq.base)}</td><td></td><td class="n">${fmt(liq.total)}</td><td></td></tr></tfoot></table></section>`;
    },
    bind() {
      const d = datos();
      $('#dv-ok').onclick = () => {
        const dv = { fecha: v('#dv-fecha'), socio: v('#dv-socio').trim(), ci: v('#dv-ci').trim(), residente: v('#dv-res') === 'S', monto: C.r0(C.num(v('#dv-monto'))) };
        if (!dv.fecha || !dv.monto || !dv.socio) return toast('Complete fecha, socio y monto', 'error');
        if (bloqueado(dv.fecha)) return;
        dv.id = S.uid(); (d.dividendos || (d.dividendos = [])).push(dv); st.periodo = dv.fecha.slice(0, 7); S.save(); toast('Distribución registrada'); render();
      };
      $$('[data-dvr]').forEach(b => b.onclick = () => { const x = d.dividendos.find(y => y.id === b.dataset.dvr); if (!x || bloqueado(x.fecha)) return; if (confirm('¿Eliminar la distribución?')) { d.dividendos = d.dividendos.filter(y => y.id !== x.id); S.save(); render(); } });
      $('#dv-exp').onclick = () => {
        const l = C.liquidacionIDU(d, st.periodo);
        X.descargar([{ nombre: 'IDU', ws: X.hoja(X.encabezado(cliente(), 'LIQUIDACIÓN IDU – DIVIDENDOS Y UTILIDADES', `Período ${st.periodo}`).concat([['Fecha', 'Socio', 'C.I./RUC', 'Residente', 'Monto', 'Tasa %', 'IDU']],
          l.filas.map(f => [fd(f.fecha), f.socio, f.ci, f.residente ? 'S' : 'N', f.monto, f.tasa, f.idu]), [['TOTAL', '', '', '', l.base, '', l.total]]), { anchos: [11, 30, 14, 10, 15, 8, 14] }) }], `IDU_${st.periodo}_${slug(cliente().razon)}.xlsx`);
      };
    }
  }, 'f516');

  // La pantalla combinada anterior "IRP e IDU" se reemplaza por Form. 515, Form. 516 e IDU.
  const ix = A.TABS.findIndex(t => t[0] === 'irpidu'); if (ix >= 0) A.TABS.splice(ix, 1);
})();
