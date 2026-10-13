/* Pantallas: inventario, cierre de ejercicio y saldos iniciales, libros rubricados, IRE según régimen. */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, X, $, $$, esc, fmt, fmt2, fd, hoy, MESES, st, toast, datos, cfg, nombreCta, ctaValida, pedirArchivo, slug, cliente, render, bloqueado } = A;
  const arr = k => { const d = datos(); return d[k] || (d[k] = []); };
  const obj = k => { const d = datos(); return d[k] || (d[k] = {}); };
  const v = id => ($(id) ? $(id).value : '');
  const num = id => C.num(v(id));
  const setCfg = cambios => { const d = datos(); d.config = Object.assign({}, d.config, cambios); S.save(); };
  const perSel = () => `<label>Período <input type="month" id="per" value="${st.periodo}"></label>`;
  const bindPer = () => { if ($('#per')) $('#per').onchange = e => { if (e.target.value) { st.periodo = e.target.value; render(); } }; };
  const fmtQ = n => (Math.round(n * 1000) / 1000).toLocaleString('es-PY');
  const ejercicioDe = anio => C.rangoEjercicio(anio, cliente().cierreMes);
  const anioActual = () => st.anioCierre || (+hoy().slice(0, 4) - 1);

  /* ---------- Importación: ítems de XML → inventario ---------- */
  // Al importar comprobantes con ítems (XML SIFEN), se crean los productos y movimientos.
  A.alImportarDoc = function (doc, esCompra) {
    if (!doc.items || !doc.items.length) return;
    const c = cfg();
    const prods = arr('productos');
    doc.items.forEach(i => { if (!prods.some(p => p.codigo === i.codigo)) prods.push({ id: S.uid(), codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cuenta: c.ctaMercaderias }); });
    C.movimientosDesdeDoc(doc, esCompra).forEach(m => { m.id = S.uid(); arr('movInventario').push(m); });
    if (esCompra && !doc.cuenta) doc.cuenta = c.inventarioMetodo === 'PERMANENTE' ? c.ctaMercaderias : c.ctaCompras;
  };

  /* =================== INVENTARIO =================== */
  A.registrar('inventario', 'Inventario y costo de ventas', 'Carga', {
    html() {
      const c = cfg(), d = datos();
      const prods = arr('productos'), movs = arr('movInventario').filter(m => m.fecha && m.fecha.slice(0, 7) === st.periodo).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const corte = C.finDeMes(st.periodo), val = C.valuacionInventario(d, corte);
      const kcod = st.kardexCod || (prods[0] || {}).codigo;
      const k = kcod ? C.kardex(d, kcod) : null;
      const conteos = arr('conteos').slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
      return `<section class="card"><h2>Inventario y costo de ventas</h2>
        <div class="form cols3">
          <label>Método <select id="in-met"><option value="PERIODICO">Periódico (recuentos: CMV = inv. inicial + compras − inv. final)</option><option value="PERMANENTE" ${c.inventarioMetodo === 'PERMANENTE' ? 'selected' : ''}>Permanente (kardex con costo promedio)</option></select></label>
          <label>Cuenta mercaderías <input id="in-merc" list="dl-cuentas" value="${esc(c.ctaMercaderias)}"></label>
          <label>Cuenta costo de ventas <input id="in-cmv" list="dl-cuentas" value="${esc(c.ctaCMV)}"></label></div>
        <p class="muted">${c.inventarioMetodo === 'PERMANENTE'
          ? 'Permanente: cargue las compras de mercadería con la cuenta Mercaderías. Cada salida del kardex genera el costo de ventas al costo promedio ponderado (asiento mensual); los ajustes van a "Diferencias de inventario".'
          : 'Periódico: cargue las compras con la cuenta Compras de mercaderías. En cada recuento (mensual o al cierre) el sistema pasa las compras a Mercaderías y lleva la diferencia con el recuento a Costo de ventas.'}
          Los XML de facturas electrónicas con ítems cargan solos los productos y movimientos.</p>
      </section>
      <section class="card"><h2>Productos (${prods.length})</h2>
        <div class="form cols4"><label>Código <input id="pr-cod"></label><label>Descripción <input id="pr-des"></label><label>Unidad <input id="pr-uni" placeholder="UNI, KG, LT"></label><label>Cuenta <input id="pr-cta" list="dl-cuentas" value="${esc(c.ctaMercaderias)}"></label></div>
        <div class="acciones"><button id="pr-ok">Agregar producto</button> <button id="pr-imp">Importar productos (Excel)</button></div>
      </section>
      <section class="card"><h2>Movimientos</h2>
        <datalist id="dl-prod">${prods.map(p => `<option value="${esc(p.codigo)}">${esc(p.descripcion)}</option>`).join('')}</datalist>
        <div class="form cols4">
          <label>Fecha <input type="date" id="mv-fecha" value="${st.periodo === hoy().slice(0, 7) ? hoy() : C.finDeMes(st.periodo)}"></label>
          <label>Tipo <select id="mv-tipo">${Object.entries(C.TIPOS_MOV).map(([kk, n]) => `<option value="${kk}">${n}</option>`).join('')}</select></label>
          <label>Producto <input id="mv-cod" list="dl-prod"></label><label>Cantidad <input id="mv-cant" class="n" inputmode="decimal"></label>
          <label>Costo unitario sin IVA (entradas) <input id="mv-costo" class="n" inputmode="decimal"></label><label>Referencia <input id="mv-ref" placeholder="Factura, remisión…"></label></div>
        <div class="acciones"><button id="mv-ok" class="primary">Registrar movimiento</button> ${perSel()} <button id="mv-imp">Importar movimientos (Excel)</button></div>
        <table class="grid"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Costo unit.</th><th>Referencia</th><th></th></tr></thead><tbody>
        ${movs.map(m => `<tr><td>${fd(m.fecha)}</td><td>${C.TIPOS_MOV[m.tipo]}</td><td>${esc(m.codigo)} ${esc((prods.find(p => p.codigo === m.codigo) || {}).descripcion || '')}</td><td class="n">${fmtQ(m.cantidad)}</td><td class="n">${m.costoUnit ? fmt2(m.costoUnit) : ''}</td><td>${esc(m.ref || '')}</td><td><button class="mini danger" data-mvr="${m.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sin movimientos en el período</td></tr>'}
        </tbody></table></section>
      <section class="card"><h2>Kardex (costo promedio ponderado)</h2>
        <div class="acciones"><label>Producto <select id="kx-cod">${prods.map(p => `<option value="${esc(p.codigo)}" ${p.codigo === kcod ? 'selected' : ''}>${esc(p.codigo)} – ${esc(p.descripcion)}</option>`).join('')}</select></label> <button id="kx-exp">Exportar kardex</button></div>
        ${k ? `${k.negativo ? '<div class="alerta">El stock quedó negativo en algún momento: revise entradas faltantes.</div>' : ''}<div class="scroll"><table class="grid"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Referencia</th><th>Entrada</th><th>Salida</th><th>Costo unit.</th><th>Importe</th><th>Saldo cant.</th><th>Costo prom.</th><th>Saldo valor</th></tr></thead><tbody>
          ${k.filas.map(f => `<tr><td>${fd(f.fecha)}</td><td>${C.TIPOS_MOV[f.tipo]}</td><td>${esc(f.ref || '')}</td><td class="n">${f.entra ? fmtQ(f.cantidad) : ''}</td><td class="n">${f.entra ? '' : fmtQ(f.cantidad)}</td><td class="n">${fmt2(f.costoUnit)}</td><td class="n">${fmt(f.importe)}</td><td class="n">${fmtQ(f.saldoCant)}</td><td class="n">${fmt2(f.ppp)}</td><td class="n">${fmt(f.saldoValor)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">Agregue productos.</p>'}</section>
      <section class="card"><h2>Inventario valorizado al ${fd(corte)}</h2>
        <div class="acciones"><button id="vl-exp">Exportar inventario valorizado</button></div>
        <table class="grid"><thead><tr><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Costo promedio</th><th>Valor</th></tr></thead><tbody>
        ${val.filas.map(f => `<tr><td>${esc(f.codigo)}</td><td>${esc(f.descripcion)}</td><td class="n">${fmtQ(f.cantidad)} ${esc(f.unidad || '')}</td><td class="n">${fmt2(f.ppp)}</td><td class="n">${fmt(f.valor)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin existencias</td></tr>'}
        </tbody><tfoot><tr><td colspan="4">TOTAL</td><td class="n">${fmt(val.total)}</td></tr></tfoot></table></section>
      ${c.inventarioMetodo !== 'PERMANENTE' ? `<section class="card"><h2>Recuentos de inventario (método periódico)</h2>
        <div class="form cols3"><label>Fecha del recuento <input type="date" id="ct-fecha" value="${corte}"></label><label>Valor del inventario (vacío = valuación del kardex: ${fmt(val.total)}) <input id="ct-monto" class="n"></label><label>&nbsp;<button id="ct-ok" class="primary">Registrar recuento</button></label></div>
        <table class="grid"><thead><tr><th>Fecha</th><th>Valor</th><th>Origen</th><th></th></tr></thead><tbody>
        ${conteos.map(x => `<tr><td>${fd(x.fecha)}</td><td class="n">${fmt(x.monto !== undefined && x.monto !== '' ? x.monto : C.valuacionInventario(d, x.fecha).total)}</td><td>${x.monto !== undefined && x.monto !== '' ? 'Manual' : 'Kardex'}</td><td><button class="mini danger" data-ctr="${x.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin recuentos. Registre al menos el inventario final de cada ejercicio.</td></tr>'}
        </tbody></table></section>` : ''}`;
    },
    bind() {
      bindPer();
      const d = datos();
      $('#in-met').onchange = e => { setCfg({ inventarioMetodo: e.target.value }); render(); };
      $('#in-merc').onchange = e => { if (ctaValida(e.target.value.trim())) setCfg({ ctaMercaderias: e.target.value.trim() }); };
      $('#in-cmv').onchange = e => { if (ctaValida(e.target.value.trim())) setCfg({ ctaCMV: e.target.value.trim() }); };
      $('#pr-ok').onclick = () => {
        const p = { id: S.uid(), codigo: v('#pr-cod').trim(), descripcion: v('#pr-des').trim(), unidad: v('#pr-uni').trim(), cuenta: v('#pr-cta').trim() };
        if (!p.codigo || !p.descripcion) return toast('Ingrese código y descripción', 'error');
        if (arr('productos').some(x => x.codigo === p.codigo)) return toast('Ese código ya existe', 'error');
        arr('productos').push(p); st.kardexCod = p.codigo; S.save(); render();
      };
      $('#pr-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        const filas = X.filas(await X.leerArchivo(f)); let n = 0;
        filas.forEach((r, i) => { const cod = String(r[0] || '').trim(); if (!cod || (i === 0 && /c[oó]d/i.test(cod)) || arr('productos').some(x => x.codigo === cod)) return;
          arr('productos').push({ id: S.uid(), codigo: cod, descripcion: String(r[1] || '').trim(), unidad: String(r[2] || '').trim(), cuenta: String(r[3] || '').trim() || cfg().ctaMercaderias }); n++; });
        S.save(); render(); toast(`${n} productos importados`);
      });
      $('#mv-ok').onclick = () => {
        const m = { id: S.uid(), fecha: v('#mv-fecha'), tipo: v('#mv-tipo'), codigo: v('#mv-cod').trim(), cantidad: num('#mv-cant'), costoUnit: num('#mv-costo') || undefined, ref: v('#mv-ref').trim() };
        if (!m.fecha || !m.codigo || !m.cantidad) return toast('Complete fecha, producto y cantidad', 'error');
        if (!arr('productos').some(p => p.codigo === m.codigo)) return toast('El producto no existe: agréguelo primero', 'error');
        if (['INICIAL', 'ENTRADA'].includes(m.tipo) && !m.costoUnit) return toast('Las entradas necesitan costo unitario', 'error');
        if (bloqueado(m.fecha)) return;
        arr('movInventario').push(m); st.kardexCod = m.codigo; S.save(); toast('Movimiento registrado'); render();
      };
      $$('[data-mvr]').forEach(b => b.onclick = () => { const m = arr('movInventario').find(x => x.id === b.dataset.mvr); if (bloqueado(m.fecha)) return; d.movInventario = arr('movInventario').filter(x => x.id !== m.id); S.save(); render(); });
      $('#mv-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        // Fecha | Tipo | Código | Cantidad | Costo unitario | Referencia
        const filas = X.filas(await X.leerArchivo(f)); let n = 0; const err = [];
        const tipo = t => { const s = String(t || '').toLowerCase(); return /inic/.test(s) ? 'INICIAL' : /dev.*cli|dev.*vent/.test(s) ? 'DEV_VENTA' : /dev/.test(s) ? 'DEV_COMPRA' : /sobr|\+/.test(s) ? 'AJUSTE_POS' : /falt|aj|-/.test(s) ? 'AJUSTE_NEG' : /sal|vent/.test(s) ? 'SALIDA' : 'ENTRADA'; };
        filas.forEach((r, i) => { const fecha = C.parseFecha(r[0]); if (!fecha) return; const cod = String(r[2] || '').trim();
          if (!arr('productos').some(p => p.codigo === cod)) { err.push(`Fila ${i + 1}: producto ${cod} inexistente`); return; }
          arr('movInventario').push({ id: S.uid(), fecha, tipo: tipo(r[1]), codigo: cod, cantidad: C.num(r[3]), costoUnit: C.num(r[4]) || undefined, ref: String(r[5] || '').trim() }); n++; });
        S.save(); render(); toast(`${n} movimientos importados${err.length ? `; ${err.length} rechazados: ${err.slice(0, 3).join('; ')}` : ''}`, err.length ? 'error' : '');
      });
      if ($('#kx-cod')) $('#kx-cod').onchange = e => { st.kardexCod = e.target.value; render(); };
      $('#kx-exp').onclick = () => {
        const cod = st.kardexCod || (arr('productos')[0] || {}).codigo; if (!cod) return;
        const p = arr('productos').find(x => x.codigo === cod), k = C.kardex(d, cod);
        X.descargar([{ nombre: 'Kardex', ws: X.hoja(X.encabezado(cliente(), `KARDEX – ${cod} ${p.descripcion}`, 'Método: costo promedio ponderado').concat([['Fecha', 'Movimiento', 'Referencia', 'Entrada', 'Salida', 'Costo unit.', 'Importe', 'Saldo cant.', 'Costo prom.', 'Saldo valor']],
          k.filas.map(f => [fd(f.fecha), C.TIPOS_MOV[f.tipo], f.ref || '', f.entra ? f.cantidad : '', f.entra ? '' : f.cantidad, C.r2(f.costoUnit), f.importe, f.saldoCant, C.r2(f.ppp), f.saldoValor])), { anchos: [11, 22, 25, 10, 10, 12, 14, 11, 12, 14] }) }], `kardex_${slug(cod)}_${slug(cliente().razon)}.xlsx`);
      };
      $('#vl-exp').onclick = () => {
        const corte = C.finDeMes(st.periodo), val = C.valuacionInventario(d, corte);
        X.descargar([{ nombre: 'Inventario', ws: X.hoja(X.encabezado(cliente(), 'INVENTARIO VALORIZADO (costo promedio ponderado)', `Al ${fd(corte)}`).concat([['Código', 'Descripción', 'Unidad', 'Cantidad', 'Costo promedio', 'Valor']],
          val.filas.map(f => [f.codigo, f.descripcion, f.unidad || '', f.cantidad, C.r2(f.ppp), f.valor]), [['', 'TOTAL', '', '', '', val.total]]), { anchos: [12, 40, 8, 12, 14, 16] }) }], `inventario_${corte}_${slug(cliente().razon)}.xlsx`);
      };
      if ($('#ct-ok')) $('#ct-ok').onclick = () => {
        const x = { id: S.uid(), fecha: v('#ct-fecha') }; if (v('#ct-monto').trim() !== '') x.monto = C.r0(num('#ct-monto'));
        if (!x.fecha) return toast('Indique la fecha', 'error');
        if (bloqueado(x.fecha)) return;
        arr('conteos').push(x); S.save(); toast('Recuento registrado: se generó el asiento de costo de ventas'); render();
      };
      $$('[data-ctr]').forEach(b => b.onclick = () => { const x = arr('conteos').find(y => y.id === b.dataset.ctr); if (bloqueado(x.fecha)) return; d.conteos = arr('conteos').filter(y => y.id !== x.id); S.save(); render(); });
    }
  }, 'bienes');

  /* =================== CIERRE DE EJERCICIO Y SALDOS INICIALES =================== */
  A.registrar('cierreej', 'Cierre de ejercicio', 'Control', {
    html() {
      const anio = anioActual(), r = ejercicioDe(anio), c = cfg(), d = datos();
      const flags = (d.cierresEjercicio || {})[anio] || {};
      const asientos = C.todosLosAsientos(d).filter(a => a.origen === 'cierre' && String(a.ref) === String(anio));
      const imp = id => { const a = asientos.find(x => x.id === id + anio); return a ? a.lineas.reduce((s, l) => s + l.debe, 0) : 0; };
      const fila = (k, t, det, id) => `<tr><td class="c"><input type="checkbox" data-cj="${k}" ${flags[k] ? 'checked' : ''}></td><td><b>${t}</b><br><small class="muted">${det}</small></td><td class="n">${flags[k] ? fmt(imp(id)) : '—'}</td></tr>`;
      const liqIVA = c.liquidarIVA !== false && c.liquidarIVA !== 'N';
      return `<section class="card"><h2>Asientos de cierre del ejercicio</h2>
        <div class="acciones"><label>Ejercicio que cierra en <input type="number" id="cj-anio" value="${anio}" style="width:6em"></label> <span class="muted">Del ${fd(r.desde)} al ${fd(r.hasta)} · Régimen IRE: <b>${C.regimenIRE(d)}</b></span></div>
        <p class="muted">Marque los ajustes a generar. Se recalculan solos si cambian los datos (no hace falta volver a generarlos). Fecha: ${fd(r.hasta)}; la reserva legal se registra el ${fd(C.addDias(r.hasta, 1))} contra resultados acumulados.</p>
        <table class="grid"><thead><tr><th></th><th>Ajuste</th><th>Importe</th></tr></thead><tbody>
          ${fila('prevision', 'Previsión para incobrables', `Saldos de clientes vencidos hace más de ${c.previsionDias} días, al ${c.previsionPct}% (se ajusta contra la previsión existente)`, 'Z1')}
          ${fila('vacaciones', 'Provisión de vacaciones', 'Por empleado según antigüedad (12, 18 o 30 días), proporcional a los meses trabajados en el ejercicio', 'Z2')}
          ${fila('ire', 'Impuesto a la renta del ejercicio', `Régimen ${C.regimenIRE(d)}: gasto contra IRE a pagar, compensando anticipos y retenciones de IRE`, 'Z3')}
          ${fila('reservaLegal', 'Reserva legal', `${c.pctReservaLegal}% de la utilidad neta hasta llegar al ${c.topeReservaLegalPct}% del capital integrado`, 'Z4')}
        </tbody></table>
        <div class="acciones"><button id="cj-todo" class="primary">Marcar todos</button> <button id="cj-nada">Quitar todos</button></div>
        <h3>Liquidación mensual de IVA</h3>
        <p><label class="chk"><input type="checkbox" id="cj-iva" ${liqIVA ? 'checked' : ''}> Generar cada mes el asiento de liquidación de IVA</label>
          <small class="muted">Cierra IVA débito, crédito y retenciones contra "IVA a pagar" o "IVA saldo a favor" (que se compensa solo en los meses siguientes). El pago se registra en Cobros y pagos con contrapartida IVA a pagar.</small></p>
        <h3>Asientos de apertura y cierre</h3>
        <p class="muted">No hace falta cargarlos: los saldos pasan solos de un ejercicio al otro. El Libro Diario (pestaña Libros rubricados) los muestra como asientos de apertura, refundición y cierre.</p>
      </section>
      <section class="card"><h2>Saldos iniciales (clientes que vienen de otro sistema)</h2>
        <p class="muted">Excel con columnas <b>Código | Cuenta | Debe | Haber</b> (o <b>Código | Cuenta | Saldo</b>, positivo deudor y negativo acreedor). Se crea un asiento de saldos iniciales; si no balancea, la diferencia puede ir a la cuenta indicada.</p>
        <div class="form cols4"><label>Fecha <input type="date" id="si-fecha" value="${r.desde}"></label><label>Diferencia a la cuenta (opcional) <input id="si-dif" list="dl-cuentas" value="${esc(c.ctaResultadosAcum)}"></label>
          <label>&nbsp;<button id="si-imp" class="primary">Importar saldos iniciales</button></label><label>&nbsp;<button id="si-plant">Descargar plantilla</button></label></div>
        <div id="si-res"></div></section>`;
    },
    bind() {
      const d = datos(), anio = anioActual();
      $('#cj-anio').onchange = e => { st.anioCierre = +e.target.value; render(); };
      const setFlags = f => { const ce = obj('cierresEjercicio'); ce[anio] = Object.assign({}, ce[anio], f); S.save(); render(); };
      $$('[data-cj]').forEach(i => i.onchange = () => { if (bloqueado(ejercicioDe(anio).hasta)) return render(); setFlags({ [i.dataset.cj]: i.checked }); });
      $('#cj-todo').onclick = () => { if (!bloqueado(ejercicioDe(anio).hasta)) setFlags({ prevision: true, vacaciones: true, ire: true, reservaLegal: true }); };
      $('#cj-nada').onclick = () => { if (!bloqueado(ejercicioDe(anio).hasta)) setFlags({ prevision: false, vacaciones: false, ire: false, reservaLegal: false }); };
      $('#cj-iva').onchange = e => { setCfg({ liquidarIVA: e.target.checked }); render(); };
      $('#si-plant').onclick = () => X.descargar([{ nombre: 'Saldos iniciales', ws: X.hoja([['Código', 'Cuenta', 'Debe', 'Haber']].concat(A.plan.list.filter(c => c.imputable && ['A', 'P', 'PN'].includes(c.tipo)).map(c => [c.codigo, c.nombre, '', ''])), { anchos: [14, 45, 16, 16] }) }], 'plantilla_saldos_iniciales.xlsx');
      $('#si-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        const filas = X.filas(await X.leerArchivo(f));
        const h = filas.findIndex(r => r.some(x => /c[oó]digo/i.test(String(x))));
        const head = (filas[h] || []).map(x => String(x).toLowerCase());
        const col = re => head.findIndex(x => re.test(x));
        const cC = Math.max(0, col(/c[oó]digo/)), cD = col(/debe|deudor/), cH = col(/haber|acreedor/), cS = col(/saldo/);
        const datosF = filas.slice(h + 1).map(r => ({ codigo: r[cC], debe: cD >= 0 ? r[cD] : '', haber: cH >= 0 ? r[cH] : '', saldo: cS >= 0 ? r[cS] : undefined }));
        const fecha = v('#si-fecha');
        if (bloqueado(fecha)) return;
        const res = C.asientoSaldosIniciales(datosF, A.plan, fecha, v('#si-dif').trim() || null);
        if (res.errores.length) { $('#si-res').innerHTML = `<div class="alerta">No se importó. Corrija:<ul>${res.errores.slice(0, 20).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`; return; }
        if (res.diferencia && !v('#si-dif').trim()) { $('#si-res').innerHTML = `<div class="alerta">Los saldos no balancean (diferencia ${fmt(res.diferencia)}). Indique una cuenta para la diferencia.</div>`; return; }
        if (res.diferencia && !confirm(`Los saldos no balancean por ${fmt(res.diferencia)}. ¿Registrar la diferencia en ${v('#si-dif')}?`)) return;
        res.asiento.id = S.uid(); arr('asientos').push(res.asiento); S.save();
        $('#si-res').innerHTML = `<div class="okbox">Asiento de saldos iniciales registrado con ${res.asiento.lineas.length} cuentas al ${fd(fecha)}.</div>`;
      });
    }
  }, 'cierre');

  /* =================== LIBROS RUBRICADOS (impresión foliada) =================== */
  const CSS_LIBRO = `body{font:11px/1.35 Arial,sans-serif;color:#000;margin:0}.pag{page-break-after:always;padding:10mm 12mm;min-height:270mm;box-sizing:border-box;position:relative}
    .pag:last-child{page-break-after:auto}.enc{display:flex;justify-content:space-between;border-bottom:1.5px solid #000;padding-bottom:4px;margin-bottom:6px}.enc b{font-size:13px}
    .folio{font-size:12px;font-weight:bold}table{width:100%;border-collapse:collapse}th{border-bottom:1px solid #000;text-align:left;padding:2px 4px}td{padding:1.5px 4px;vertical-align:top}
    td.n,th.n{text-align:right;white-space:nowrap}tr.asi td{border-top:1px solid #999;font-weight:bold;padding-top:4px}tr.tot td{border-top:1px solid #000;font-weight:bold}tr.tr td{font-style:italic;background:#f2f2f2}
    h3{margin:8px 0 4px;font-size:12px;border-bottom:1px solid #000}.ind{padding-left:16px}.firmas{display:flex;justify-content:space-around;margin-top:40px}.firmas div{border-top:1px solid #000;width:38%;text-align:center;padding-top:4px}
    @media screen{body{background:#888}.pag{background:#fff;width:210mm;margin:8px auto;box-shadow:0 2px 8px rgba(0,0,0,.4)}.barra{position:sticky;top:0;background:#1f6f5c;color:#fff;padding:8px;text-align:center}.barra button{font-size:14px;padding:6px 14px}}
    @media print{.barra{display:none}@page{size:A4;margin:0}}`;
  const fmtN = n => n ? (Math.round(n) || 0).toLocaleString('es-PY') : '';
  // Pagina filas [{html, debe, haber}] con transporte de sumas ("van" / "vienen")
  function paginar(titulo, subtitulo, cabecera, filas, opts) {
    const cli = cliente(), porPag = opts.filasPorPagina || 48, folio0 = opts.folio || 1, transporte = opts.transporte;
    const pags = []; let i = 0, td = 0, th = 0;
    while (i < filas.length || !pags.length) {
      const trozo = filas.slice(i, i + porPag); i += porPag;
      const vienen = transporte && pags.length ? `<tr class="tr"><td colspan="${opts.colsTexto}">Vienen</td><td class="n">${fmtN(td)}</td><td class="n">${fmtN(th)}</td></tr>` : '';
      trozo.forEach(f => { td += f.debe || 0; th += f.haber || 0; });
      const ultima = i >= filas.length;
      const van = transporte ? `<tr class="${ultima ? 'tot' : 'tr'}"><td colspan="${opts.colsTexto}">${ultima ? 'TOTALES' : 'Van'}</td><td class="n">${fmtN(td)}</td><td class="n">${fmtN(th)}</td></tr>` : '';
      pags.push(`<div class="pag"><div class="enc"><div><b>${esc(cli.razon || '')}</b><br>RUC ${esc(cli.ruc || '')}<br>${esc(titulo)} – ${esc(subtitulo)}</div><div class="folio">Folio N° ${folio0 + pags.length}</div></div>
        <table>${cabecera}${vienen}${trozo.map(f => f.html).join('')}${van}</table>${ultima && opts.final ? opts.final : ''}</div>`);
    }
    return pags.join('');
  }
  const firmas = () => { const c = cliente(); return `<div class="firmas"><div>${esc(c.representante || 'Representante legal')}<br><small>Representante legal</small></div><div>${esc(c.contador || 'Contador')}<br><small>Contador</small></div></div>`; };
  function abrirLibro(titulo, cuerpo) {
    const w = window.open('', '_blank');
    if (!w) return toast('El navegador bloqueó la ventana: permita ventanas emergentes para imprimir los libros.', 'error');
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)} – ${esc(cliente().razon || '')}</title><style>${CSS_LIBRO}</style></head><body>
      <div class="barra"><button onclick="print()">Imprimir / Guardar como PDF</button></div>${cuerpo}</body></html>`);
    w.document.close();
    return w;
  }
  A.libroDiarioHTML = function (desde, hasta, folio) {
    const asientos = C.libroDiario(datos(), A.plan, desde, hasta, true);
    const filas = [];
    asientos.forEach((a, i) => {
      filas.push({ html: `<tr class="asi"><td>${i + 1}</td><td>${fd(a.fecha)}</td><td colspan="2">${esc(a.concepto)}</td><td></td><td></td></tr>` });
      a.lineas.forEach(l => filas.push({ html: `<tr><td></td><td></td><td>${esc(l.cuenta)}</td><td class="${l.haber ? 'ind' : ''}">${esc(nombreCta(l.cuenta))}</td><td class="n">${fmtN(l.debe)}</td><td class="n">${fmtN(l.haber)}</td></tr>`, debe: l.debe, haber: l.haber }));
    });
    return paginar('LIBRO DIARIO', `del ${fd(desde)} al ${fd(hasta)}`, '<tr><th>N°</th><th>Fecha</th><th>Cuenta</th><th>Denominación / concepto</th><th class="n">Debe</th><th class="n">Haber</th></tr>', filas, { folio, transporte: true, colsTexto: 4, final: firmas() });
  };
  A.libroMayorHTML = function (desde, hasta, folio) {
    const d = datos(), asientos = C.todosLosAsientos(d);
    const filas = [];
    A.plan.list.filter(c => c.imputable).forEach(c => {
      const ini = ['I', 'E'].includes(c.tipo) ? C.inicioEjercicio(desde, cliente().cierreMes) : '0000';
      let saldo = 0; const movs = [];
      asientos.forEach(a => { if (a.cierre || a.fecha > hasta || a.fecha < ini) return; a.lineas.forEach(l => { if (l.cuenta !== c.codigo) return; if (a.fecha < desde) saldo += l.debe - l.haber; else movs.push([a, l]); }); });
      if (!movs.length && !Math.round(saldo)) return;
      filas.push({ html: `<tr class="asi"><td colspan="3">${esc(c.codigo)} – ${esc(c.nombre)}</td><td class="n">Saldo inicial</td><td class="n">${fmtN(saldo)}</td></tr>` });
      movs.forEach(([a, l]) => { saldo += l.debe - l.haber; filas.push({ html: `<tr><td>${fd(a.fecha)}</td><td>${esc(a.concepto)}</td><td class="n">${fmtN(l.debe)}</td><td class="n">${fmtN(l.haber)}</td><td class="n">${(Math.round(saldo) || 0).toLocaleString('es-PY')}</td></tr>` }); });
    });
    return paginar('LIBRO MAYOR', `del ${fd(desde)} al ${fd(hasta)}`, '<tr><th>Fecha</th><th>Concepto</th><th class="n">Debe</th><th class="n">Haber</th><th class="n">Saldo</th></tr>', filas, { folio, colsTexto: 2, final: firmas() });
  };
  A.libroInventarioHTML = function (fecha, folio) {
    const li = C.libroInventario(datos(), A.plan, fecha);
    const filas = [];
    const grupoNombre = { AC: 'ACTIVO CORRIENTE', ANC: 'ACTIVO NO CORRIENTE', PC: 'PASIVO CORRIENTE', PNC: 'PASIVO NO CORRIENTE', PN: 'PATRIMONIO NETO' };
    let g = '';
    li.secciones.forEach(s => {
      if (s.grupo !== g) { g = s.grupo; filas.push({ html: `<tr class="asi"><td colspan="3">${grupoNombre[g]}</td></tr>` }); }
      filas.push({ html: `<tr class="asi"><td colspan="2">${esc(s.nombre)}</td><td class="n">${fmtN(s.total)}</td></tr>` });
      s.cuentas.forEach(c => filas.push({ html: `<tr><td class="ind">${esc(c.codigo)}</td><td>${esc(c.nombre)}</td><td class="n">${fmtN(c.importe)}</td></tr>` }));
      s.detalle.forEach(x => filas.push({ html: `<tr><td class="ind"><small>${esc(x[0])}</small></td><td><small>${esc(x[1])}</small></td><td class="n"><small>${fmtN(x[2])}</small></td></tr>` }));
    });
    const T = li.R.tot, E = li.R.er;
    [['TOTAL ACTIVO', T.A], ['TOTAL PASIVO', T.P], ['PATRIMONIO NETO', T.PN], ['TOTAL PASIVO Y PATRIMONIO NETO', T.PPN]].forEach(([n, x]) => filas.push({ html: `<tr class="tot"><td colspan="2">${n}</td><td class="n">${fmtN(x)}</td></tr>` }));
    filas.push({ html: '<tr class="asi"><td colspan="3">ESTADO DE RESULTADOS DEL EJERCICIO</td></tr>' });
    C.estructuraER().forEach(f => filas.push({ html: `<tr class="${f.total ? 'tot' : ''}"><td></td><td class="${f.total ? '' : 'ind'}">${f.nombre}</td><td class="n">${(Math.round(f.val(li.R)) || 0).toLocaleString('es-PY')}</td></tr>` }));
    return paginar('LIBRO INVENTARIO', `Inventario y balance al ${fd(fecha)}`, '<tr><th>Cuenta / detalle</th><th>Denominación</th><th class="n">Importe Gs.</th></tr>', filas, { folio, colsTexto: 2, final: firmas() });
  };
  A.registrar('libros', 'Libros rubricados', 'Informes', {
    html() {
      const anio = anioActual(), r = ejercicioDe(anio);
      const f = st.libros || { desde: r.desde, hasta: r.hasta, folio: 1 };
      return `<section class="card"><h2>Libros para rubricar (Diario, Mayor e Inventario)</h2>
        <div class="form cols4"><label>Desde <input type="date" id="lb-desde" value="${f.desde}"></label><label>Hasta <input type="date" id="lb-hasta" value="${f.hasta}"></label>
          <label>Folio inicial (continúa la numeración del libro rubricado) <input type="number" id="lb-folio" min="1" value="${f.folio}"></label><label>Filas por hoja <input type="number" id="lb-filas" value="${f.filas || 48}"></label></div>
        <div class="acciones"><button id="lb-diario" class="primary">Libro Diario</button> <button id="lb-mayor">Libro Mayor</button> <button id="lb-inv" class="primary">Libro Inventario (al ${fd(f.hasta)})</button></div>
        <p class="muted">Se abre una ventana con hojas A4 numeradas (Folio N°), transporte de sumas ("van" / "vienen") en el Diario, asientos de apertura, refundición y cierre, y firmas del representante legal y del contador (datos de la pestaña Clientes). Use "Imprimir / Guardar como PDF".
          El Libro Inventario detalla cada rubro con sus cuentas, saldos de clientes y proveedores, mercaderías valorizadas y bienes de uso, y el estado de resultados.</p></section>`;
    },
    bind() {
      const leer = () => { st.libros = { desde: v('#lb-desde'), hasta: v('#lb-hasta'), folio: +v('#lb-folio') || 1, filas: +v('#lb-filas') || 48 }; return st.libros; };
      $('#lb-diario').onclick = () => { const f = leer(); abrirLibro('Libro Diario', A.libroDiarioHTML(f.desde, f.hasta, f.folio).replace(/<table>/g, '<table>')); };
      $('#lb-mayor').onclick = () => { const f = leer(); abrirLibro('Libro Mayor', A.libroMayorHTML(f.desde, f.hasta, f.folio)); };
      $('#lb-inv').onclick = () => { const f = leer(); abrirLibro('Libro Inventario', A.libroInventarioHTML(f.hasta, f.folio)); };
    }
  }, 'balances');

  /* =================== IRE SEGÚN RÉGIMEN =================== */
  const t500 = A.TABS.find(x => x[0] === 'f500'); if (t500) t500[1] = 'IRE (General / Simple / Resimple)';
  const vGeneral = A.VISTAS.f500;
  const selectorRegimen = reg => `<div class="acciones"><label>Régimen del IRE del cliente <select id="ire-reg">
      <option value="GENERAL">GENERAL (Form. 500, contabilidad completa)</option><option value="SIMPLE" ${reg === 'SIMPLE' ? 'selected' : ''}>SIMPLE (ingresos hasta Gs. 2.000 millones)</option>
      <option value="RESIMPLE" ${reg === 'RESIMPLE' ? 'selected' : ''}>RESIMPLE (unipersonales hasta Gs. 80 millones, cuota fija)</option></select></label></div>`;
  A.VISTAS.f500 = {
    html() {
      const d = datos(), reg = C.regimenIRE(d), anio = st.anio, c = cfg();
      if (reg === 'GENERAL') return `<section class="card">${selectorRegimen(reg)}</section>` + vGeneral.html();
      const ent = obj('f500')[anio] || {};
      const inp = (k, n, ph) => `<label>${n}<input class="n" data-f="${k}" value="${ent[k] !== undefined && ent[k] !== '' ? fmt(ent[k]) : ''}" placeholder="${esc(ph === undefined ? '0' : ph)}"></label>`;
      const tabla = filas => `<table class="grid f120"><tbody>${filas.map(([t, x, cls]) => `<tr class="${cls || ''}"><td>${t}</td><td class="n">${x === null ? '' : fmt(x)}</td></tr>`).join('')}</tbody></table>`;
      const al = list => list.length ? `<div class="alerta">${list.map(esc).join('<br>')}</div>` : '';
      if (reg === 'SIMPLE') {
        const r = C.ireSimple(d, A.plan, anio);
        return `<section class="card">${selectorRegimen(reg)}<h2>IRE SIMPLE – ejercicio ${anio}</h2>
          <div class="acciones"><label>Ejercicio <input type="number" id="f5-anio" value="${anio}" style="width:6em"></label> <span class="muted">Del ${fd(r.desde)} al ${fd(r.hasta)}</span>
            <label>Determinación de la renta <select id="sp-met"><option value="REAL">Real (ingresos − egresos)</option><option value="PRESUNTA" ${r.metodo === 'PRESUNTA' ? 'selected' : ''}>Presunta (${c.pctRentaPresuntaSimple}% de los ingresos)</option></select></label>
            <button id="sp-exp">Exportar</button></div>
          ${al(r.alertas)}
          <div class="form cols4">${inp('anticipos', 'Anticipos', `de la cuenta: ${fmt(r.anticipos)}`)}${inp('retenciones', 'Retenciones de IRE', `de Retenciones: ${fmt(r.retenciones)}`)}${inp('saldoFavorAnterior', 'Saldo a favor anterior')}</div>
          <p class="muted">Ingresos y egresos salen de la contabilidad del ejercicio (excluye ingresos NG y gastos ND del plan de cuentas). Según el cálculo, conviene el método <b>${r.conveniente === 'REAL' ? 'real' : 'presunto'}</b>. Verifique con la normativa vigente qué opción le corresponde al contribuyente y el porcentaje de renta presunta (configurable en Clientes).</p>
          ${tabla([['Ingresos brutos gravados', r.ingresosBrutos], ['Ingresos no gravados (excluidos)', r.noGravados], ['Costos y gastos', r.egresos], ['(−) Gastos no deducibles', -r.noDeducibles], ['Egresos deducibles', r.egresosDeducibles, 'total'],
            ['Renta neta real (ingresos − egresos)', r.rentaReal], [`Renta neta presunta (${c.pctRentaPresuntaSimple}% de los ingresos)`, r.rentaPresunta], [`RENTA NETA (${r.metodo === 'PRESUNTA' ? 'presunta' : 'real'})`, r.renta, 'total'],
            [`Impuesto (${c.tasaIRE}%)`, r.impuesto, 'total'], ['(−) Anticipos', -r.anticipos], ['(−) Retenciones', -r.retenciones], ['(−) Saldo a favor anterior', -r.saldoFavorAnterior], [r.neto >= 0 ? 'SALDO A INGRESAR' : 'SALDO A FAVOR', Math.abs(r.neto), 'total']])}
        </section>`;
      }
      const r = C.ireResimple(d, A.plan, anio);
      return `<section class="card">${selectorRegimen(reg)}<h2>IRE RESIMPLE – ejercicio ${anio}</h2>
        <div class="acciones"><label>Ejercicio <input type="number" id="f5-anio" value="${anio}" style="width:6em"></label> <button id="sp-exp">Exportar</button></div>
        ${al(r.alertas)}
        <div class="form cols3">${inp('ingresosAnterior', 'Ingresos del ejercicio anterior', `de la contabilidad: ${fmt(r.ingresosAnterior)}`)}${inp('cuotasPagadas', 'Cuotas pagadas en el ejercicio')}</div>
        <p class="muted">Cuota fija mensual según los ingresos del ejercicio anterior. Tramos configurables en Clientes (verifique los montos vigentes en la DNIT): ${r.tramos.map(t => `hasta ${t.hasta === Infinity ? '∞' : fmt(t.hasta)} → ${fmt(t.cuota)}`).join(' · ')}. La DJ anual vence el 26 de febrero.</p>
        ${tabla([['Ingresos brutos del ejercicio', r.ingresosBrutos], ['Ingresos del ejercicio anterior', r.ingresosAnterior], ['Cuota mensual del ejercicio', r.cuotaMensualActual], ['Total de cuotas del ejercicio (12 meses)', r.cuotasDelAnio, 'total'],
          ['(−) Cuotas pagadas', -r.pagado], [r.saldo >= 0 ? 'SALDO PENDIENTE' : 'PAGADO DE MÁS', Math.abs(r.saldo), 'total'], ['Cuota mensual para el ejercicio siguiente', r.cuotaMensualSiguiente, 'total']])}
      </section>`;
    },
    bind() {
      const d = datos(), reg = C.regimenIRE(d);
      $('#ire-reg').onchange = e => { setCfg({ regimenIRE: e.target.value }); render(); };
      if (reg === 'GENERAL') return vGeneral.bind();
      $('#f5-anio').onchange = e => { st.anio = +e.target.value; render(); };
      $$('[data-f]').forEach(i => i.onchange = () => { const e = obj('f500')[st.anio] || (obj('f500')[st.anio] = {}); if (i.value.trim() === '') delete e[i.dataset.f]; else e[i.dataset.f] = C.num(i.value); S.save(); render(); });
      if ($('#sp-met')) $('#sp-met').onchange = e => { const x = obj('f500')[st.anio] || (obj('f500')[st.anio] = {}); x.metodoSimple = e.target.value; S.save(); render(); };
      $('#sp-exp').onclick = () => {
        const filas = [...document.querySelectorAll('table.f120 tr')].map(tr => [...tr.children].map((td, i) => i ? C.num(td.textContent) : td.textContent));
        X.descargar([{ nombre: `IRE ${reg}`, ws: X.hoja(X.encabezado(cliente(), `IRE ${reg} – EJERCICIO ${st.anio}`, 'Preliquidación').concat([['Concepto', 'Importe Gs.']], filas), { anchos: [60, 18] }) }], `IRE_${reg}_${st.anio}_${slug(cliente().razon)}.xlsx`);
      };
    }
  };
})();
