import 'server-only'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { hexARgb, suavizar, formatoImagen, type MarcaDocumento } from '@/lib/documentos/marca'
import { fechaCorta, variacion, type Informe } from '@/lib/informes/calcular'

type RGB = [number, number, number]

// useGrouping 'always': en es-ES Intl no separa los miles de 4 cifras (1234 → 1.234)
const eur = (v: number) => `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
const eur0 = (v: number) => `${Math.round(v).toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const num = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })

const GRIS: RGB = [110, 110, 110]
const GRIS_CLARO: RGB = [225, 225, 225]
const VERDE: RGB = [22, 140, 80]
const ROJO: RGB = [200, 40, 55]
// Colores de la gráfica (se imprimen siempre: es un PDF, no la web)
const C_FACT: RGB = [37, 99, 235]
const C_COBR: RGB = [16, 185, 129]
const C_GAST: RGB = [244, 114, 128]

/** Escala "bonita" para el eje: 0, paso, 2·paso… hasta cubrir el máximo. */
function escala(max: number, marcas = 4) {
    if (max <= 0) return { tope: 1, paso: 1 }
    const bruto = max / marcas
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)))
    const paso = [1, 2, 2.5, 5, 10].map(f => f * mag).find(p => p >= bruto) || 10 * mag
    return { tope: Math.ceil(max / paso) * paso, paso }
}

const ejeCorto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k` : v.toLocaleString('es-ES'))

/**
 * PDF del informe de gestión (A4 vertical). Solo lo que aporta: cifras clave
 * con su comparación, evolución, quién compra, en qué se gasta, qué se debe,
 * IVA y lo pendiente de acción. Las secciones sin datos no salen.
 */
export function pdfInforme(a: Informe, b: Informe, marca: MarcaDocumento, opts: { generado: string; hoy: string; cliente?: string | null }): Buffer {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, H = 297, M = 14, ANCHO = W - 2 * M
    const color = hexARgb(marca.color)
    const suave = suavizar(color, 0.92)
    const k = a.kpis, kb = b.kpis
    let y = 0

    const texto = (t: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {}) => {
        pdf.setFont('helvetica', o.bold ? 'bold' : 'normal'); pdf.setFontSize(o.size ?? 9); pdf.setTextColor(...(o.color ?? [0, 0, 0] as RGB))
        pdf.text(t, x, yy, { align: o.align ?? 'left' })
    }
    const espacio = (alto: number) => { if (y + alto > H - 16) { pdf.addPage(); y = 16 } }
    const titulo = (t: string, alto = 30) => {
        espacio(alto)
        y += 7
        texto(t, M, y, { size: 11.5, bold: true, color })
        pdf.setDrawColor(...color); pdf.setLineWidth(0.4); pdf.line(M, y + 1.6, W - M, y + 1.6)
        y += 5
    }
    const ultimaY = () => (pdf as any).lastAutoTable?.finalY ?? y
    const tabla = (head: string[], body: any[][], o: { derecha?: number[]; foot?: any[]; izq?: number; ancho?: number; anchos?: Record<number, number>; startY?: number } = {}) => {
        const izq = o.izq ?? M, ancho = o.ancho ?? ANCHO
        autoTable(pdf, {
            startY: o.startY ?? y, head: [head], body, foot: o.foot ? [o.foot] : undefined,
            margin: { left: izq, right: W - izq - ancho, top: 16, bottom: 16 }, tableWidth: ancho,
            theme: 'plain',
            styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 1.8, right: 1.8 }, textColor: [30, 30, 30], overflow: 'ellipsize' },
            headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
            footStyles: { fillColor: suave, textColor: 0, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [247, 247, 247] },
            columnStyles: Object.fromEntries([
                ...(o.derecha || []).map(c => [c, { halign: 'right' as const }]),
                ...Object.entries(o.anchos || {}).map(([c, w]) => [c, { cellWidth: w, ...((o.derecha || []).includes(Number(c)) ? { halign: 'right' as const } : {}) }]),
            ]),
            didParseCell: (d: any) => { if (d.section !== 'body' && (o.derecha || []).includes(d.column.index)) d.cell.styles.halign = 'right' },
        })
        return ultimaY()
    }
    const nota = (t: string) => { texto(t, M, y + 4, { size: 8, color: GRIS }); y += 6 }

    // ---------- Cabecera ----------
    pdf.setFillColor(...color); pdf.rect(0, 0, W, 2.5, 'F')
    let xT = M
    if (marca.logoDataUrl) {
        try {
            const p = (pdf as any).getImageProperties(marca.logoDataUrl)
            const esc = Math.min(30 / p.width, 16 / p.height)
            pdf.addImage(marca.logoDataUrl, formatoImagen(marca.logoDataUrl), M, 8, p.width * esc, p.height * esc, 'logo', 'FAST')
            xT = M + p.width * esc + 5
        } catch { /* logo no válido: se omite */ }
    }
    texto('Informe de gestión', xT, 13.5, { size: 17, bold: true })
    texto(`${a.periodo.etiqueta} · ${fechaCorta(a.periodo.desde)} – ${fechaCorta(a.periodo.hasta)}${opts.cliente ? ` · Cliente: ${opts.cliente}` : ''}`, xT, 19.5, { size: 10, bold: true, color: [50, 50, 50] })
    texto(`${marca.nombre}${marca.nif ? ` · NIF ${marca.nif}` : ''}`, xT, 24.5, { size: 8, color: GRIS })
    texto(`Comparado con ${b.periodo.etiqueta} · Importes sin IVA salvo que se indique · Generado el ${opts.generado}`, xT, 28.5, { size: 8, color: GRIS })
    y = 34

    // ---------- Cifras clave ----------
    const tarjetas: { t: string; v: string; d?: number | null; invertir?: boolean; sub?: string; rojo?: boolean }[] = [
        { t: 'Facturado', v: eur0(k.facturadoBase), d: variacion(k.facturadoBase, kb.facturadoBase), sub: `${pl(k.numFacturas, 'factura', 'facturas')} · ${eur0(k.facturadoTotal)} con IVA` },
        { t: 'Cobrado', v: eur0(k.cobrado), d: variacion(k.cobrado, kb.cobrado) },
        ...(opts.cliente ? [] : [
            { t: 'Gastos', v: eur0(k.gastosBase), d: variacion(k.gastosBase, kb.gastosBase), invertir: true },
            { t: 'Resultado', v: eur0(k.resultado), d: variacion(k.resultado, kb.resultado), sub: k.margen != null ? `Margen ${num(k.margen)} %` : undefined, rojo: k.resultado < 0 },
        ]),
        { t: 'Pendiente de cobro (hoy)', v: eur0(k.pendienteCobro), sub: 'Toda la deuda viva' },
        { t: 'Vencido sin cobrar (hoy)', v: eur0(k.vencido), rojo: k.vencido > 0 },
        { t: 'Ticket medio', v: eur0(k.ticketMedio), d: variacion(k.ticketMedio, kb.ticketMedio) },
        { t: 'Días medios de cobro', v: k.diasMedioCobro == null ? '—' : `${k.diasMedioCobro} días`, d: k.diasMedioCobro != null && kb.diasMedioCobro != null ? variacion(k.diasMedioCobro, kb.diasMedioCobro) : null, invertir: true },
    ]
    const porFila = 4, sep = 3, tw = (ANCHO - sep * (porFila - 1)) / porFila, th = 19
    tarjetas.forEach((c, i) => {
        const x = M + (i % porFila) * (tw + sep), yy = y + Math.floor(i / porFila) * (th + sep)
        pdf.setDrawColor(...GRIS_CLARO); pdf.setLineWidth(0.25); pdf.setFillColor(252, 252, 252)
        pdf.roundedRect(x, yy, tw, th, 1.8, 1.8, 'FD')
        texto(c.t, x + 3, yy + 5, { size: 7.2, bold: true, color: GRIS })
        texto(c.v, x + 3, yy + 11.3, { size: 12.5, bold: true, color: c.rojo ? ROJO : [0, 0, 0] })
        if (c.d != null && c.d !== 0) {
            const bueno = c.invertir ? c.d < 0 : c.d > 0
            texto(`${c.d > 0 ? '+' : ''}${num(c.d)} % vs anterior`, x + 3, yy + 16, { size: 7, bold: true, color: bueno ? VERDE : ROJO })
        } else if (c.sub) {
            texto(c.sub, x + 3, yy + 16, { size: 7, color: GRIS })
        }
    })
    y += Math.ceil(tarjetas.length / porFila) * (th + sep) - sep

    // ---------- Evolución (gráfica vectorial) ----------
    const pts = a.serie.puntos
    const hayMov = pts.some(p => p.facturado || p.cobrado || p.gastos)
    titulo(a.serie.porDia ? 'Evolución diaria' : 'Evolución mensual', 82)
    if (!hayMov) {
        nota('Sin movimientos en el periodo.')
    } else {
        const series: { c: RGB; l: string; v: (p: typeof pts[number]) => number }[] = [
            { c: C_FACT, l: 'Facturado', v: p => p.facturado },
            { c: C_COBR, l: 'Cobrado', v: p => p.cobrado },
            ...(opts.cliente ? [] : [{ c: C_GAST, l: 'Gastos', v: (p: typeof pts[number]) => p.gastos }]),
        ]
        // Leyenda
        let lx = M
        for (const s of series) {
            pdf.setFillColor(...s.c); pdf.rect(lx, y + 0.2, 3, 3, 'F')
            texto(s.l, lx + 4.5, y + 2.8, { size: 8, bold: true, color: [60, 60, 60] })
            lx += 6 + pdf.getTextWidth(s.l) + 6
        }
        y += 7
        const ejeX = M + 13, ancho = W - M - ejeX, alto = 52, base = y + alto
        const { tope, paso } = escala(Math.max(...pts.flatMap(p => series.map(s => s.v(p)))))
        // Rejilla y eje
        pdf.setLineWidth(0.15)
        for (let v = 0; v <= tope + 1e-9; v += paso) {
            const yy = base - (v / tope) * alto
            pdf.setDrawColor(...(v === 0 ? [150, 150, 150] as RGB : GRIS_CLARO)); pdf.line(ejeX, yy, W - M, yy)
            texto(ejeCorto(v), ejeX - 1.5, yy + 1, { size: 6.5, color: GRIS, align: 'right' })
        }
        // Barras agrupadas
        const hueco = ancho / pts.length
        const grupo = Math.min(hueco * 0.72, 18)
        const bw = grupo / series.length
        const cadaEtiqueta = Math.max(1, Math.ceil((a.serie.porDia ? 5 : 10) / hueco))
        pts.forEach((p, i) => {
            const x0 = ejeX + i * hueco + (hueco - grupo) / 2
            series.forEach((s, j) => {
                const v = s.v(p)
                if (v <= 0) return
                const h = Math.max(0.3, (v / tope) * alto)
                pdf.setFillColor(...s.c); pdf.rect(x0 + j * bw, base - h, bw * 0.9, h, 'F')
            })
            if (i % cadaEtiqueta === 0) texto(p.etiqueta, ejeX + i * hueco + hueco / 2, base + 4, { size: 6.5, color: GRIS, align: 'center' })
        })
        y = base + 6

        // Detalle por periodo: solo los periodos con movimiento + total
        const filas = pts.filter(p => p.facturado || p.cobrado || p.gastos)
        const cols = ['Periodo', 'Facturado', 'Cobrado', ...(opts.cliente ? [] : ['Gastos', 'Resultado'])]
        const fila = (p: typeof pts[number]) => [a.serie.porDia ? fechaCorta(p.clave) : p.etiqueta, eur(p.facturado), eur(p.cobrado), ...(opts.cliente ? [] : [eur(p.gastos), eur(p.resultado)])]
        espacio(20)
        y += 2
        y = tabla(cols, filas.map(fila), {
            derecha: [1, 2, 3, 4],
            foot: filas.length > 1 ? ['Total', eur(k.facturadoBase), eur(k.cobrado), ...(opts.cliente ? [] : [eur(k.gastosBase), eur(k.resultado)])] : undefined,
        })
    }

    // ---------- Clientes y gastos (lado a lado) ----------
    const top = (lista: { clave: string; importe: number; num: number }[], n: number) => {
        const total = lista.reduce((s, x) => s + x.importe, 0) || 1
        const fil = lista.slice(0, n).map(x => [x.clave, String(x.num), eur(x.importe), `${Math.round((x.importe / total) * 100)} %`])
        const resto = lista.slice(n)
        if (resto.length) {
            const imp = resto.reduce((s, x) => s + x.importe, 0)
            fil.push([`Resto (${resto.length})`, String(resto.reduce((s, x) => s + x.num, 0)), eur(imp), `${Math.round((imp / total) * 100)} %`])
        }
        return fil
    }
    const izq = !opts.cliente && a.ventasPorCliente.length ? { t: 'Clientes con más facturación', cols: ['Cliente', 'Fact.', 'Importe', '%'], filas: top(a.ventasPorCliente, 8) } : null
    const der = !opts.cliente && a.gastosPorCategoria.length
        ? { t: 'Gastos por categoría', cols: ['Categoría', 'Nº', 'Base', '%'], filas: top(a.gastosPorCategoria, 8) }
        : a.porConcepto.length ? { t: 'Lo más vendido', cols: ['Concepto', 'Lín.', 'Importe', '%'], filas: top(a.porConcepto, 8) } : null
    const bloques = [izq, der].filter(Boolean) as NonNullable<typeof izq>[]
    if (bloques.length) {
        const filasMax = Math.max(...bloques.map(x => x.filas.length))
        espacio(16 + filasMax * 6.2)
        const yIni = y + 7
        const anchoB = bloques.length === 2 ? (ANCHO - 6) / 2 : ANCHO
        let yFin = yIni
        bloques.forEach((bq, i) => {
            const x = M + i * (anchoB + 6)
            texto(bq.t, x, yIni, { size: 11.5, bold: true, color })
            pdf.setDrawColor(...color); pdf.setLineWidth(0.4); pdf.line(x, yIni + 1.6, x + anchoB, yIni + 1.6)
            const fin = tabla(bq.cols, bq.filas, { izq: x, ancho: anchoB, startY: yIni + 5, derecha: [1, 2, 3], anchos: { 1: 11, 2: 25, 3: 12 } })
            yFin = Math.max(yFin, fin)
        })
        y = yFin
    }

    // ---------- Cobros y deuda (a hoy) ----------
    if (k.pendienteCobro > 0) {
        titulo('Deuda de clientes a fecha de hoy', 40)
        y = tabla(a.antiguedad.map(t => t.etiqueta), [a.antiguedad.map(t => eur(t.importe)), a.antiguedad.map(t => pl(t.num, 'factura', 'facturas'))], { derecha: [0, 1, 2, 3, 4] })
        const hoyMs = new Date(opts.hoy + 'T00:00:00Z').getTime()
        const vencidas = a.facturasPendientes
            .map(f => ({ ...f, dias: f.vencimiento ? Math.floor((hoyMs - new Date(f.vencimiento.slice(0, 10) + 'T00:00:00Z').getTime()) / 86400000) : 0 }))
            .filter(f => f.dias > 0)
            .sort((x, z) => z.pendiente - x.pendiente)
        if (vencidas.length) {
            espacio(14 + Math.min(vencidas.length, 13) * 6.5); y += 4
            texto(`Facturas vencidas sin cobrar (${vencidas.length})`, M, y + 1, { size: 9, bold: true }); y += 3
            y = tabla(['Factura', 'Cliente', 'Venció', 'Días', 'Pendiente'], vencidas.slice(0, 12).map(f => [f.numero, f.cliente || '—', fechaCorta(f.vencimiento!), String(f.dias), eur(f.pendiente)]), {
                derecha: [3, 4], anchos: { 0: 28, 2: 22, 3: 14, 4: 30 },
                foot: vencidas.length > 12 ? [`+${vencidas.length - 12} más`, '', '', '', eur(vencidas.slice(12).reduce((s, f) => s + f.pendiente, 0))] : undefined,
            })
        }
    }

    // ---------- IVA ----------
    if (!opts.cliente && a.ivaTrimestres.length) {
        titulo('IVA por trimestre (orientativo)', 30)
        y = tabla(['Trimestre', 'Base ventas', 'IVA repercutido', 'Base compras', 'IVA soportado', 'A ingresar'],
            a.ivaTrimestres.map(t => [t.trimestre.replace('-', ' '), eur(t.baseVentas), eur(t.repercutido), eur(t.baseCompras), eur(t.soportado), eur(t.resultado)]),
            { derecha: [1, 2, 3, 4, 5] })
        nota('Sale de las facturas y gastos del ERP. La liquidación del 303 la confirma la gestoría.')
    }

    // ---------- Pendiente de acción ----------
    const p = a.presupuestos, al = a.albaranes
    if (p.num || al.num || p.abiertosLista.length || al.pendientesLista.length) {
        titulo('Presupuestos y albaranes', 30)
        const resumen: string[][] = []
        if (p.num) resumen.push(['Presupuestos', `${pl(p.num, 'emitido', 'emitidos')} (${eur0(p.importe)})`, `${pl(p.aceptados, 'aceptado', 'aceptados')} · ${num(p.conversion ?? 0)} %`, `${pl(p.abiertos, 'abierto', 'abiertos')} (${eur0(p.importeAbierto)})${p.caducados ? ` · ${pl(p.caducados, 'caducado', 'caducados')}` : ''}`])
        if (al.num) resumen.push(['Albaranes', `${pl(al.num, 'emitido', 'emitidos')} (${eur0(al.importe)})`, `${al.pendientesFacturar} sin facturar (${eur0(al.importePendienteFacturar)})`, `${al.sinFirma} sin firmar`])
        if (resumen.length) {
            autoTable(pdf, {
                startY: y, body: resumen, theme: 'plain', margin: { left: M, right: M },
                styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 } },
                alternateRowStyles: { fillColor: [247, 247, 247] },
            })
            y = ultimaY()
        }
        if (al.pendientesLista.length) {
            espacio(14 + Math.min(al.pendientesLista.length, 10) * 6.5); y += 4
            texto('Albaranes pendientes de facturar', M, y + 1, { size: 9, bold: true }); y += 3
            y = tabla(['Albarán', 'Cliente', 'Fecha', 'Firmado', 'Importe'], al.pendientesLista.slice(0, 10).map(x => [x.numero, x.cliente || '—', fechaCorta(x.fecha), x.firmado ? 'Sí' : 'No', eur(x.importe)]), { derecha: [4], anchos: { 0: 28, 2: 22, 3: 16, 4: 30 } })
        }
        if (p.abiertosLista.length) {
            espacio(14 + Math.min(p.abiertosLista.length, 10) * 6.5); y += 4
            texto('Presupuestos sin respuesta', M, y + 1, { size: 9, bold: true }); y += 3
            const lista = [...p.abiertosLista].sort((x, z) => z.importe - x.importe).slice(0, 10)
            y = tabla(['Presupuesto', 'Cliente', 'Fecha', 'Válido hasta', 'Importe'], lista.map(x => [x.numero, x.cliente || '—', fechaCorta(x.fecha), x.validez ? fechaCorta(x.validez) : '—', eur(x.importe)]), { derecha: [4], anchos: { 0: 28, 2: 22, 3: 22, 4: 30 } })
        }
    }

    // ---------- Pie ----------
    const total = (pdf as any).getNumberOfPages()
    for (let i = 1; i <= total; i++) {
        pdf.setPage(i)
        pdf.setDrawColor(...GRIS_CLARO); pdf.setLineWidth(0.2); pdf.line(M, H - 11, W - M, H - 11)
        texto(`${marca.nombre} · Informe de gestión · ${a.periodo.etiqueta}`, M, H - 7, { size: 7, color: GRIS })
        texto(`Página ${i} de ${total}`, W - M, H - 7, { size: 7, color: GRIS, align: 'right' })
    }
    return Buffer.from(pdf.output('arraybuffer'))
}
