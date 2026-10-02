import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ajustarAHabil, avisosFiscales, configFiscal, modeloActivo, periodoFiscal, ultimoTrimestreCerrado, vencimientos, festivosNacionales } from './calendario.ts'
import { analizarNumero, calcularLibros, estructuraPaquete, nombreSeguro, numerosGasto } from './libros.ts'

test('días inhábiles: fin de semana y festivos nacionales (incluido Viernes Santo)', () => {
    assert.equal(ajustarAHabil('2026-10-20'), '2026-10-20')       // martes
    assert.equal(ajustarAHabil('2027-01-30'), '2027-02-01')       // sábado → lunes
    assert.equal(ajustarAHabil('2026-12-20'), '2026-12-21')       // domingo → lunes
    assert.ok(festivosNacionales(2026).has('2026-04-03'))         // Viernes Santo 2026
    assert.ok(festivosNacionales(2025).has('2025-04-18'))         // Viernes Santo 2025
    assert.equal(ajustarAHabil('2026-10-12'), '2026-10-13')       // Fiesta Nacional
})

test('periodos fiscales', () => {
    const t = periodoFiscal('2026-3T')!
    assert.deepEqual([t.desde, t.hasta, t.tipo], ['2026-07-01', '2026-09-30', 'trimestre'])
    assert.equal(t.carpeta, '2026-3T (julio a septiembre)')
    assert.equal(periodoFiscal('2024-02')!.hasta, '2024-02-29')
    assert.deepEqual([periodoFiscal('2026')!.desde, periodoFiscal('2026')!.hasta], ['2026-01-01', '2026-12-31'])
    assert.equal(periodoFiscal('2026-5T'), null)
    assert.equal(ultimoTrimestreCerrado('2026-10-02'), '2026-3T')
    assert.equal(ultimoTrimestreCerrado('2027-01-15'), '2026-4T')
})

test('modelos por régimen', () => {
    const sl = configFiscal({ regimen: 'sociedad' })
    assert.ok(modeloActivo(sl, '303') && modeloActivo(sl, '202') && modeloActivo(sl, '200'))
    assert.ok(!modeloActivo(sl, '130') && !modeloActivo(sl, '100'))
    const au = configFiscal({ regimen: 'autonomo', modelos: { '115': true } })
    assert.ok(modeloActivo(au, '130') && modeloActivo(au, '115') && !modeloActivo(au, '202'))
    assert.ok(!modeloActivo(configFiscal({ regimen: 'sociedad', modelos: { '130': true } }), '130')) // no aplica a S.L.
    assert.equal(configFiscal({ dias_aviso: 999 } as any).dias_aviso, 30)
})

test('vencimientos de una S.L. a 2 de octubre de 2026', () => {
    const cfg = configFiscal({ regimen: 'sociedad' })
    const v = vencimientos(cfg, '2026-10-02', 130)
    const de = (m: string, p: string) => v.find(x => x.modelo === m && x.periodo === p)
    assert.equal(de('303', '2026-3T')!.fin, '2026-10-20')
    assert.equal(de('303', '2026-3T')!.diasRestantes, 18)
    assert.equal(de('303', '2026-3T')!.finDomiciliacion, '2026-10-15')
    assert.equal(de('303', '2026-3T')!.entregaAsesor, '2026-10-10')
    assert.equal(de('111', '2026-3T')!.fin, '2026-10-20')
    assert.equal(de('202', '2026-3T')!.fin, '2026-10-20')
    assert.equal(de('202', '2026-4T')!.fin, '2026-12-21')        // 20/12/2026 es domingo
    assert.equal(de('111', '2026-4T')!.fin, '2027-01-20')
    assert.equal(de('303', '2026-4T')!.fin, '2027-02-01')        // 30/01/2027 es sábado
    assert.equal(de('390', '2026')!.fin, '2027-02-01')
    assert.ok(!v.some(x => x.modelo === '130'))
})

test('avisos: menos de un mes, agrupados por periodo, y se apagan al entregar', () => {
    const cfg = configFiscal({ regimen: 'sociedad' })
    const a = avisosFiscales(cfg, '2026-10-02')
    assert.equal(a.length, 1)
    assert.equal(a[0].periodo, '2026-3T')
    assert.deepEqual(a[0].modelos.sort(), ['111', '202', '303'])
    assert.equal(a[0].nivel, 'info')
    assert.equal(a[0].etiquetaPeriodo, '3er trimestre 2026 (julio a septiembre)')
    assert.equal(avisosFiscales(cfg, '2026-10-15')[0].nivel, 'urgente')
    assert.equal(avisosFiscales(cfg, '2026-10-02', new Set([a[0].clave])).length, 0)
    assert.equal(avisosFiscales(cfg, '2026-09-15').length, 0)     // 35 días: aún no
    assert.equal(avisosFiscales(cfg, '2026-09-20').length, 1)     // 30 días: empieza
    assert.equal(avisosFiscales(cfg, '2026-10-21').length, 0)     // pasado el plazo
    // El 202 de diciembre y el 4T de enero son avisos distintos
    const dic = avisosFiscales(cfg, '2026-12-01')
    assert.equal(dic.length, 1)
    assert.match(dic[0].etiquetaPeriodo, /enero a noviembre/)
    const ene = avisosFiscales(cfg, '2027-01-05', new Set([dic[0].clave]))
    assert.ok(ene.some(x => x.periodo === '2026-4T'))
})

test('números de factura y nombres de archivo', () => {
    assert.deepEqual(analizarNumero('FAC-01-2026'), { serie: 'FAC', secuencia: 1, anio: 2026 })
    assert.deepEqual(analizarNumero('R-12-2026'), { serie: 'R', secuencia: 12, anio: 2026 })
    assert.equal(analizarNumero('2026/ABC'), null)
    assert.deepEqual(numerosGasto('G-01-2026 / S/N'), { interno: 'G-01-2026', proveedor: '' })
    assert.deepEqual(numerosGasto('G-02-2026 / F 2026/123'), { interno: 'G-02-2026', proveedor: 'F 2026/123' })
    assert.equal(nombreSeguro('ACEROS: "S.L." / <norte>?.'), 'ACEROS- -S.L.- - -norte-')
    assert.equal(nombreSeguro('   '), 'SIN NOMBRE')
})

const FACTURAS = [
    { id: 'f1', numero: 'FAC-01-2026', fecha: '2026-07-03', cliente_razon_social: 'EMPRESA A', cliente_cif: 'B11111111', base_imponible: 100, iva_porcentaje: 21, iva_importe: 21, total: 121 },
    { id: 'f2', numero: 'FAC-02-2026', fecha: '2026-08-10', cliente_razon_social: 'EMPRESA B', cliente_cif: '', base_imponible: 200, iva_porcentaje: 10, iva_importe: 20, total: 220 },
    { id: 'f4', numero: 'FAC-04-2026', fecha: '2026-09-01', cliente_razon_social: 'EMPRESA A', cliente_cif: 'b-11111111', base_imponible: 1000, iva_porcentaje: 21, iva_importe: 210, total: 1210 },
    { id: 'f5', numero: 'FAC-05-2026', fecha: '2026-08-31', cliente_razon_social: 'EMPRESA C', cliente_cif: 'A3', base_imponible: 50, iva_porcentaje: 21, iva_importe: 10.5, total: 60.5, anulada: true },
    { id: 'f0', numero: 'FAC-00-2025', fecha: '2025-12-30', cliente_razon_social: 'VIEJA', cliente_cif: 'X', base_imponible: 1, iva_importe: 0, total: 1 },
    { id: 'fq1', numero: 'FAC-03-2026', fecha: '2026-03-15', cliente_razon_social: 'EMPRESA A', cliente_cif: 'B11111111', base_imponible: 3000, iva_porcentaje: 21, iva_importe: 630, total: 3630 },
]
const GASTOS = [
    { id: 'g2', numero: 'G-02-2026 / F-77', fecha: '2026-09-05', proveedor: 'ACEROS', proveedor_cif: 'B999', base_imponible: 400, iva_porcentaje: 21, iva_importe: 84, total: 484, archivo_url: '/api/archivos/gastos/x.pdf', created_at: '2026-09-05T10:00' },
    { id: 'g1', numero: 'G-01-2026 / S/N', fecha: '2026-07-10', proveedor: 'ASESORÍA PÉREZ', proveedor_cif: '', categoria: 'Servicios profesionales', base_imponible: 100, iva_porcentaje: 21, iva_importe: 21, retencion_porcentaje: 15, retencion_importe: 15, total: 106, created_at: '2026-07-10T09:00' },
    { id: 'g3', numero: 'G-03-2026 / ALQ-9', fecha: '2026-09-01', proveedor: 'INMOBILIARIA', proveedor_cif: 'B555', categoria: 'Alquiler', base_imponible: 500, iva_porcentaje: 21, iva_importe: 105, retencion_porcentaje: 19, retencion_importe: 95, total: 510, archivo_url: 'gastos/y.jpg', revisado: false },
    { id: 'g4', numero: 'G-04-2026 / F-77', fecha: '2026-09-20', proveedor: 'ACEROS', proveedor_cif: 'B999', base_imponible: 400, iva_porcentaje: 21, iva_importe: 84, total: 484 },
    { id: 'gq1', numero: 'G-00-2026 / Q1', fecha: '2026-02-01', proveedor: 'ACEROS', proveedor_cif: 'B999', base_imponible: 1000, iva_importe: 210, total: 1210 },
]

test('libros del 3T: orden por fecha, totales, IVA por tipo, 303, retenciones, anomalías', () => {
    const l = calcularLibros({ facturas: FACTURAS, gastos: GASTOS }, periodoFiscal('2026-3T')!, { regimen: 'sociedad' })
    assert.deepEqual(l.emitidas.map(e => e.numero), ['FAC-01-2026', 'FAC-02-2026', 'FAC-05-2026', 'FAC-04-2026'])
    assert.deepEqual(l.emitidas.map(e => e.orden), [1, 2, 3, 4])
    assert.equal(l.emitidas[0].archivo, '001_2026-07-03_FAC-01-2026_EMPRESA A.pdf')
    assert.equal(l.emitidas[2].estado, 'anulada')
    assert.match(l.emitidas[2].archivo, /_ANULADA\.pdf$/)
    assert.deepEqual(l.totales.emitidas, { num: 4, anuladas: 1, base: 1300, cuota: 251, total: 1551 })
    assert.deepEqual(l.recibidas.map(r => r.numeroInterno), ['G-01-2026', 'G-03-2026', 'G-02-2026', 'G-04-2026'])
    assert.equal(l.recibidas[0].archivo, null)                     // sin documento original
    assert.equal(l.recibidas[2].archivo, '003_2026-09-05_ACEROS_F-77.pdf')
    assert.equal(l.totales.recibidas.cuota, 294)
    assert.deepEqual(l.ivaPorTipo.repercutido.map(t => [t.tipo, t.base, t.cuota]), [[21, 1100, 231], [10, 200, 20]])
    assert.deepEqual(l.modelo303, { devengado: 251, deducible: 294, resultado: -43 })
    assert.deepEqual(l.retenciones.m111, { num: 1, perceptores: 1, base: 100, retencion: 15 })
    assert.deepEqual(l.retenciones.m115, { num: 1, perceptores: 1, base: 500, retencion: 95 })
    // EMPRESA A agrupa aunque el NIF venga con guion
    assert.deepEqual(l.porCliente.find(c => c.nombre === 'EMPRESA A')!.num, 2)
    assert.equal(l.modelo347, null)
    const textos = l.anomalias.map(a => a.texto).join('\n')
    assert.doesNotMatch(textos, /falta el nº 3/)                  // FAC-03 está en el 1T: no es hueco
    assert.match(textos, /EMPRESA B\) no tiene NIF/)
    assert.match(textos, /FAC-05-2026 \(2026-08-31\) tiene fecha anterior a FAC-04-2026/)
    assert.match(textos, /Posible factura duplicada: G-02-2026 y G-04-2026/)
    assert.match(textos, /sin revisar/)
    assert.match(textos, /G-01-2026 \(ASESORÍA PÉREZ\) no tiene la factura original/)
})

test('huecos de numeración y fechas no correlativas', () => {
    const l = calcularLibros({ facturas: [...FACTURAS, { id: 'f7', numero: 'FAC-07-2026', fecha: '2026-09-30', cliente_razon_social: 'EMPRESA A', cliente_cif: 'B1', base_imponible: 1, iva_porcentaje: 21, iva_importe: 0.21, total: 1.21 }], gastos: [] }, periodoFiscal('2026-3T')!)
    const textos = l.anomalias.map(a => a.texto).join('\n')
    assert.match(textos, /serie FAC de 2026: falta el nº 6\./)
    assert.match(textos, /FAC-05-2026 \(2026-08-31\) tiene fecha anterior a FAC-04-2026 \(2026-09-01\)/)
})

test('modelo 130 (autónomo) acumulado y 347 anual', () => {
    const l = calcularLibros({ facturas: FACTURAS, gastos: GASTOS }, periodoFiscal('2026-3T')!, { regimen: 'autonomo' })
    const [q1, q2, q3] = l.modelo130!
    assert.deepEqual([q1.ingresos, q1.gastos, q1.resultado], [3000, 1000, 400])
    assert.equal(q2.resultado, 0)
    assert.deepEqual([q3.ingresos, q3.gastos, q3.rendimiento, q3.pagosAnteriores], [4300, 2400, 1900, 400])
    assert.equal(q3.resultado, 0)                                  // 20 % de 1900 = 380 < 400 ya pagado
    const anual = calcularLibros({ facturas: FACTURAS, gastos: GASTOS }, periodoFiscal('2026')!)
    assert.deepEqual(anual.modelo347!.clientes.map(c => [c.nombre, c.total, c.trimestres]), [['EMPRESA A', 4961, [3630, 0, 1331, 0]]])
    assert.deepEqual(anual.modelo347!.proveedores.map(c => c.nombre), [])  // ACEROS 2178 € < 3005,06
})

test('estructura del paquete: por fecha + por cliente/proveedor, resumen, Excel y LEEME', () => {
    const l = calcularLibros({ facturas: FACTURAS, gastos: GASTOS }, periodoFiscal('2026-3T')!)
    const rutas = estructuraPaquete(l, 'EMPRESA X, S.L.', '02/10/2026').map(a => a.ruta)
    assert.ok(rutas.includes('00_RESUMEN_2026-3T.pdf'))
    assert.ok(rutas.includes('00_LIBROS_REGISTRO_2026-3T.xlsx'))
    assert.ok(rutas.includes('01_FACTURAS_EMITIDAS/001_2026-07-03_FAC-01-2026_EMPRESA A.pdf'))
    assert.ok(rutas.includes('03_POR_CLIENTE/EMPRESA A (B11111111)/001_2026-07-03_FAC-01-2026_EMPRESA A.pdf'))
    assert.ok(rutas.includes('04_POR_PROVEEDOR/ACEROS (B999)/003_2026-09-05_ACEROS_F-77.pdf'))
    assert.ok(rutas.includes('LEEME.txt'))
    assert.equal(rutas.filter(r => r.startsWith('02_')).length, 2)   // g2 y g3 (g1 y g4 sin documento)
    assert.equal(new Set(rutas).size, rutas.length)                  // sin rutas repetidas
})
