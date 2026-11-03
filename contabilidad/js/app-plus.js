/* Pantallas: controles antes de presentar, cruce con terceros, Tesaka, anticipos de IRE, auditoría y
 * partes relacionadas, beneficiarios finales, IPS / Ministerio de Trabajo / aguinaldo / recibos,
 * calendario de todos los clientes, informe mensual para el cliente y administración del estudio. */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, X, $, $$, esc, fmt, fd, hoy, MESES, st, toast, datos, cfg, pedirArchivo, slug, cliente, render } = A;
  const R = window.Reportes;
  const v = id => ($(id) ? $(id).value : '');
  const arr = k => { const d = datos(); return d[k] || (d[k] = []); };
  const obj = k => { const d = datos(); return d[k] || (d[k] = {}); };
  const setCfg = o => { const d = datos(); d.config = Object.assign({}, d.config, o); S.save(); };
  const nombreMes = p => `${MESES[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
  const perSel = () => `<label>Período <input type="month" id="per" value="${st.periodo}"></label>`;
  const bindPer = () => { if ($('#per')) $('#per').onchange = e => { if (e.target.value) { st.periodo = e.target.value; render(); } }; };
  const tabla = (cols, filas, vacio) => `<div class="scroll"><table class="grid"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.join('') || `<tr><td colspan="${cols.length}" class="muted">${vacio || 'Ninguno'}</td></tr>`}</tbody></table></div>`;
  const ref = x => `${x.numero || '(s/n)'} · ${esc(x.razon || x.ruc || '')} · ${fd(x.fecha)}`;
  const docTabla = (titulo, columnas, filas) => ({ tipo: 'tabla', titulo, columnas, filas: filas.map(f => Array.isArray(f) ? { v: f } : f) });
  const bajarDoc = (titulo, bloques, archivo, extra) => R.descargarDocumento(Object.assign({ cliente: cliente(), titulo, subtitulo: extra || '', bloques }), archivo);
  const multiArchivos = (accept, cb) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = true; i.onchange = () => cb(Array.from(i.files)); i.click(); };

  /* ======================= Lista de RUC de la DNIT (IndexedDB, aparte de los datos) ======================= */
  const RUCDB = (() => {
    let db = null;
    const abrir = () => db ? Promise.resolve(db) : new Promise((ok, mal) => {
      if (!window.indexedDB) return mal(new Error('Este navegador no permite guardar la lista de RUC'));
      const r = indexedDB.open('contapy_rucs', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('rucs'); r.result.createObjectStore('meta'); };
      r.onsuccess = () => { db = r.result; ok(db); }; r.onerror = () => mal(r.error);
    });
    const tx = (store, modo, fn) => abrir().then(d => new Promise((ok, mal) => { const t = d.transaction(store, modo); const res = fn(t.objectStore(store)); t.oncomplete = () => ok(res && res.result !== undefined ? res.result : res); t.onerror = () => mal(t.error); }));
    return {
      async info() { try { const r = await tx('meta', 'readonly', s => s.get('info')); return r || null; } catch (e) { return null; } },
      async buscar(ruc) { try { const b = String(ruc || '').split('-')[0].replace(/\D/g, ''); if (!b) return null; return (await tx('rucs', 'readonly', s => s.get(b))) || null; } catch (e) { return null; } },
      async guardar(lista, alAvanzar) {
        const LOTE = 20000;
        for (let i = 0; i < lista.length; i += LOTE) {
          await tx('rucs', 'readwrite', s => { lista.slice(i, i + LOTE).forEach(x => s.put(x, x.ruc)); });
          if (alAvanzar) alAvanzar(Math.min(lista.length, i + LOTE), lista.length);
        }
        const prev = await this.info();
        await tx('meta', 'readwrite', s => s.put({ cantidad: ((prev && prev.cantidad) || 0) + lista.length, fecha: hoy() }, 'info'));
      },
      async borrar() { await tx('rucs', 'readwrite', s => s.clear()); await tx('meta', 'readwrite', s => s.clear()); }
    };
  })();
  A.RUCDB = RUCDB;
  async function textosDeArchivo(f) {
    const buf = new Uint8Array(await f.arrayBuffer());
    const dec = b => { const t = new TextDecoder('utf-8').decode(b); return t.includes('�') ? new TextDecoder('latin1').decode(b) : t; };
    if (buf[0] === 0x50 && buf[1] === 0x4B) { const z = XLSX.CFB.read(buf, { type: 'array' }); return z.FileIndex.filter(x => x.type === 2 && /\.(txt|csv)$/i.test(x.name)).map(x => dec(x.content)); }
    return [dec(buf)];
  }
  function parsearRucs(txt) {
    const out = [];
    txt.split(/\r?\n/).forEach(l => { const p = l.split('|'); if (p.length < 3 || !/^\d+$/.test(p[0].trim())) return; out.push({ ruc: p[0].trim(), razon: (p[1] || '').trim(), dv: (p[2] || '').trim(), estado: (p[4] || '').trim().toUpperCase() }); });
    return out;
  }
  async function revisarRucs(lista) {
    const info = await RUCDB.info(), out = [];
    const vistos = new Set();
    for (const x of lista) {
      if (!x.ruc || vistos.has(x.ruc)) continue; vistos.add(x.ruc);
      if (C.rucValido(x.ruc) === false) { out.push({ x, motivo: 'dígito verificador incorrecto' }); continue; }
      if (!info) continue;
      const r = await RUCDB.buscar(x.ruc);
      if (!r) { if (/^\d+-\d$/.test(x.ruc)) out.push({ x, motivo: 'no figura en la lista de RUC de la DNIT' }); }
      else if (r.estado && r.estado !== 'ACTIVO') out.push({ x, motivo: `RUC en estado ${r.estado}` });
    }
    return out;
  }
  // completar la razón social al escribir el RUC (carga rápida y retenciones)
  document.addEventListener('change', async e => {
    const i = e.target; if (!i || !i.id || !/^(q|r)-ruc$/.test(i.id)) return;
    const r = await RUCDB.buscar(i.value); if (!r) return;
    const raz = $(i.id === 'q-ruc' ? '#q-razon' : '#r-razon');
    if (raz && !raz.value.trim()) raz.value = r.razon;
    if (r.estado && r.estado !== 'ACTIVO') toast(`RUC ${i.value}: estado ${r.estado} en la lista de la DNIT`, 'error');
    if (r.dv && !String(i.value).includes('-')) i.value = `${r.ruc}-${r.dv}`;
  });

  /* ======================= Controles del mes ======================= */
  async function problemasDelMes(d, periodo) {
    const out = [];
    try {
      const q = C.cuadreMes(d, periodo);
      q.filas.forEach(f => { if (f.difF120) out.push(`${f.concepto}: el Form. 120 difiere del libro IVA en Gs. ${fmt(f.difF120)}.`); if (f.difCont) out.push(`${f.concepto}: la contabilidad difiere del libro IVA en Gs. ${fmt(f.difCont)}.`); });
      q.rg90.errores.slice(0, 5).forEach(e => out.push(`RG 90: ${e}`));
      if (q.rg90.errores.length > 5) out.push(`RG 90: ${q.rg90.errores.length - 5} errores más.`);
    } catch (e) { out.push('No se pudo calcular el cuadre del mes: ' + e.message); }
    C.controlTimbrados(d, periodo).slice(0, 5).forEach(t => out.push(t.motivo));
    const docs = (d.ventas || []).concat(d.compras || []).filter(x => x.fecha && x.fecha.slice(0, 7) === periodo);
    (await revisarRucs(docs)).slice(0, 5).forEach(r => out.push(`RUC ${r.x.ruc} (${r.x.razon || ''}): ${r.motivo}.`));
    return out;
  }
  // Aviso antes de descargar lo que se presenta (Form. 120, RG 90, Form. 500)
  A.confirmarAntesDePresentar = async function (titulo, problemas) {
    if (!problemas.length) return true;
    return new Promise(ok => {
      const div = document.createElement('div'); div.className = 'formato-fondo';
      div.innerHTML = `<div class="formato card aviso-previo" role="dialog"><h3>${esc(titulo)}: revise antes de presentar</h3>
        <ul class="alertas">${problemas.map(p => `<li class="aviso"><span class="t">${esc(p)}</span></li>`).join('')}</ul>
        <div class="acciones"><button class="primary" data-r="1">Descargar igual</button> <button data-r="0">Volver y corregir</button> <button data-r="2">Ver controles del mes</button></div></div>`;
      document.body.appendChild(div);
      div.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; div.remove(); if (b.dataset.r === '2') { st.tab = 'cuadre'; render(); } ok(b.dataset.r === '1'); });
    });
  };
  const envolver = (sel, titulo, problemasFn) => { const b = $(sel); if (!b || b.dataset.envuelto) return; const orig = b.onclick; b.dataset.envuelto = '1'; b.onclick = async ev => { if (await A.confirmarAntesDePresentar(titulo, await problemasFn())) orig && orig.call(b, ev); }; };

  A.registrar('cuadre', 'Controles del mes', 'Impuestos', {
    html() {
      const d = datos(), p = st.periodo;
      let q = null; try { q = C.cuadreMes(d, p); } catch (e) { q = null; }
      const tim = C.controlTimbrados(d, p), usados = C.timbradosUsados(d);
      const dif = x => x ? `<b class="err">${fmt(x)}</b>` : '<span class="ok">0</span>';
      return `<section class="card"><h2>Controles del mes – ${nombreMes(p)}</h2>
        <div class="acciones">${perSel()} <button id="cu-exp">Descargar (PDF o Excel)</button></div>
        ${q ? `${tabla(['Concepto', 'Libro IVA', 'Form. 120', 'Contabilidad', 'Dif. 120', 'Dif. contable'], q.filas.map(f => `<tr><td>${f.concepto}</td><td class="n">${fmt(f.libro)}</td><td class="n">${fmt(f.f120)}</td><td class="n">${fmt(f.contable)}</td><td class="n">${dif(f.difF120)}</td><td class="n">${dif(f.difCont)}</td></tr>`))}
        <p>RG 90: <b>${q.rg90.lineas}</b> comprobantes · total Gs. ${fmt(q.rg90.total)} · ${q.rg90.excluidos} electrónicos (ya están en Marangatu) · ${q.rg90.errores.length ? `<b class="err">${q.rg90.errores.length} con errores</b>` : 'sin errores'}</p>
        ${q.causas.length || q.rg90.errores.length ? `<div class="alerta">${q.causas.concat(q.rg90.errores).map(esc).join('<br>')}</div>` : '<div class="okbox">Libro IVA, Form. 120, contabilidad y RG 90 coinciden.</div>'}` : '<div class="alerta">No se pudo calcular el cuadre.</div>'}
      </section>
      <section class="card"><h2>RUC de los comprobantes</h2>
        <div class="acciones"><span id="ru-info" class="muted">Lista de RUC de la DNIT: …</span> <button id="ru-imp">Importar lista de RUC (archivos ruc0 a ruc9 de la DNIT)</button> <button id="ru-del" class="danger">Borrar lista</button> <button id="ru-rev" class="primary">Revisar RUC del mes</button></div>
        <div id="ru-res"></div></section>
      <section class="card"><h2>Timbrados</h2>
        ${tim.length ? `<div class="alerta">${tim.map(t => esc(t.motivo)).join('<br>')}</div>` : '<div class="okbox">Sin problemas de timbrado en las compras del mes.</div>'}
        <h3>Vigencia de los timbrados de proveedores</h3>
        ${tabla(['Proveedor', 'RUC', 'Timbrado', 'Usado', 'Comprobantes', 'Inicio de vigencia', 'Fin de vigencia'], usados.map(t => `<tr class="${t.vence && t.hasta > t.vence ? 'err' : ''}"><td>${esc(t.razon || '')}</td><td>${esc(t.ruc)}</td><td>${esc(t.timbrado)}</td><td>${fd(t.desde)} – ${fd(t.hasta)}</td><td class="n">${t.cantidad}</td>
          <td><input type="date" data-tv="${esc(t.clave)}" data-k="inicio" value="${esc(t.inicio || '')}"></td><td><input type="date" data-tv="${esc(t.clave)}" data-k="vence" value="${esc(t.vence || '')}"></td></tr>`), 'Sin compras con timbrado')}
      </section>`;
    },
    bind() {
      bindPer();
      const d = datos();
      RUCDB.info().then(i => { if ($('#ru-info')) $('#ru-info').textContent = i ? `Lista de RUC de la DNIT: ${fmt(i.cantidad)} RUC cargados el ${fd(i.fecha)}` : 'Lista de RUC de la DNIT: no cargada'; });
      $$('[data-tv]').forEach(i => i.onchange = () => { const t = obj('timbrados'), o = t[i.dataset.tv] || (t[i.dataset.tv] = {}); o[i.dataset.k] = i.value; S.save(); render(); });
      $('#ru-imp').onclick = () => multiArchivos('.txt,.zip,.csv', async files => {
        try {
          let total = 0;
          for (const f of files) for (const t of await textosDeArchivo(f)) { const l = parsearRucs(t); total += l.length; await RUCDB.guardar(l, (a, b) => { $('#ru-info').textContent = `Guardando ${fmt(a)} de ${fmt(b)}…`; }); }
          toast(`${fmt(total)} RUC importados`); render();
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
      $('#ru-del').onclick = async () => { if (confirm('¿Borrar la lista de RUC de la DNIT?')) { await RUCDB.borrar(); render(); } };
      $('#ru-rev').onclick = async () => {
        const docs = (d.ventas || []).concat(d.compras || []).filter(x => x.fecha && x.fecha.slice(0, 7) === st.periodo);
        const r = await revisarRucs(docs);
        $('#ru-res').innerHTML = r.length ? tabla(['RUC', 'Razón social', 'Problema'], r.map(x => `<tr><td>${esc(x.x.ruc)}</td><td>${esc(x.x.razon || '')}</td><td>${esc(x.motivo)}</td></tr>`)) : '<div class="okbox">Todos los RUC del mes están bien.</div>';
      };
      $('#cu-exp').onclick = async () => {
        const q = C.cuadreMes(d, st.periodo), tim = C.controlTimbrados(d, st.periodo);
        const docs = (d.ventas || []).concat(d.compras || []).filter(x => x.fecha && x.fecha.slice(0, 7) === st.periodo);
        const ru = await revisarRucs(docs);
        bajarDoc(`CONTROLES DEL MES – ${nombreMes(st.periodo).toUpperCase()}`, [
          docTabla('Cuadre de IVA', [{ t: 'Concepto', w: 30 }, { t: 'Libro IVA', w: 16, tipo: 'gs' }, { t: 'Form. 120', w: 16, tipo: 'gs' }, { t: 'Contabilidad', w: 16, tipo: 'gs' }, { t: 'Dif. 120', w: 14, tipo: 'gs' }, { t: 'Dif. contable', w: 14, tipo: 'gs' }],
            q.filas.map(f => [f.concepto, f.libro, f.f120, f.contable, f.difF120, f.difCont])),
          docTabla('RG 90', [{ t: 'Concepto', w: 60 }, { t: 'Valor', w: 20, tipo: 'gs' }], [['Comprobantes en el archivo', q.rg90.lineas], ['Total del archivo', q.rg90.total], ['Comprobantes electrónicos excluidos', q.rg90.excluidos], ['Comprobantes con errores', q.rg90.errores.length]]),
          { tipo: 'texto', titulo: 'Observaciones', parrafos: q.causas.concat(q.rg90.errores, tim.map(t => t.motivo), ru.map(r => `RUC ${r.x.ruc}: ${r.motivo}`)).concat(q.ok && !tim.length && !ru.length ? ['Sin observaciones.'] : []) }
        ], `controles_${st.periodo}_${slug(cliente().razon)}`);
      };
    }
  });

  /* ======================= Cruce con lo informado por terceros ======================= */
  A.registrar('terceros', 'Cruce con terceros', 'Impuestos', {
    html() {
      const r = st.cruce, tipo = st.cruceTipo || 'compras';
      const fila = x => `<tr><td>${fd(x.fecha)}</td><td>${esc(x.ruc || '')}</td><td>${esc(x.razon || '')}</td><td>${esc(x.timbrado || '')}</td><td>${esc(x.numero || '')}</td><td class="n">${fmt(C.signo(x) * C.desglose(x).total)}</td></tr>`;
      const cols = ['Fecha', 'RUC', 'Razón social', 'Timbrado', 'Número', 'Total'];
      return `<section class="card"><h2>Cruce con lo informado por terceros</h2>
        <div class="acciones"><label>Comparar <select id="ct-tipo"><option value="compras">Mis compras con lo que informaron los proveedores</option><option value="ventas" ${tipo === 'ventas' ? 'selected' : ''}>Mis ventas con lo que informaron los clientes</option></select></label>
          <button id="ct-imp" class="primary">Importar archivo de Marangatu (Excel, CSV o ZIP)</button>${r ? ' <button id="ct-exp">Descargar resultado</button>' : ''}</div>
        ${r ? `<div class="form cols4"><label>Coinciden <input disabled class="n" value="${r.coinciden.length}"></label><label>Faltan en el sistema <input disabled class="n ${r.faltanEnSistema.length ? 'err' : ''}" value="${r.faltanEnSistema.length}"></label>
          <label>No informados por el tercero <input disabled class="n" value="${r.faltanEnTerceros.length}"></label><label>Con importe distinto <input disabled class="n ${r.diferencias.length ? 'err' : ''}" value="${r.diferencias.length}"></label></div>
          <h3>Informados por el tercero y no cargados en el sistema (${r.faltanEnSistema.length})</h3>
          ${r.faltanEnSistema.length && tipo === 'compras' ? '<div class="acciones"><button id="ct-cargar" class="primary">Cargar estos comprobantes en Compras</button></div>' : ''}
          ${tabla(cols, r.faltanEnSistema.map(fila))}
          <h3>Con importe distinto (${r.diferencias.length})</h3>
          ${tabla(['Comprobante', 'En el sistema', 'Informado', 'Diferencia'], r.diferencias.map(x => `<tr><td>${ref(x.propio)}</td><td class="n">${fmt(C.signo(x.propio) * C.desglose(x.propio).total)}</td><td class="n">${fmt(C.signo(x.informado) * C.desglose(x.informado).total)}</td><td class="n err">${fmt(x.diferencia)}</td></tr>`))}
          <h3>Cargados en el sistema y no informados por el tercero (${r.faltanEnTerceros.length})</h3>
          ${tabla(cols, r.faltanEnTerceros.map(fila))}` : ''}
      </section>`;
    },
    bind() {
      $('#ct-tipo').onchange = e => { st.cruceTipo = e.target.value; st.cruce = null; render(); };
      $('#ct-imp').onclick = () => multiArchivos('.xlsx,.xls,.csv,.txt,.zip', async files => {
        try {
          const tipo = st.cruceTipo || 'compras', esCompra = tipo === 'compras', inf = [];
          for (const f of files) {
            if (/\.(xlsx|xls)$/i.test(f.name)) { inf.push(...X.importarComprobantes(X.filas(await X.leerArchivo(f)), esCompra).docs); continue; }
            for (const t of await textosDeArchivo(f)) {
              const rg = C.importarRG90(t);
              // en el archivo del tercero, su venta es mi compra (y al revés)
              const docs = esCompra ? rg.ventas.concat(rg.compras.length && !rg.ventas.length ? rg.compras : []) : rg.compras.concat(rg.ventas.length && !rg.compras.length ? rg.ventas : []);
              if (docs.length) inf.push(...docs);
              else { const wb = XLSX.read(t, { type: 'string', raw: true }); inf.push(...X.importarComprobantes(X.filas(wb), esCompra).docs); }
            }
          }
          if (!inf.length) return toast('No se encontraron comprobantes en el archivo', 'error');
          const fechas = inf.map(x => x.fecha).filter(Boolean).sort(), desde = fechas[0], hasta = fechas[fechas.length - 1];
          const propios = (datos()[tipo] || []).filter(x => x.fecha >= desde && x.fecha <= hasta);
          st.cruce = C.cruceTerceros(propios, inf); st.cruceRango = [desde, hasta];
          render(); toast(`${inf.length} comprobantes informados del ${fd(desde)} al ${fd(hasta)}`);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
      if ($('#ct-cargar')) $('#ct-cargar').onclick = () => {
        const r = A.incorporarDocs(st.cruce.faltanEnSistema.map(x => Object.assign({}, x)), true); S.save();
        toast(`${r.ok} compras cargadas${r.dup ? `, ${r.dup} duplicadas` : ''}`); st.cruce = null; render();
      };
      if ($('#ct-exp')) $('#ct-exp').onclick = () => {
        const r = st.cruce, cols = [{ t: 'Fecha', w: 11 }, { t: 'RUC', w: 13 }, { t: 'Razón social', w: 34 }, { t: 'Timbrado', w: 10 }, { t: 'Número', w: 17 }, { t: 'Total', w: 15, tipo: 'gs' }];
        const f = x => [fd(x.fecha), x.ruc, x.razon, x.timbrado, x.numero, C.signo(x) * C.desglose(x).total];
        bajarDoc('CRUCE CON COMPROBANTES INFORMADOS POR TERCEROS', [
          docTabla(`Informados y no cargados (${r.faltanEnSistema.length})`, cols, r.faltanEnSistema.map(f)),
          docTabla(`Con importe distinto (${r.diferencias.length})`, [{ t: 'Comprobante', w: 50 }, { t: 'Sistema', w: 15, tipo: 'gs' }, { t: 'Informado', w: 15, tipo: 'gs' }, { t: 'Diferencia', w: 15, tipo: 'gs' }],
            r.diferencias.map(x => [`${x.propio.numero} ${x.propio.razon || ''}`, C.signo(x.propio) * C.desglose(x.propio).total, C.signo(x.informado) * C.desglose(x.informado).total, x.diferencia])),
          docTabla(`Cargados y no informados (${r.faltanEnTerceros.length})`, cols, r.faltanEnTerceros.map(f))
        ], `cruce_terceros_${slug(cliente().razon)}`, st.cruceRango ? `Del ${fd(st.cruceRango[0])} al ${fd(st.cruceRango[1])}` : '');
      };
    }
  });

  /* ======================= Tesaka en Retenciones ======================= */
  const vRet = A.VISTAS.retenciones;
  if (vRet) A.VISTAS.retenciones = Object.assign({}, vRet, {
    html() { return vRet.html().replace('<button id="r-exp">', '<button id="r-tesaka">Archivo para Tesaka (retenciones emitidas)</button> <button id="r-exp">'); },
    bind() {
      vRet.bind();
      $('#r-tesaka').onclick = () => {
        const r = C.tesaka(datos(), st.periodo);
        if (r.errores.length) toast(r.errores.join(' '), 'error');
        if (!r.retenciones.length) return toast('No hay retenciones emitidas con su factura en el período', 'error');
        R.bajar(new Blob([JSON.stringify(r.retenciones, null, 2)], { type: 'application/json' }), `tesaka_${st.periodo}_${slug(cliente().razon)}.json`);
        toast(`${r.retenciones.length} retenciones en el archivo`);
      };
    }
  });

  /* ======================= Anticipos de IRE (Form. 500) ======================= */
  const vF5 = A.VISTAS.f500;
  A.VISTAS.f500 = Object.assign({}, vF5, {
    html() {
      const h = vF5.html(), d = datos();
      if (C.regimenIRE(d) !== 'GENERAL') return h;
      const anio = (st.anio || +hoy().slice(0, 4) - 1) + 1, r = C.anticiposIRE(d, A.plan, anio, cliente().ruc);
      return h + `<section class="card"><h2>Anticipos de IRE del ejercicio ${anio}</h2>
        <p>Impuesto liquidado del ejercicio ${anio - 1}: <b>Gs. ${fmt(r.base)}</b> · cuota: <b>Gs. ${fmt(r.cuota)}</b> · pendiente: <b>Gs. ${fmt(r.pendiente)}</b></p>
        ${tabla(['Cuota', 'Vencimiento', 'Monto', 'Pagada'], r.cuotas.map(c => `<tr class="${!c.pagado && c.fecha < hoy() ? 'err' : ''}"><td>${c.n}</td><td>${fd(c.fecha)}</td><td class="n">${fmt(c.monto)}</td><td class="c"><input type="checkbox" data-antp="${anio}|${c.n}" ${c.pagado ? 'checked' : ''}></td></tr>`))}</section>`;
    },
    bind() {
      vF5.bind();
      $$('[data-antp]').forEach(i => i.onchange = () => { const [a, n] = i.dataset.antp.split('|'); const o = obj('anticiposPagados'); (o[a] || (o[a] = {}))[n] = i.checked; S.save(); render(); });
      envolver('#f5-exp', 'Form. 500', async () => { const f = C.f500(datos(), A.plan, st.anio); return f.controles.slice(); });
    }
  });

  /* ======================= Aviso previo en Form. 120 y RG 90 ======================= */
  ['f120', 'rg90'].forEach(k => {
    const vb = A.VISTAS[k]; if (!vb) return;
    A.VISTAS[k] = Object.assign({}, vb, { bind() {
      vb.bind();
      const fn = () => problemasDelMes(datos(), st.periodo);
      if (k === 'f120') envolver('#f-exp', 'Form. 120', fn); else { envolver('#r-zip', 'RG 90', fn); envolver('#r-csv', 'RG 90', fn); }
    } });
  });

  /* ======================= Auditoría impositiva y partes relacionadas ======================= */
  A.registrar('auditoria', 'Auditoría y partes relacionadas', 'Impuestos', {
    html() {
      const d = datos(), anio = st.anio || +hoy().slice(0, 4) - 1, c = cfg(), au = C.controlAuditoria(d, anio + 1);
      const ter = C.tercerosDelAnio(d, anio), t = d.terceros || {};
      const pr = C.partesRelacionadas(d, anio);
      return `<section class="card"><h2>Auditoría impositiva externa</h2>
        <div class="acciones"><label>Ejercicio <input type="number" id="au-anio" value="${anio}" style="width:6em"></label>
          <label>Umbral de ingresos (Gs.) <input id="au-umbral" class="n" value="${fmt(c.umbralAuditoria)}" size="16"></label>
          <button id="au-paq" class="primary">Paquete para el auditor (PDF o Excel)</button></div>
        <div class="${au.obligado ? 'alerta' : 'okbox'}">Ingresos brutos del ejercicio ${anio}: <b>Gs. ${fmt(au.ingresosAnterior)}</b> · ${au.obligado ? '<b>supera el umbral: el ejercicio siguiente requiere auditoría impositiva.</b>' : 'no supera el umbral.'}</div>
      </section>
      <section class="card"><h2>Partes relacionadas – ejercicio ${anio}</h2>
        ${pr.length ? tabla(['RUC', 'Razón social', 'Vínculo', 'Ventas', 'Compras', 'Comprobantes'], pr.map(x => `<tr><td>${esc(x.ruc)}</td><td>${esc(x.razon)}</td><td>${esc(x.vinculo)}</td><td class="n">${fmt(x.ventas)}</td><td class="n">${fmt(x.compras)}</td><td class="n">${x.cantidad}</td></tr>`)) + '<div class="acciones"><button id="pr-exp">Descargar operaciones con partes relacionadas</button></div>' : '<p class="muted">Ninguna marcada.</p>'}
        <h3>Clientes y proveedores del ejercicio</h3>
        ${tabla(['Relacionada', 'Vínculo', 'RUC', 'Razón social', 'Ventas', 'Compras'], ter.slice(0, 200).map(x => `<tr><td class="c"><input type="checkbox" data-prel="${esc(x.ruc)}" ${(t[x.ruc] || {}).relacionada ? 'checked' : ''}></td>
          <td><input data-pvin="${esc(x.ruc)}" value="${esc((t[x.ruc] || {}).vinculo || '')}" placeholder="socio, controlante…" size="16"></td><td>${esc(x.ruc)}</td><td>${esc(x.razon)}</td><td class="n">${fmt(x.ventas)}</td><td class="n">${fmt(x.compras)}</td></tr>`), 'Sin operaciones en el ejercicio')}
      </section>`;
    },
    bind() {
      const d = datos(), ter = () => d.terceros || (d.terceros = {});
      $('#au-anio').onchange = e => { st.anio = +e.target.value; render(); };
      $('#au-umbral').onchange = e => { setCfg({ umbralAuditoria: C.num(e.target.value) }); render(); };
      $$('[data-prel]').forEach(i => i.onchange = () => { const t = ter()[i.dataset.prel] || (ter()[i.dataset.prel] = {}); t.relacionada = i.checked; S.save(); render(); });
      $$('[data-pvin]').forEach(i => i.onchange = () => { const t = ter()[i.dataset.pvin] || (ter()[i.dataset.pvin] = {}); t.vinculo = i.value.trim(); S.save(); });
      const prDoc = anio => docTabla('Operaciones con partes relacionadas', [{ t: 'RUC', w: 13 }, { t: 'Razón social', w: 34 }, { t: 'Vínculo', w: 18 }, { t: 'Ventas', w: 15, tipo: 'gs' }, { t: 'Compras', w: 15, tipo: 'gs' }],
        C.partesRelacionadas(d, anio).map(x => [x.ruc, x.razon, x.vinculo, x.ventas, x.compras]));
      if ($('#pr-exp')) $('#pr-exp').onclick = () => { const anio = st.anio || +hoy().slice(0, 4) - 1; bajarDoc(`PARTES RELACIONADAS – EJERCICIO ${anio}`, [prDoc(anio)], `partes_relacionadas_${anio}_${slug(cliente().razon)}`); };
      $('#au-paq').onclick = () => {
        const anio = st.anio || +hoy().slice(0, 4) - 1, cm = cliente().cierreMes || 12, rg = C.rangoEjercicio(anio, cm);
        const meses = []; for (let p = rg.desde.slice(0, 7); p <= rg.hasta.slice(0, 7); p = C.mesSiguiente ? C.mesSiguiente(p) : nextP(p)) meses.push(p);
        const iva = meses.map(p => { const q = C.cuadreMes(d, p); return [nombreMes(p), q.filas[0].f120, q.filas[0].contable, q.filas[1].f120, q.filas[1].contable, q.f.k.c58]; });
        const S1 = C.saldosAl(d, A.plan, rg.hasta), sal = S1.saldo;
        const comp = A.plan.list.filter(c => c.imputable && ['A', 'P', 'PN'].includes(c.tipo) && Math.round(sal[c.codigo] || 0)).map(c => [c.codigo, c.nombre, Math.round(sal[c.codigo])]);
        const f5 = C.f500(d, A.plan, anio);
        const hojas = [
          { nombreHoja: 'IVA mensual', titulo: `IVA MENSUAL – EJERCICIO ${anio}`, subtitulo: 'Form. 120 y contabilidad', bloques: [docTabla('', [{ t: 'Mes', w: 16 }, { t: 'Débito F120', w: 15, tipo: 'gs' }, { t: 'Débito contable', w: 15, tipo: 'gs' }, { t: 'Crédito F120', w: 15, tipo: 'gs' }, { t: 'Crédito contable', w: 15, tipo: 'gs' }, { t: 'A pagar', w: 14, tipo: 'gs' }], iva)] },
          { nombreHoja: 'Saldos', titulo: `COMPOSICIÓN DE SALDOS AL ${fd(rg.hasta)}`, bloques: [docTabla('', [{ t: 'Código', w: 14 }, { t: 'Cuenta', w: 50 }, { t: 'Saldo', w: 18, tipo: 'gs' }], comp)] },
          { nombreHoja: 'Conciliación fiscal', titulo: `DEL RESULTADO CONTABLE A LA RENTA NETA – ${anio}`, bloques: [docTabla('', [{ t: 'Concepto', w: 70 }, { t: 'Importe', w: 18, tipo: 'gs' }], f5.lineas.filter(l => l.rubro === '3' && l.estilo !== 'titulo').map(l => ({ v: [l.concepto, l.monto], estilo: l.estilo === 'total' ? 'total' : '' })))] },
          { nombreHoja: 'Bienes de uso', titulo: 'BIENES DE USO', bloques: [docTabla('', [{ t: 'Bien', w: 40 }, { t: 'Alta', w: 12 }, { t: 'Valor', w: 16, tipo: 'gs' }, { t: 'Vida útil', w: 10, tipo: 'entero' }], (d.bienes || []).map(b => [b.descripcion, fd(b.fechaAlta), C.num(b.valor), C.num(b.vidaUtil)]))] },
          { nombreHoja: 'Retenciones', titulo: `RETENCIONES – EJERCICIO ${anio}`, bloques: [docTabla('', [{ t: 'Fecha', w: 11 }, { t: 'Tipo', w: 10 }, { t: 'Impuesto', w: 9 }, { t: 'RUC', w: 13 }, { t: 'Razón social', w: 30 }, { t: 'Monto', w: 14, tipo: 'gs' }],
            (d.retenciones || []).filter(r => r.fecha >= rg.desde && r.fecha <= rg.hasta).map(r => [fd(r.fecha), r.tipo, r.impuesto, r.ruc, r.razon, C.num(r.monto)]))] },
          { nombreHoja: 'Partes relacionadas', titulo: `PARTES RELACIONADAS – ${anio}`, bloques: [prDoc(anio)] }
        ];
        R.descargarDocumento({ cliente: cliente(), titulo: `PAQUETE PARA AUDITORÍA – EJERCICIO ${anio}`, hojas }, `auditoria_${anio}_${slug(cliente().razon)}`);
      };
    }
  });
  const nextP = p => { let y = +p.slice(0, 4), m = +p.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return `${y}-${C.pad(m)}`; };

  /* ======================= Beneficiarios finales ======================= */
  A.registrar('beneficiarios', 'Beneficiarios finales', 'Datos', {
    html() {
      const e = C.estadoBeneficiarios(datos(), hoy());
      return `<section class="card"><h2>Accionistas y beneficiarios finales</h2>
        <div class="form cols4"><label>Nombre y apellido / razón social <input id="bf-nom"></label><label>Documento (C.I. / RUC / pasaporte) <input id="bf-doc"></label><label>Nacionalidad <input id="bf-nac" value="Paraguaya"></label>
          <label>Participación % <input id="bf-pct" class="n"></label><label>Tipo <select id="bf-tipo"><option>Propiedad</option><option>Control</option><option>Otro</option></select></label><label>Cargo <input id="bf-car"></label>
          <label>Desde <input type="date" id="bf-des"></label><label>&nbsp;<button id="bf-ok" class="primary">Agregar</button></label></div>
        ${tabla(['Nombre', 'Documento', 'Nacionalidad', '%', 'Tipo', 'Cargo', 'Desde', ''], e.lista.map((b, i) => `<tr><td>${esc(b.nombre)}</td><td>${esc(b.doc)}</td><td>${esc(b.nac)}</td><td class="n">${String(b.pct).replace('.', ',')}</td><td>${esc(b.tipo)}</td><td>${esc(b.cargo)}</td><td>${fd(b.desde)}</td><td><button class="mini danger" data-bfx="${i}">✕</button></td></tr>`), 'Sin datos cargados')}
        <p>Participación total: <b class="${e.lista.length && Math.round(e.pct) !== 100 ? 'err' : ''}">${String(Math.round(e.pct * 100) / 100).replace('.', ',')}%</b></p>
        <div class="acciones"><label>Próxima actualización del registro <input type="date" id="bf-vto" value="${esc(e.vto)}"></label>
          ${e.alerta === 'vencido' ? '<b class="err">vencida</b>' : e.alerta === 'proximo' ? `<b>vence en ${e.dias} días</b>` : ''} <button id="bf-exp">Descargar</button></div>
      </section>`;
    },
    bind() {
      $('#bf-ok').onclick = () => {
        const b = { nombre: v('#bf-nom').trim(), doc: v('#bf-doc').trim(), nac: v('#bf-nac').trim(), pct: C.num(v('#bf-pct')), tipo: v('#bf-tipo'), cargo: v('#bf-car').trim(), desde: v('#bf-des') };
        if (!b.nombre) return toast('Ingrese el nombre', 'error');
        arr('beneficiarios').push(b); S.save(); render();
      };
      $$('[data-bfx]').forEach(x => x.onclick = () => { if (confirm('¿Eliminar?')) { arr('beneficiarios').splice(+x.dataset.bfx, 1); S.save(); render(); } });
      $('#bf-vto').onchange = e => { setCfg({ vtoBeneficiarios: e.target.value }); render(); };
      $('#bf-exp').onclick = () => bajarDoc('ACCIONISTAS Y BENEFICIARIOS FINALES', [docTabla('', [{ t: 'Nombre', w: 30 }, { t: 'Documento', w: 14 }, { t: 'Nacionalidad', w: 13 }, { t: '%', w: 8, tipo: 'texto' }, { t: 'Tipo', w: 11 }, { t: 'Cargo', w: 16 }, { t: 'Desde', w: 11 }],
        arr('beneficiarios').map(b => [b.nombre, b.doc, b.nac, String(b.pct).replace('.', ',') + '%', b.tipo, b.cargo, fd(b.desde)])), { tipo: 'firmas' }], `beneficiarios_${slug(cliente().razon)}`);
    }
  });

  /* ======================= Sueldos: IPS, Ministerio de Trabajo, aguinaldo, recibos ======================= */
  const CAMPOS_EMP = [['nroAsegurado', 'N° asegurado IPS', 10], ['sexo', 'Sexo (M/F)', 3], ['nacimiento', 'Nacimiento', 0, 'date'], ['nacionalidad', 'Nacionalidad', 10], ['estadoCivil', 'Estado civil', 8],
    ['domicilio', 'Domicilio', 16], ['cargo', 'Cargo', 12], ['hijosMenores', 'Hijos menores', 3], ['horasMes', 'Horas/mes', 4], ['salida', 'Fecha de salida', 0, 'date'], ['motivoSalida', 'Motivo de salida', 12]];
  const vSu = A.VISTAS.sueldos;
  if (vSu) A.VISTAS.sueldos = Object.assign({}, vSu, {
    html() {
      const c = cfg(), emp = arr('empleados'), anio = +st.periodo.slice(0, 4), ag = C.aguinaldo(datos(), anio);
      return vSu.html() + `<section class="card"><h2>IPS y Ministerio de Trabajo</h2>
        <div class="form cols4"><label>N° patronal IPS <input id="su-ips" value="${esc(c.nroPatronalIPS || '')}"></label><label>N° patronal Ministerio de Trabajo <input id="su-mt" value="${esc(c.nroPatronalMTESS || '')}"></label></div>
        <div class="acciones"><button id="su-pips" class="primary">Planilla IPS de ${nombreMes(st.periodo)}</button> <button id="su-rec">Recibos de salario de ${nombreMes(st.periodo)} (PDF)</button>
          <button id="su-mtess">Planillas anuales Ministerio de Trabajo ${anio}</button></div>
        <h3>Datos de los empleados</h3>
        <div class="scroll"><table class="grid"><thead><tr><th>Empleado</th>${CAMPOS_EMP.map(x => `<th>${x[1]}</th>`).join('')}</tr></thead><tbody>
        ${emp.map(e => `<tr><td>${esc(e.nombre)}</td>${CAMPOS_EMP.map(([k, , sz, ty]) => `<td><input ${ty ? `type="${ty}"` : `size="${sz}"`} data-ef="${e.id}" data-k="${k}" value="${esc(e[k] || '')}"></td>`).join('')}</tr>`).join('') || `<tr><td colspan="${CAMPOS_EMP.length + 1}" class="muted">Sin empleados</td></tr>`}</tbody></table></div>
      </section>
      <section class="card"><h2>Aguinaldo ${anio}</h2>
        ${tabla(['Empleado', 'C.I.', 'Remuneraciones del año', 'Meses con planilla', 'Aguinaldo'], ag.map(a => `<tr><td>${esc(a.nombre)}</td><td>${esc(a.ci)}</td><td class="n">${fmt(a.remuneraciones)}</td><td class="n">${a.meses}</td><td class="n"><b>${fmt(a.aguinaldo)}</b></td></tr>`), 'Sin empleados')}
        <div class="acciones"><button id="su-agx">Descargar liquidación</button> <button id="su-agr">Recibos de aguinaldo (PDF)</button></div>
      </section>`;
    },
    bind() {
      vSu.bind();
      const d = datos(), anio = +st.periodo.slice(0, 4), c = cfg(), cli = cliente();
      $('#su-ips').onchange = e => setCfg({ nroPatronalIPS: e.target.value.trim() });
      $('#su-mt').onchange = e => setCfg({ nroPatronalMTESS: e.target.value.trim() });
      $$('[data-ef]').forEach(i => i.onchange = () => { const e = arr('empleados').find(x => x.id === i.dataset.ef); if (e) { e[i.dataset.k] = i.value.trim(); S.save(); } });
      $('#su-pips').onclick = () => {
        const p = C.planillaIPS(d, st.periodo); if (!p) return toast('Primero genere la planilla del mes', 'error');
        bajarDoc(`PLANILLA IPS – ${nombreMes(st.periodo).toUpperCase()}`, [docTabla('', [{ t: 'N° patronal', w: 12 }, { t: 'C.I.', w: 11 }, { t: 'N° asegurado', w: 12 }, { t: 'Nombre', w: 30 }, { t: 'Días', w: 6, tipo: 'entero' }, { t: 'Salario imponible', w: 15, tipo: 'gs' }, { t: `Obrero ${c.pctIPSObrero}%`, w: 13, tipo: 'gs' }, { t: `Patronal ${c.pctIPSPatronal}%`, w: 13, tipo: 'gs' }, { t: 'Total', w: 14, tipo: 'gs' }],
          p.filas.map(f => [f.nroPatronal, f.ci, f.asegurado, f.nombre, f.dias, f.salario, f.obrero, f.patronal, f.total]).concat([{ v: ['', '', '', 'TOTALES', '', p.t.salario, p.t.obrero, p.t.patronal, p.t.total], estilo: 'total' }]))],
          `planilla_IPS_${st.periodo}_${slug(cli.razon)}`);
      };
      $('#su-rec').onclick = () => {
        const r = C.recibosSalario(d, st.periodo); if (!r.length) return toast('Primero genere la planilla del mes', 'error');
        R.recibosPDF(cli, r.map(x => Object.assign(x, { periodoTxt: nombreMes(st.periodo) })), { titulo: 'RECIBO DE SALARIO', nroPatronal: c.nroPatronalIPS }, `recibos_${st.periodo}_${slug(cli.razon)}`);
      };
      $('#su-agr').onclick = () => {
        const ag = C.aguinaldo(d, anio).filter(a => a.aguinaldo); if (!ag.length) return toast('Sin aguinaldos para el año', 'error');
        const emp = id => arr('empleados').find(e => e.id === id) || {};
        R.recibosPDF(cli, ag.map(a => ({ nombre: a.nombre, ci: a.ci, cargo: emp(a.empId).cargo || '', periodoTxt: `Aguinaldo ${anio}`, haberes: [[`Aguinaldo (remuneraciones ${fmt(a.remuneraciones)} / 12)`, a.aguinaldo]], descuentos: [], neto: a.aguinaldo })),
          { titulo: 'RECIBO DE AGUINALDO', nroPatronal: c.nroPatronalIPS }, `recibos_aguinaldo_${anio}_${slug(cli.razon)}`);
      };
      $('#su-agx').onclick = () => bajarDoc(`LIQUIDACIÓN DE AGUINALDO ${anio}`, [docTabla('', [{ t: 'Empleado', w: 30 }, { t: 'C.I.', w: 12 }, { t: 'Remuneraciones', w: 16, tipo: 'gs' }, { t: 'Meses', w: 7, tipo: 'entero' }, { t: 'Aguinaldo', w: 16, tipo: 'gs' }],
        C.aguinaldo(d, anio).map(a => [a.nombre, a.ci, a.remuneraciones, a.meses, a.aguinaldo])), { tipo: 'firmas' }], `aguinaldo_${anio}_${slug(cli.razon)}`);
      $('#su-mtess').onclick = () => {
        const m = C.planillasMTESS(d, anio), np = c.nroPatronalMTESS || '';
        const hojas = [
          { nombreHoja: 'Empleados y obreros', titulo: `PLANILLA DE EMPLEADOS Y OBREROS – ${anio}`, subtitulo: `N° patronal: ${np}`, orientacion: 'landscape', bloques: [docTabla('', [{ t: 'C.I.', w: 10 }, { t: 'Nombre', w: 24 }, { t: 'Sexo', w: 5 }, { t: 'Estado civil', w: 9 }, { t: 'Nacimiento', w: 10 }, { t: 'Nacionalidad', w: 10 }, { t: 'Domicilio', w: 18 }, { t: 'Hijos menores', w: 7, tipo: 'texto' }, { t: 'Cargo', w: 12 }, { t: 'Ingreso', w: 10 }, { t: 'Salida', w: 10 }, { t: 'Motivo salida', w: 12 }],
            m.empleados.map(({ e }) => [e.ci, e.nombre, e.sexo || '', e.estadoCivil || '', fd(e.nacimiento), e.nacionalidad || '', e.domicilio || '', String(e.hijosMenores || ''), e.cargo || '', fd(e.ingreso), fd(e.salida), e.motivoSalida || '']))] },
          { nombreHoja: 'Sueldos y jornales', titulo: `PLANILLA DE SUELDOS Y JORNALES – ${anio}`, subtitulo: `N° patronal: ${np}`, orientacion: 'landscape', bloques: [docTabla('', [{ t: 'C.I.', w: 10 }, { t: 'Nombre', w: 22 }].concat(MESES.map(x => ({ t: x.slice(0, 3), w: 11, tipo: 'gs' })), [{ t: 'Aguinaldo', w: 12, tipo: 'gs' }, { t: 'Horas', w: 8, tipo: 'entero' }, { t: 'Total', w: 13, tipo: 'gs' }]),
            m.sueldos.map(s => [s.e.ci, s.e.nombre].concat(s.meses, [s.aguinaldo, s.horas, s.total])))] },
          { nombreHoja: 'Resumen general', titulo: `RESUMEN GENERAL DE PERSONAS OCUPADAS – ${anio}`, subtitulo: `N° patronal: ${np}`, bloques: [docTabla('', [{ t: 'Concepto', w: 50 }, { t: 'Cantidad / importe', w: 20, tipo: 'gs' }],
            [['Varones', m.resumen.varones], ['Mujeres', m.resumen.mujeres], ['Menores varones', m.resumen.menoresVarones], ['Menores mujeres', m.resumen.menoresMujeres], { v: ['Total de personas ocupadas', m.resumen.total], estilo: 'total' },
              ['Ingresos en el año', m.resumen.ingresos], ['Salidas en el año', m.resumen.salidas], ['Horas trabajadas', m.resumen.horas], ['Sueldos y jornales pagados', m.resumen.sueldos], ['Aguinaldos pagados', m.resumen.aguinaldos]])] }
        ];
        R.descargarDocumento({ cliente: cli, titulo: `PLANILLAS MINISTERIO DE TRABAJO ${anio}`, hojas }, `MTESS_${anio}_${slug(cli.razon)}`);
      };
    }
  });

  /* ======================= Conciliación bancaria: recordar contrapartidas ======================= */
  const vBa = A.VISTAS.bancos;
  const palabras = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  if (vBa) A.VISTAS.bancos = Object.assign({}, vBa, {
    bind() {
      const mem = () => obj('memoriaBanco');
      $$('[data-bc]').forEach(i => {
        const fila = i.closest('tr'), desc = fila ? fila.children[1].textContent : '';
        const votos = {}; palabras(desc).forEach(w => { const c = mem()[w]; if (c) votos[c] = (votos[c] || 0) + 1; });
        const mejor = Object.keys(votos).sort((a, b) => votos[b] - votos[a])[0];
        if (mejor && !i.value) { i.value = mejor; i.classList.add('sugerido'); i.title = 'Sugerida por movimientos anteriores'; }
      });
      vBa.bind();
      $$('[data-bok]').forEach(b => { const o = b.onclick; b.onclick = ev => {
        const i = $(`[data-bc="${b.dataset.bok}"]`), fila = b.closest('tr'), desc = fila ? fila.children[1].textContent : '';
        if (i && i.value.trim()) { palabras(desc).forEach(w => { mem()[w] = i.value.trim(); }); S.save(); }
        o && o.call(b, ev);
      }; });
    }
  });

  /* ======================= XML arrastrados a cualquier pantalla ======================= */
  document.addEventListener('dragover', e => { if (S.cliente() && e.dataTransfer && Array.from(e.dataTransfer.items || []).some(x => x.kind === 'file')) { e.preventDefault(); document.body.classList.add('arrastrando'); } });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('arrastrando'); });
  document.addEventListener('drop', async e => {
    document.body.classList.remove('arrastrando');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /\.xml$/i.test(f.name));
    if (!files.length || !S.cliente()) return;
    e.preventDefault();
    const comp = [], vent = [], errs = [];
    for (const f of files) { try { const r = C.parseSifenXML(await f.text(), cliente().ruc); (r.esCompra ? comp : vent).push(r.doc); } catch (err) { errs.push(`${f.name}: ${err.message}`); } }
    const rc = A.incorporarDocs(comp, true), rv = A.incorporarDocs(vent, false); S.save();
    toast(`XML: ${rc.ok} compras y ${rv.ok} ventas cargadas${rc.dup + rv.dup ? ` · ${rc.dup + rv.dup} duplicados` : ''}${errs.length ? ` · ${errs.length} con error` : ''}`, errs.length ? 'error' : undefined);
    render();
  });

  /* ======================= Calendario de todos los clientes ======================= */
  function opcionesVto(cli) {
    const d = S.db().data[cli.id] || {}, c = C.config(d);
    return { regimen: c.regimenIRE, mesesAnticiposIRE: c.mesesAnticiposIRE, mesesVtoIRE: c.mesesVtoIRE, ips: (d.empleados || []).length > 0,
      retenciones: (d.retenciones || []).some(r => r.tipo === 'EMITIDA') || (d.dividendos || []).length > 0, irp: c.rg90ImputaIRP === 'S' };
  }
  function itemsDelMes(periodo) {
    const y = +periodo.slice(0, 4), out = [];
    S.db().clientes.forEach(c => {
      [y - 1, y].forEach(a => C.vencimientos(c.ruc, a, c.cierreMes, opcionesVto(c)).items.filter(x => x.fecha.slice(0, 7) === periodo).forEach(x => out.push(Object.assign({ cliente: c.razon, cid: c.id }, x))));
      const d = S.db().data[c.id] || {}, cf = C.config(d);
      if (cf.vtoBeneficiarios && cf.vtoBeneficiarios.slice(0, 7) === periodo) out.push({ fecha: cf.vtoBeneficiarios, obligacion: 'Beneficiarios finales – actualización', periodo: '', cliente: c.razon, cid: c.id });
    });
    const vistos = new Set();
    return out.filter(x => { const k = `${x.cid}|${x.fecha}|${x.obligacion}|${x.periodo}`; if (vistos.has(k)) return false; vistos.add(k); return true; }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  A.registrar('calendario', 'Calendario de vencimientos', 'Inicio', {
    html() {
      const p = st.periodoCal || hoy().slice(0, 7), y = +p.slice(0, 4), m = +p.slice(5, 7);
      const items = itemsDelMes(p), fer = C.feriados(y);
      const primero = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const celdas = [];
      for (let i = 0; i < (primero + 6) % 7; i++) celdas.push('<td class="vacio"></td>');
      for (let dd = 1; dd <= dias; dd++) {
        const f = `${p}-${C.pad(dd)}`, pq = C.pascua(y), santo = f === C.addDias(pq, -3) ? 'Jueves Santo' : f === C.addDias(pq, -2) ? 'Viernes Santo' : '', dw = new Date(f + 'T00:00:00Z').getUTCDay(), its = items.filter(x => x.fecha === f), esFer = fer.includes(f);
        celdas.push(`<td class="${dw === 0 || dw === 6 ? 'finde' : ''} ${esFer ? 'feriado' : ''} ${f === hoy() ? 'hoy' : ''}"><div class="dia">${dd}${esFer ? ` <small>${esc(santo || C.NOMBRE_FERIADO[f.slice(5)] || 'Feriado')}</small>` : ''}</div>${its.map(x => `<div class="vto" title="${esc(x.cliente)} · ${esc(x.obligacion)} ${esc(x.periodo || '')}"><b>${esc((x.cliente || '').split(' ')[0])}</b> ${esc(x.obligacion.replace(/ – .*/, ''))}</div>`).join('')}</td>`);
      }
      while (celdas.length % 7) celdas.push('<td class="vacio"></td>');
      const semanas = []; for (let i = 0; i < celdas.length; i += 7) semanas.push(`<tr>${celdas.slice(i, i + 7).join('')}</tr>`);
      return `<section class="card"><h2>Calendario de vencimientos – todos los clientes</h2>
        <div class="acciones"><button id="ca-ant" class="mini">‹</button> <label><input type="month" id="ca-per" value="${p}"></label> <button id="ca-sig" class="mini">›</button> <button id="ca-exp">Descargar</button></div>
        <table class="calendario"><thead><tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${semanas.join('')}</tbody></table>
        <h3>Detalle</h3>${tabla(['Fecha', 'Cliente', 'Obligación', 'Período'], items.map(x => `<tr class="${x.fecha < hoy() ? 'muted' : ''}"><td>${fd(x.fecha)}</td><td>${esc(x.cliente)}</td><td>${esc(x.obligacion)}</td><td>${esc(x.periodo || '')}</td></tr>`), 'Sin vencimientos en el mes')}
      </section>`;
    },
    bind() {
      const p = st.periodoCal || hoy().slice(0, 7);
      const mover = k => { let y = +p.slice(0, 4), m = +p.slice(5, 7) + k; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } st.periodoCal = `${y}-${C.pad(m)}`; render(); };
      $('#ca-ant').onclick = () => mover(-1); $('#ca-sig').onclick = () => mover(1);
      $('#ca-per').onchange = e => { if (e.target.value) { st.periodoCal = e.target.value; render(); } };
      $('#ca-exp').onclick = () => R.descargarDocumento({ cliente: { razon: 'Estudio contable', ruc: '' }, titulo: `VENCIMIENTOS – ${nombreMes(p).toUpperCase()}`, bloques: [docTabla('', [{ t: 'Fecha', w: 11 }, { t: 'Cliente', w: 30 }, { t: 'Obligación', w: 40 }, { t: 'Período', w: 16 }], itemsDelMes(p).map(x => [fd(x.fecha), x.cliente, x.obligacion, x.periodo || '']))] }, `vencimientos_${p}`);
    }
  });

  /* ======================= Informe mensual para el cliente ======================= */
  A.registrar('informe', 'Informe mensual para el cliente', 'Informes', {
    html() {
      let r = null; try { r = C.informeMensual(datos(), A.plan, st.periodo); } catch (e) { r = null; }
      if (!r) return '<section class="card"><h2>Informe mensual</h2><div class="alerta">No se pudo calcular el informe.</div></section>';
      const kpi = (t, x, cls) => `<div class="kpi ${cls || ''}"><span>${t}</span><b>${fmt(x)}</b></div>`;
      return `<section class="card"><h2>Informe mensual – ${nombreMes(st.periodo)}</h2>
        <div class="acciones">${perSel()} <button id="im-exp" class="primary">Descargar para el cliente (PDF o Excel)</button></div>
        <div class="kpis">${kpi('Ventas', r.ventas.total)}${kpi('Compras', r.compras.total)}${r.iva.aPagar ? kpi('IVA a pagar', r.iva.aPagar, 'pagar') : kpi('IVA saldo a favor', r.iva.saldoFavor, 'favor')}${kpi('Resultado del mes', r.resultado.neto, r.resultado.neto < 0 ? 'pagar' : 'favor')}</div>
        ${tabla(['Disponibilidades al cierre', 'Saldo'], r.fondos.map(f => `<tr><td>${esc(f.nombre)}</td><td class="n">${fmt(f.saldo)}</td></tr>`), 'Sin saldos')}
        ${tabla(['Cuentas corrientes', 'Saldo'], [`<tr><td>Por cobrar a clientes</td><td class="n">${fmt(r.porCobrar)}</td></tr>`, `<tr><td>Por pagar a proveedores</td><td class="n">${fmt(r.porPagar)}</td></tr>`])}
      </section>`;
    },
    bind() {
      bindPer();
      $('#im-exp').onclick = () => {
        const r = C.informeMensual(datos(), A.plan, st.periodo), g = { w: 18, tipo: 'gs' };
        bajarDoc(`INFORME MENSUAL – ${nombreMes(st.periodo).toUpperCase()}`, [
          docTabla('Ventas y compras del mes', [{ t: 'Concepto', w: 40 }, Object.assign({ t: 'Ventas' }, g), Object.assign({ t: 'Compras' }, g)],
            [['Gravado 10%', r.ventas.g10, r.compras.g10], ['Gravado 5%', r.ventas.g5, r.compras.g5], ['Exento', r.ventas.exenta, r.compras.exenta], ['IVA incluido', r.ventas.iva, r.compras.iva], { v: ['TOTAL', r.ventas.total, r.compras.total], estilo: 'total' }, { v: ['Cantidad de comprobantes', r.ventas.cantidad, r.compras.cantidad], estilo: 'nota' }]),
          docTabla('IVA del mes', [{ t: 'Concepto', w: 40 }, Object.assign({ t: 'Importe' }, g)],
            [['IVA débito (ventas)', r.iva.debito], ['IVA crédito (compras)', r.iva.credito], { v: [r.iva.aPagar ? 'IVA A PAGAR' : 'SALDO A FAVOR', r.iva.aPagar || r.iva.saldoFavor], estilo: 'total' }]),
          docTabla('Resultado del mes', [{ t: 'Concepto', w: 40 }, Object.assign({ t: 'Importe' }, g)],
            [['Ingresos', r.resultado.ingresos], ['Costos y gastos', r.resultado.egresos], { v: [r.resultado.neto >= 0 ? 'GANANCIA DEL MES' : 'PÉRDIDA DEL MES', r.resultado.neto], estilo: 'total' }]),
          docTabla('Disponibilidades al cierre', [{ t: 'Cuenta', w: 40 }, Object.assign({ t: 'Saldo' }, g)], r.fondos.map(f => [f.nombre, f.saldo]).concat([{ v: ['TOTAL', r.fondos.reduce((s, f) => s + f.saldo, 0)], estilo: 'total' }])),
          docTabla('Cuentas corrientes', [{ t: 'Concepto', w: 40 }, Object.assign({ t: 'Saldo' }, g)], [['Por cobrar a clientes', r.porCobrar], ['Por pagar a proveedores', r.porPagar]]),
          { tipo: 'firmas' }
        ], `informe_${st.periodo}_${slug(cliente().razon)}`);
      };
    }
  });

  /* ======================= Administración del estudio ======================= */
  A.registrar('estudio', 'Honorarios y tareas', 'Inicio', {
    html() {
      const p = st.periodo, cls = S.db().clientes;
      const filas = cls.map(c => {
        const h = C.estadoHonorarios(c, hoy().slice(0, 7)), d = S.db().data[c.id] || {}, cf = C.config(d);
        const enMes = x => x.fecha && x.fecha.slice(0, 7) === p;
        const t = [['V', (d.ventas || []).some(enMes)], ['C', (d.compras || []).some(enMes)], ['RG90', !!((d.rg90Generado || {})[p])], ['Cierre', !!(cf.cerradoHasta && cf.cerradoHasta >= C.finDeMes(p))]];
        return `<tr><td>${esc(c.razon)}</td><td>${t.map(([k, ok]) => `<span class="tarea ${ok ? 'ok' : 'pend'}">${k}</span>`).join(' ')}</td>
          <td><input class="n" data-hon="${c.id}" value="${h.honorario ? fmt(h.honorario) : ''}" size="10"></td><td><input type="month" data-hdes="${c.id}" value="${esc(c.honorariosDesde || '')}"></td>
          <td class="n">${fmt(h.devengado)}</td><td class="n">${fmt(h.cobrado)}</td><td class="n ${h.saldo > 0 ? 'err' : ''}">${fmt(h.saldo)}</td><td class="n">${h.mesesAdeudados}</td></tr>`;
      });
      const cobros = cls.flatMap(c => (c.cobrosHonorarios || []).map((x, i) => Object.assign({ cliente: c.razon, cid: c.id, i }, x))).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40);
      return `<section class="card"><h2>Clientes del estudio – ${nombreMes(p)}</h2>
        <div class="acciones">${perSel()} <span class="muted">V ventas · C compras · RG90 archivo generado · Cierre período cerrado</span></div>
        ${tabla(['Cliente', 'Tareas del mes', 'Honorario mensual', 'Desde', 'Devengado', 'Cobrado', 'Saldo', 'Meses adeudados'], filas, 'Sin clientes')}
      </section>
      <section class="card"><h2>Cobro de honorarios</h2>
        <div class="form cols4"><label>Cliente <select id="ho-cli">${cls.map(c => `<option value="${c.id}">${esc(c.razon)}</option>`).join('')}</select></label><label>Fecha <input type="date" id="ho-fec" value="${hoy()}"></label>
          <label>Monto <input id="ho-mon" class="n"></label><label>Nota <input id="ho-not" placeholder="recibo, mes…"></label></div>
        <div class="acciones"><button id="ho-ok" class="primary">Registrar cobro</button> <button id="ho-exp">Descargar estado de honorarios</button></div>
        ${tabla(['Fecha', 'Cliente', 'Monto', 'Nota', ''], cobros.map(x => `<tr><td>${fd(x.fecha)}</td><td>${esc(x.cliente)}</td><td class="n">${fmt(x.monto)}</td><td>${esc(x.nota || '')}</td><td><button class="mini danger" data-hox="${x.cid}|${x.i}">✕</button></td></tr>`), 'Sin cobros registrados')}
      </section>`;
    },
    bind() {
      bindPer();
      const cli = id => S.db().clientes.find(c => c.id === id);
      $$('[data-hon]').forEach(i => i.onchange = () => { cli(i.dataset.hon).honorario = C.num(i.value); S.save(); render(); });
      $$('[data-hdes]').forEach(i => i.onchange = () => { cli(i.dataset.hdes).honorariosDesde = i.value; S.save(); render(); });
      $('#ho-ok').onclick = () => {
        const c = cli(v('#ho-cli')), monto = C.num(v('#ho-mon'));
        if (!c || !monto) return toast('Elija el cliente e ingrese el monto', 'error');
        (c.cobrosHonorarios || (c.cobrosHonorarios = [])).push({ fecha: v('#ho-fec'), monto, nota: v('#ho-not').trim() }); S.save(); toast('Cobro registrado'); render();
      };
      $$('[data-hox]').forEach(b => b.onclick = () => { const [id, i] = b.dataset.hox.split('|'); if (confirm('¿Eliminar el cobro?')) { cli(id).cobrosHonorarios.splice(+i, 1); S.save(); render(); } });
      $('#ho-exp').onclick = () => R.descargarDocumento({ cliente: { razon: 'Estudio contable', ruc: '' }, titulo: `ESTADO DE HONORARIOS AL ${fd(hoy())}`, bloques: [docTabla('', [{ t: 'Cliente', w: 34 }, { t: 'Mensual', w: 14, tipo: 'gs' }, { t: 'Devengado', w: 15, tipo: 'gs' }, { t: 'Cobrado', w: 15, tipo: 'gs' }, { t: 'Saldo', w: 15, tipo: 'gs' }, { t: 'Meses', w: 8, tipo: 'entero' }],
        S.db().clientes.map(c => { const h = C.estadoHonorarios(c, hoy().slice(0, 7)); return [c.razon, h.honorario, h.devengado, h.cobrado, h.saldo, h.mesesAdeudados]; }))] }, `honorarios_${hoy()}`);
    }
  });

  /* ======================= Alertas adicionales en Inicio ======================= */
  A.alertasExtra = function (e, periodo) {
    const d = e.d, out = [], h = hoy();
    const b = C.estadoBeneficiarios(d, h);
    if (b.alerta === 'vencido') out.push(['error', 'Venció la actualización del registro de beneficiarios finales.', 'beneficiarios']);
    else if (b.alerta === 'proximo') out.push(['aviso', `La actualización de beneficiarios finales vence en ${b.dias} días.`, 'beneficiarios']);
    if (C.regimenIRE(d) === 'GENERAL') {
      try {
        const an = C.anticiposIRE(d, A.plan, +h.slice(0, 4), d.cliente && d.cliente.ruc), pend = an.cuotas.filter(c => !c.pagado && c.monto);
        const venc = pend.filter(c => c.fecha < h), prox = pend.filter(c => c.fecha >= h && c.fecha <= C.addDias(h, 10));
        if (venc.length) out.push(['error', `${venc.length === 1 ? `Anticipo ${venc[0].n} de IRE vencido` : `${venc.length} anticipos de IRE vencidos`} sin marcar como pagado${venc.length === 1 ? '' : 's'} (Gs. ${fmt(venc.reduce((s, c) => s + c.monto, 0))}).`, 'f500']);
        prox.forEach(c => out.push(['aviso', `Anticipo ${c.n} de IRE (Gs. ${fmt(c.monto)}) vence el ${fd(c.fecha)}.`, 'f500']));
      } catch (err) { /* */ }
    }
    const tim = C.controlTimbrados(d, periodo).filter(t => /vencido|anterior/.test(t.motivo));
    if (tim.length) out.push(['error', `${tim.length} compra${tim.length === 1 ? '' : 's'} con timbrado fuera de vigencia.`, 'cuadre']);
    try { const au = C.controlAuditoria(d, +h.slice(0, 4)); if (au.obligado) out.push(['info', 'Por sus ingresos del ejercicio anterior, el cliente requiere auditoría impositiva.', 'auditoria']); } catch (err) { /* */ }
    try { const q = C.cuadreMes(d, periodo); if (q.filas.some(f => f.difF120 || f.difCont)) out.push(['aviso', 'El libro IVA, el Form. 120 y la contabilidad no coinciden este mes.', 'cuadre']); } catch (err) { /* */ }
    return out;
  };

  /* ======================= Menú ======================= */
  const M = A.MENU, sec = (menu, nombre) => { const m = M.find(x => x[0] === menu); return m && m[2].find(s => s[0] === nombre); };
  const agregar = (menu, seccion, claves) => { const m = M.find(x => x[0] === menu); if (!m) return; const s = sec(menu, seccion); if (s) s[1].push(...claves); else m[2].push([seccion, claves]); };
  agregar('Cliente', 'Datos y configuración', ['beneficiarios']);
  agregar('Impuestos', 'IRE – Renta empresarial', ['auditoria']);
  agregar('Impuestos', 'Antes de presentar', ['cuadre', 'terceros']);
  agregar('Informes', 'Para el cliente', ['informe']);
  M.push(['Estudio', '', [['Agenda', ['calendario']], ['Administración', ['estudio']]]]);
  Object.assign(A.DESC, {
    beneficiarios: 'Accionistas, beneficiarios y su actualización', auditoria: 'Umbral, paquete para el auditor, partes relacionadas',
    cuadre: 'Libro IVA vs Form. 120 vs contabilidad, RUC y timbrados', terceros: 'Lo informado por proveedores y clientes en Marangatu',
    informe: 'Resumen del mes en PDF para el cliente', calendario: 'Vencimientos de todos los clientes en un calendario', estudio: 'Honorarios, cobros y tareas por cliente'
  });
})();
