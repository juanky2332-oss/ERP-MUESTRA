import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverPeriodo, periodoAnterior, calcularInforme, variacion } from './calcular.ts'

const HOY = '2026-09-23'

test('periodos: mes concreto, trimestre, año, personalizado', () => {
    assert.deepEqual([resolverPeriodo({ preset: 'este_mes' }, HOY).desde, resolverPeriodo({ preset: 'este_mes' }, HOY).hasta], ['2026-09-01', '2026-09-30'])
    assert.equal(resolverPeriodo({ preset: 'mes', mes: '2026-02' }, HOY).hasta, '2026-02-28')
    assert.equal(resolverPeriodo({ preset: 'mes', mes: '2024-02' }, HOY).hasta, '2024-02-29')
    const t = resolverPeriodo({ preset: 'trimestre' }, HOY)
    assert.deepEqual([t.desde, t.hasta, t.etiqueta], ['2026-07-01', '2026-09-30', '3º trimestre 2026'])
    const ta = resolverPeriodo({ preset: 'trimestre_anterior' }, '2026-02-10')
    assert.deepEqual([ta.desde, ta.hasta], ['2025-10-01', '2025-12-31'])
    const u = resolverPeriodo({}, HOY)
    assert.deepEqual([u.desde, u.hasta], ['2025-10-01', '2026-09-30'])
    const p = resolverPeriodo({ preset: 'personalizado', desde: '2026-05-10', hasta: '2026-05-01' }, HOY)
    assert.deepEqual([p.desde, p.hasta], ['2026-05-01', '2026-05-10'])
})

test('periodo anterior equivalente', () => {
    const mes = periodoAnterior(resolverPeriodo({ preset: 'mes', mes: '2026-03' }, HOY))
    assert.deepEqual([mes.desde, mes.hasta], ['2026-02-01', '2026-02-28'])
    const tri = periodoAnterior(resolverPeriodo({ preset: 'trimestre' }, HOY))
    assert.deepEqual([tri.desde, tri.hasta], ['2026-04-01', '2026-06-30'])
    const libre = periodoAnterior(resolverPeriodo({ preset: 'personalizado', desde: '2026-05-11', hasta: '2026-05-20' }, HOY))
    assert.deepEqual([libre.desde, libre.hasta], ['2026-05-01', '2026-05-10'])
})

test('informe: facturado, cobrado, gastos, deuda por antigüedad, IVA, conversión', () => {
    const p = resolverPeriodo({ preset: 'mes', mes: '2026-09' }, HOY)
    const datos = {
        facturas: [
            { id: 'f1', numero: 'FAC-1', fecha: '2026-09-02', fecha_vencimiento: '2026-09-10', cliente_razon_social: 'A', base_imponible: 100, iva_importe: 21, total: 121, importe_cobrado: 0, estado_cobro: 'pendiente', lineas: [{ descripcion: 'Eje', cantidad: 2, precio_unitario: 50 }] },
            { id: 'f2', numero: 'FAC-2', fecha: '2026-09-05', fecha_vencimiento: '2026-10-05', cliente_razon_social: 'B', base_imponible: 200, iva_importe: 42, total: 242, importe_cobrado: 242, estado_cobro: 'pagada', lineas: [] },
            { id: 'f3', numero: 'FAC-3', fecha: '2026-05-01', fecha_vencimiento: '2026-05-31', cliente_razon_social: 'A', base_imponible: 50, iva_importe: 10.5, total: 60.5, importe_cobrado: 20, estado_cobro: 'parcial', lineas: [] },
            { id: 'f4', numero: 'FAC-4', fecha: '2026-09-06', cliente_razon_social: 'C', base_imponible: 999, total: 999, anulada: true },
        ],
        cobros: [{ factura_id: 'f2', importe: 242, fecha: '2026-09-15', metodo: 'transferencia', estado: 'confirmado' }, { factura_id: 'f1', importe: 50, fecha: '2026-09-16', estado: 'propuesto' }],
        gastos: [{ fecha: '2026-09-03', categoria: 'Material', proveedor: 'P', base_imponible: 80, iva_importe: 16.8, total: 96.8 }],
        presupuestos: [{ id: 'p1', fecha: '2026-09-01', base_imponible: 100, aceptado: true }, { id: 'p2', fecha: '2026-09-02', base_imponible: 50, statuses: ['traspasado'] }, { id: 'p3', fecha: '2026-09-03', base_imponible: 70, fecha_validez: '2026-09-10' }],
        albaranes: [{ id: 'a1', fecha: '2026-09-01', base_imponible: 100, factura_id: 'f1', firmado_at: '2026-09-01' }, { id: 'a2', fecha: '2026-09-04', base_imponible: 30 }],
    }
    const r = calcularInforme(datos as any, p, HOY)
    assert.equal(r.kpis.facturadoBase, 300)
    assert.equal(r.kpis.numFacturas, 2)
    assert.equal(r.kpis.cobrado, 242) // el cobro propuesto no cuenta
    assert.equal(r.kpis.gastosBase, 80)
    assert.equal(r.kpis.resultado, 220)
    assert.equal(r.kpis.pendienteCobro, 161.5) // 121 + 40,5
    assert.equal(r.antiguedad.find(t => t.id === '1_30')!.importe, 121) // vencida hace 13 días
    assert.equal(r.antiguedad.find(t => t.id === '90')!.importe, 40.5) // vencida en mayo
    assert.equal(r.kpis.diasMedioCobro, 10)
    assert.deepEqual(r.ivaTrimestres.map(t => [t.trimestre, t.repercutido, t.soportado, t.resultado]), [['2026-T3', 63, 16.8, 46.2]])
    assert.equal(r.presupuestos.conversion, 66.7)
    assert.equal(r.presupuestos.caducados, 1)
    assert.equal(r.albaranes.pendientesFacturar, 1)
    assert.equal(r.albaranes.sinFirma, 1)
    assert.equal(r.porConcepto[0].clave, 'Eje')
    assert.equal(r.serie.porDia, true)
    // Filtro por cliente
    const a = calcularInforme(datos as any, p, HOY, { cliente: 'A' })
    assert.equal(a.kpis.facturadoBase, 100)
    assert.equal(a.kpis.gastosBase, 0)
})

test('variación', () => {
    assert.equal(variacion(150, 100), 50)
    assert.equal(variacion(0, 0), 0)
    assert.equal(variacion(10, 0), null)
})
