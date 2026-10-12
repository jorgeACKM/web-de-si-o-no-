/* Importación y exportación Excel (SheetJS). */
(function (root) {
  'use strict';
  const X = {};
  const C = root.Conta;

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]/g, '');

  X.leerArchivo = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = e => {
        try { resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true })); }
        catch (err) { reject(err); }
      };
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
  };
  X.filas = (wb, hoja) => XLSX.utils.sheet_to_json(wb.Sheets[hoja || wb.SheetNames[0]], { header: 1, raw: true, defval: '' });

  // Busca la fila de encabezados y mapea columnas según alias.
  function mapear(filas, alias) {
    for (let r = 0; r < Math.min(filas.length, 15); r++) {
      const h = filas[r].map(norm);
      const map = {};
      Object.keys(alias).forEach(k => {
        const i = h.findIndex(x => alias[k].some(a => x === a || (a.length > 3 && x.startsWith(a))));
        if (i >= 0) map[k] = i;
      });
      if (Object.keys(map).length >= 2) return { map, desde: r + 1 };
    }
    return null;
  }
  const siNo = v => /^(s|si|x|1|true|verdadero)$/i.test(norm(v));

  /* ---------- Plan de cuentas ---------- */
  const ALIAS_PLAN = {
    codigo: ['codigo', 'cod', 'cuenta', 'nrocuenta', 'numerocuenta', 'codcuenta'],
    nombre: ['nombre', 'descripcion', 'denominacion', 'nombrecuenta', 'detalle'],
    nivel: ['nivel'],
    imputable: ['imputable', 'asentable', 'imp'],
    tipo: ['tipo', 'naturaleza'],
    rg49: ['rubrorg49', 'rg49', 'rubro'],
    noDeducible: ['nodeducible', 'nodeducibleire', 'nd'],
    noGravado: ['nogravado', 'nogravadoire', 'ng']
  };
  X.importarPlan = function (wb) {
    const filas = X.filas(wb);
    const m = mapear(filas, ALIAS_PLAN);
    if (m && m.map.nombre === undefined) { // "Código | Cuenta": la columna Cuenta es el nombre
      const i = filas[m.desde - 1].map(norm).findIndex((x, j) => x === 'cuenta' && j !== m.map.codigo);
      if (i >= 0) m.map.nombre = i;
    }
    if (!m || m.map.codigo === undefined || m.map.nombre === undefined) throw new Error('No se encontraron las columnas "Código" y "Nombre" en la primera hoja.');
    const claves = new Set(root.PlanDefault.RUBROS_RG49.map(r => r.key));
    const out = [];
    for (let r = m.desde; r < filas.length; r++) {
      const f = filas[r], g = k => m.map[k] !== undefined ? f[m.map[k]] : '';
      const codigo = String(g('codigo')).trim();
      if (!codigo) continue;
      const rg = String(g('rg49')).trim().toUpperCase();
      const tipo = String(g('tipo')).trim().toUpperCase();
      out.push({
        codigo, nombre: String(g('nombre')).trim(),
        nivel: g('nivel') ? +g('nivel') : undefined,
        imputable: m.map.imputable !== undefined ? siNo(g('imputable')) : undefined,
        tipo: /^(A|P|PN|I|E)$/.test(tipo) ? tipo : undefined,
        rg49: claves.has(rg) ? rg : '',
        noDeducible: siNo(g('noDeducible')), noGravado: siNo(g('noGravado'))
      });
    }
    if (!out.length) throw new Error('El archivo no contiene cuentas.');
    return out;
  };

  /* ---------- Comprobantes ---------- */
  X.COLS_VENTAS = ['Fecha', 'Tipo', 'Timbrado', 'Número', 'RUC', 'Razón social', 'Condición', 'Gravada 10% (IVA incl.)', 'Gravada 5% (IVA incl.)', 'Exenta', 'Exportación', 'Cuenta', 'Concepto'];
  X.COLS_COMPRAS = ['Fecha', 'Tipo', 'Timbrado', 'Número', 'RUC', 'Razón social', 'Condición', 'Gravada 10% (IVA incl.)', 'Gravada 5% (IVA incl.)', 'Exenta', 'Afectación', 'Cuenta', 'Concepto'];
  const ALIAS_DOC = {
    fecha: ['fecha', 'fechaemision'], tipoDoc: ['tipo', 'tipocomprobante', 'tipodoc'], timbrado: ['timbrado'],
    numero: ['numero', 'nro', 'nrocomprobante', 'numerocomprobante', 'comprobante'],
    ruc: ['ruc', 'rucci', 'documento'], razon: ['razonsocial', 'razon', 'nombre', 'proveedor', 'cliente'],
    condicion: ['condicion', 'condicionventa', 'condicioncompra'],
    g10: ['gravada10', 'gravada10%', 'gravada10%ivaincl', 'gravadas10', 'monto10', '10%'],
    g5: ['gravada5', 'gravada5%', 'gravada5%ivaincl', 'gravadas5', 'monto5', '5%'],
    exenta: ['exenta', 'exentas', 'nogravada'], exportacion: ['exportacion', 'exportaciones'],
    afectacion: ['afectacion', 'imputacioniva'], cuenta: ['cuenta', 'codcuenta', 'cuentacontable'], concepto: ['concepto', 'descripcion', 'detalle']
  };
  X.tipoDoc = function (v) {
    const s = norm(v);
    if (!s || s.startsWith('fac')) return 'FACTURA';
    if (s.startsWith('nc') || s.includes('credito')) return 'NOTA_CREDITO';
    if (s.startsWith('desp') || s.includes('import')) return 'DESPACHO';
    if (s.startsWith('auto')) return 'AUTOFACTURA';
    if (s.startsWith('bol')) return 'BOLETA';
    return 'FACTURA';
  };
  X.condicion = v => /^cr/i.test(norm(v)) ? 'CREDITO' : 'CONTADO';
  X.afectacion = v => { const s = norm(v); return s.startsWith('ex') ? 'EXENTA' : (s.startsWith('mix') || s.startsWith('ind') || s.startsWith('pro')) ? 'MIXTA' : 'GRAVADA'; };

  function filaADoc(get, esCompra) {
    return {
      fecha: C.parseFecha(get('fecha')), tipoDoc: X.tipoDoc(get('tipoDoc')),
      timbrado: String(get('timbrado') || '').trim(), numero: C.formatearNumeroComprobante(get('numero')),
      ruc: C.normalizarRuc(get('ruc')), razon: String(get('razon') || '').trim(),
      condicion: X.condicion(get('condicion')),
      g10: C.r0(get('g10')), g5: C.r0(get('g5')), exenta: C.r0(get('exenta')),
      exportacion: esCompra ? 0 : C.r0(get('exportacion')),
      afectacion: esCompra ? X.afectacion(get('afectacion')) : undefined,
      cuenta: String(get('cuenta') || '').trim(), concepto: String(get('concepto') || '').trim()
    };
  }
  X.importarComprobantes = function (filas, esCompra) {
    let m = mapear(filas, ALIAS_DOC);
    if (!m || m.map.fecha === undefined) { // sin encabezado: orden de la plantilla
      const cols = esCompra
        ? ['fecha', 'tipoDoc', 'timbrado', 'numero', 'ruc', 'razon', 'condicion', 'g10', 'g5', 'exenta', 'afectacion', 'cuenta', 'concepto']
        : ['fecha', 'tipoDoc', 'timbrado', 'numero', 'ruc', 'razon', 'condicion', 'g10', 'g5', 'exenta', 'exportacion', 'cuenta', 'concepto'];
      m = { map: {}, desde: 0 }; cols.forEach((k, i) => { m.map[k] = i; });
    }
    const docs = [], errores = [];
    for (let r = m.desde; r < filas.length; r++) {
      const f = filas[r];
      if (!f || f.every(x => x === '' || x === null || x === undefined)) continue;
      const get = k => m.map[k] !== undefined ? f[m.map[k]] : '';
      const d = filaADoc(get, esCompra);
      if (!d.fecha) { errores.push(`Fila ${r + 1}: fecha inválida`); continue; }
      if (!(d.g10 || d.g5 || d.exenta || d.exportacion)) { errores.push(`Fila ${r + 1}: sin importes`); continue; }
      docs.push(d);
    }
    return { docs, errores };
  };
  X.pegadoAFilas = txt => txt.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.split('\t'));

  /* ---------- Exportación ---------- */
  const FMT_GS = '#,##0;[Red](#,##0);"-"';
  const FMT_USD = '#,##0.00;[Red](#,##0.00);"-"';
  // aoa: matriz de valores; opts.usdCols: índices de columnas en USD; opts.pctCols
  X.hoja = function (aoa, opts) {
    opts = opts || {};
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) for (let Ci = range.s.c; Ci <= range.e.c; Ci++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: Ci })];
      if (cell && cell.t === 'n') {
        if (Object.is(cell.v, -0)) cell.v = 0;
        cell.z = (opts.pctCols || []).includes(Ci) ? '0.00%' : (opts.usdCols || []).includes(Ci) ? FMT_USD : FMT_GS;
      }
    }
    ws['!cols'] = (opts.anchos || []).map(w => ({ wch: w }));
    if (opts.merges) ws['!merges'] = opts.merges;
    return ws;
  };
  X.descargar = function (hojas, nombre) {
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => XLSX.utils.book_append_sheet(wb, h.ws, h.nombre.slice(0, 31)));
    XLSX.writeFile(wb, nombre);
  };
  X.encabezado = (cli, titulo, extra) => [
    [cli.razon || ''], [`RUC: ${cli.ruc || ''}`], [titulo], ...(extra ? [[extra]] : []), []
  ];

  root.ExcelIO = X;
})(window);
