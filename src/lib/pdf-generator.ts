  import jsPDF from 'jspdf'
  import autoTable from 'jspdf-autotable'
  import { format } from 'date-fns'
  import { es } from 'date-fns/locale'
  import { MARCA_POR_DEFECTO, hexARgb, suavizar, formatoImagen, type MarcaDocumento } from '@/lib/documentos/marca'

  type OpcionesPDF = { logoDataUrl?: string | null; marca?: MarcaDocumento | null }

  /** Marca a usar: la que se pasa (servidor) o la de la empresa del usuario (navegador). */
  async function resolverMarca(opts: OpcionesPDF): Promise<MarcaDocumento> {
      if (opts.marca) return opts.marca
      if (typeof window !== 'undefined') {
          try {
              const { cargarMarcaCliente } = await import('@/lib/documentos/marca-cliente')
              return await cargarMarcaCliente()
          } catch (e) {
              console.warn('No se pudo cargar la marca de la empresa', e)
          }
      }
      return { ...MARCA_POR_DEFECTO, logoDataUrl: opts.logoDataUrl ?? null }
  }

  /** Cabecera común: franja de color, logo (manteniendo proporción) y datos de la empresa. */
  function pintarCabecera(pdf: jsPDF, marca: MarcaDocumento) {
      const color = hexARgb(marca.color)
      pdf.setFillColor(...color)
      pdf.rect(0, 0, 210, 3, 'F')
      const logo = marca.logoDataUrl
      if (logo) {
          try {
              const props = (pdf as any).getImageProperties(logo)
              const maxW = 45, maxH = 24
              const escala = Math.min(maxW / props.width, maxH / props.height)
              pdf.addImage(logo, formatoImagen(logo), 15, 14, props.width * escala, props.height * escala, 'logo-empresa', 'FAST')
          } catch (e) {
              console.warn('Logo no válido para el PDF', e)
          }
      }
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(marca.nombre || '', 15, 55)
      pdf.setFontSize(8)
      pdf.setTextColor(80, 80, 80)
      pdf.setFont('helvetica', 'normal')
      let y = 60
      const linea = (t?: string | null) => { if (t) { pdf.text(pdf.splitTextToSize(t, 85), 15, y); y += 4 * pdf.splitTextToSize(t, 85).length } }
      linea(marca.nif ? `NIF: ${marca.nif}` : null)
      linea(marca.direccion)
      linea(marca.email ? `Email: ${marca.email}` : null)
      linea(marca.telefono ? `Tel: ${marca.telefono}` : null)
      linea(marca.web)
  }

  /** Pie personalizable en todas las páginas. */
  function pintarPie(pdf: jsPDF, marca: MarcaDocumento) {
      if (!marca.pie) return
      const paginas = (pdf as any).getNumberOfPages()
      for (let i = 1; i <= paginas; i++) {
          pdf.setPage(i)
          pdf.setFontSize(7)
          pdf.setTextColor(120, 120, 120)
          pdf.setFont('helvetica', 'normal')
          const lineas = pdf.splitTextToSize(marca.pie, 180)
          pdf.text(lineas, 105, 292 - (lineas.length - 1) * 3, { align: 'center' })
      }
      pdf.setTextColor(0, 0, 0)
  }

  export const generatePDF = async (doc: any, type: 'presupuesto' | 'albaran' | 'factura', mode: 'preview' | 'download' | 'blob' | 'arraybuffer' = 'download', opts: OpcionesPDF = {}) => {
      const docTitle = type === 'presupuesto' ? 'PRESUPUESTO' : type === 'albaran' ? 'ALBARÁN' : 'FACTURA'

      const jsPDFInstance = new jsPDF()

      // 1-2. Marca de la empresa (logo, datos y color)
      const marca = await resolverMarca(opts)
      const colorMarca = hexARgb(marca.color)
      pintarCabecera(jsPDFInstance, marca)

      // 3. Document info box (Upper Right)
      const rightAlignX = 195
      jsPDFInstance.setTextColor(...colorMarca)
      jsPDFInstance.setFontSize(24)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text(docTitle, rightAlignX, 30, { align: 'right' })
      jsPDFInstance.setTextColor(0, 0, 0)

      jsPDFInstance.setFontSize(10)
      jsPDFInstance.setFont('helvetica', 'normal')
      const docNum = doc.numero && !doc.numero.includes('undefined') ? doc.numero : 'PENDIENTE'

      // Info headers table-like alignment
      let currentInfoY = 38
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('Nº DOCUMENTO:', rightAlignX - 60, currentInfoY)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text(docNum, rightAlignX, currentInfoY, { align: 'right' })
      currentInfoY += 6

      if (doc.albaran_origen_numero) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('Nº ALBARÁN:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(doc.albaran_origen_numero, rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (doc.presupuesto_origen_numero) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('Nº PRESUPUESTO:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(doc.presupuesto_origen_numero, rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('FECHA:', rightAlignX - 60, currentInfoY)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text(format(new Date(doc.fecha), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
      currentInfoY += 6

      if (doc.pedido_referencia) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('SU REFERENCIA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(doc.pedido_referencia, rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (type === 'factura' && doc.fecha_vencimiento) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('VENCIMIENTO:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(format(new Date(doc.fecha_vencimiento), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (type === 'presupuesto' && doc.fecha_validez) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('VÁLIDO HASTA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(format(new Date(doc.fecha_validez), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      // Client Block (Right Side, under info)
      const clientX = 110
      const clientY = 60
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.setFontSize(9)
      jsPDFInstance.text('CLIENTE:', clientX, clientY)

      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.setFontSize(10)
      let currentClientY = clientY + 5
      const clienteName = doc.cliente?.razon_social || doc.cliente_razon_social || ''
      if (clienteName) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text(clienteName, clientX, currentClientY)
          jsPDFInstance.setFont('helvetica', 'normal')
          currentClientY += 5
      }
      const clienteCif = doc.cliente?.cif || doc.cliente_cif || ''
      if (clienteCif) {
          jsPDFInstance.text(`CIF/NIF: ${clienteCif}`, clientX, currentClientY)
          currentClientY += 5
      }
      const clienteDir = doc.cliente?.direccion || doc.cliente_direccion || ''
      if (clienteDir) {
          const splitAddr = jsPDFInstance.splitTextToSize(clienteDir, 85)
          jsPDFInstance.text(splitAddr, clientX, currentClientY)
          currentClientY += (splitAddr.length * 5)
      }
      const clienteCP = doc.cliente?.codigo_postal || doc.cliente_codigo_postal || ''
      const clienteCiudad = doc.cliente?.ciudad || doc.cliente_ciudad || ''
      const clienteProvincia = doc.cliente?.provincia || doc.cliente_provincia || ''
      if (clienteCP || clienteCiudad || clienteProvincia) {
          const parts: string[] = []
          if (clienteCP) parts.push(clienteCP)
          if (clienteCiudad) parts.push(clienteCiudad)
          const locationLine = clienteProvincia ? `${parts.join(' ')} (${clienteProvincia})` : parts.join(' ')
          if (locationLine.trim()) jsPDFInstance.text(locationLine.trim(), clientX, currentClientY)
      }

      // 4. Main Table
      const startY = 100
      const mainBoxBottomY = 230
      const totalsBoxY = 235

      const colWidths = {
          desc: 105,
          qty: 25,
          price: 25,
          total: 25
      }
      const marginX = 15
      const tableWidth = 180

      const xDesc = marginX
      const xQty = xDesc + colWidths.desc
      const xPrice = xQty + colWidths.qty
      const xTotal = xPrice + colWidths.price
      const xEnd = xTotal + colWidths.total

      // Vertical Lines & Border
      jsPDFInstance.setDrawColor(200)
      jsPDFInstance.setLineWidth(0.1)
      jsPDFInstance.rect(marginX, startY, tableWidth, mainBoxBottomY - startY)
      jsPDFInstance.line(xQty, startY, xQty, mainBoxBottomY)
      jsPDFInstance.line(xPrice, startY, xPrice, mainBoxBottomY)
      jsPDFInstance.line(xTotal, startY, xTotal, mainBoxBottomY)

      // Table Header Background
      jsPDFInstance.setFillColor(...suavizar(colorMarca))
      jsPDFInstance.rect(marginX, startY, tableWidth, 10, 'F')
      jsPDFInstance.setDrawColor(0)
      jsPDFInstance.line(marginX, startY + 10, marginX + tableWidth, startY + 10)

      jsPDFInstance.setFontSize(9)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('DESCRIPCION', xDesc + 5, startY + 6.5)
      jsPDFInstance.text('CANTIDAD', xQty + (colWidths.qty / 2), startY + 6.5, { align: 'center' })
      jsPDFInstance.text('PRECIO', xPrice + (colWidths.price / 2), startY + 6.5, { align: 'center' })
      jsPDFInstance.text('IMPORTE', xTotal + (colWidths.total / 2), startY + 6.5, { align: 'center' })

      // Table Content
      const tableBody = doc.lineas.map((line: any) => [
          line.descripcion,
          Number(line.cantidad).toLocaleString('es-ES'),
          `${Number(line.precio_unitario).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
          `${(Number(line.cantidad) * Number(line.precio_unitario)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
      ])

      autoTable(jsPDFInstance, {
          startY: startY + 10,
          body: tableBody,
          theme: 'plain',
          tableWidth: tableWidth,
          margin: { left: marginX },
          styles: {
              fontSize: 9,
              cellPadding: 4,
              valign: 'top',
              textColor: 0,
              font: 'helvetica'
          },
          columnStyles: {
              0: { cellWidth: colWidths.desc },
              1: { cellWidth: colWidths.qty, halign: 'center' },
              2: { cellWidth: colWidths.price, halign: 'center' },
              3: { cellWidth: colWidths.total, halign: 'center' }
          }
      })

      // Observations
      const finalY = (jsPDFInstance as any).lastAutoTable.finalY || (startY + 15)
      if (doc.observaciones) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('OBSERVACIONES:', marginX, finalY + 30)
          jsPDFInstance.setFont('helvetica', 'normal')
          const splitObs = jsPDFInstance.splitTextToSize(doc.observaciones, tableWidth - 10)
          jsPDFInstance.text(splitObs, marginX, finalY + 35)
      }

      // Totals Box
      const baseImponible = Number(doc.base_imponible) || doc.lineas.reduce((acc: number, l: any) => acc + (Number(l.cantidad) * Number(l.precio_unitario)), 0)
      const ivaPct = Number(doc.iva_porcentaje) || 21
      const ivaImp = Number(doc.iva_importe) || (baseImponible * (ivaPct / 100))
      const totalDoc = Number(doc.total) || (baseImponible + ivaImp)

      const footerX = 140
      const footerWidth = 55
      let footerY = totalsBoxY

      const drawFooterRow = (label: string, value: string, isTotal = false) => {
          jsPDFInstance.setDrawColor(200)
          jsPDFInstance.rect(footerX, footerY, footerWidth, 8)
          jsPDFInstance.setFont('helvetica', isTotal ? 'bold' : 'normal')
          if (isTotal) jsPDFInstance.setFillColor(...suavizar(colorMarca, 0.8)), jsPDFInstance.rect(footerX, footerY, footerWidth, 8, 'F')

          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text(label, footerX + 2, footerY + 5.5)
          jsPDFInstance.setFontSize(9)
          jsPDFInstance.text(value, footerX + footerWidth - 2, footerY + 5.5, { align: 'right' })
          footerY += 8
      }

      drawFooterRow('BASE IMPONIBLE', `${baseImponible.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawFooterRow(`IVA ${ivaPct}%`, `${ivaImp.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawFooterRow('TOTAL', `${totalDoc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, true)

      if (type === 'factura' && (doc.forma_pago || doc.metodo_pago)) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text('FORMA DE PAGO:', marginX, totalsBoxY + 5)
          jsPDFInstance.setFont('helvetica', 'normal')
          const lineasPago = jsPDFInstance.splitTextToSize(String(doc.forma_pago || doc.metodo_pago), 115)
          jsPDFInstance.text(lineasPago, marginX, totalsBoxY + 10)
          const iban = doc.iban || (marca.mostrarIban ? marca.iban : null)
          if (iban) jsPDFInstance.text(`IBAN: ${iban}`, marginX, totalsBoxY + 10 + lineasPago.length * 4)
      } else if (type === 'factura' && marca.mostrarIban && marca.iban) {
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text(`IBAN: ${marca.iban}`, marginX, totalsBoxY + 5)
      }

      if (type === 'factura' && marca.textoFactura) {
          jsPDFInstance.setFontSize(7)
          jsPDFInstance.setTextColor(90, 90, 90)
          jsPDFInstance.text(jsPDFInstance.splitTextToSize(marca.textoFactura, 115), marginX, totalsBoxY + 22)
          jsPDFInstance.setTextColor(0, 0, 0)
      }

      pintarPie(jsPDFInstance, marca)

      if (mode === 'preview') {
          const blob = jsPDFInstance.output('bloburl')
          return blob
      } else if (mode === 'arraybuffer') {
          return jsPDFInstance.output('arraybuffer')
      } else if (mode === 'blob') {
          return jsPDFInstance.output('blob')
      } else {
          jsPDFInstance.save(`${docTitle}_${docNum}.pdf`)
      }
  }

  export const generateGastoPDF = async (gasto: any, mode: 'preview' | 'download' | 'blob' = 'download', opts: OpcionesPDF = {}) => {
      const jsPDFInstance = new jsPDF()
      const marca = await resolverMarca(opts)
      pintarCabecera(jsPDFInstance, marca)

      const rightAlignX = 195
      jsPDFInstance.setTextColor(0, 0, 0)
      jsPDFInstance.setFontSize(20)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('GASTO', rightAlignX, 30, { align: 'right' })

      jsPDFInstance.setFontSize(10)
      let currentInfoY = 38
      const docNum = gasto.numero || 'S/N'

      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('Nº DOCUMENTO:', rightAlignX - 60, currentInfoY)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text(docNum, rightAlignX, currentInfoY, { align: 'right' })
      currentInfoY += 6

      if (gasto.fecha) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('FECHA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(format(new Date(gasto.fecha), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (gasto.referencia_pedido) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('REFERENCIA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(gasto.referencia_pedido, rightAlignX, currentInfoY, { align: 'right' })
      }

      const supplierX = 110
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.setFontSize(9)
      jsPDFInstance.text('PROVEEDOR:', supplierX, 60)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.setFontSize(10)
      if (gasto.proveedor) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text(gasto.proveedor, supplierX, 66)
          jsPDFInstance.setFont('helvetica', 'normal')
      }
      if (gasto.proveedor_cif) {
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.setTextColor(80, 80, 80)
          jsPDFInstance.text(`CIF/NIF: ${gasto.proveedor_cif}`, supplierX, 72)
          jsPDFInstance.setTextColor(0, 0, 0)
      }

      const startY = 95
      const marginX = 15
      const tableWidth = 180

      jsPDFInstance.setFillColor(245, 245, 245)
      jsPDFInstance.rect(marginX, startY, tableWidth, 8, 'F')
      jsPDFInstance.setDrawColor(200)
      jsPDFInstance.setLineWidth(0.1)
      jsPDFInstance.rect(marginX, startY, tableWidth, 8)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.setFontSize(9)
      jsPDFInstance.setTextColor(0, 0, 0)
      jsPDFInstance.text('DESCRIPCIÓN DEL GASTO', marginX + 3, startY + 5.5)

      const desc = gasto.descripcion || gasto.concepto || 'Sin descripción'
      jsPDFInstance.setFont('helvetica', 'normal')
      const splitDesc = jsPDFInstance.splitTextToSize(desc, tableWidth - 6)
      jsPDFInstance.text(splitDesc, marginX + 3, startY + 16)

      const footerX = 140
      const footerWidth = 55
      let footerY = startY + 42

      const baseImponible = Number(gasto.base_imponible) || 0
      const ivaPct = Number(gasto.iva_porcentaje) || 21
      const ivaImp = Number(gasto.iva_importe) || 0
      const totalDoc = Number(gasto.total) || 0

      const drawRow = (label: string, value: string, isTotal = false) => {
          jsPDFInstance.setDrawColor(200)
          jsPDFInstance.rect(footerX, footerY, footerWidth, 8)
          if (isTotal) {
              jsPDFInstance.setFillColor(245, 245, 245)
              jsPDFInstance.rect(footerX, footerY, footerWidth, 8, 'F')
          }
          jsPDFInstance.setFont('helvetica', isTotal ? 'bold' : 'normal')
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text(label, footerX + 2, footerY + 5.5)
          jsPDFInstance.setFontSize(9)
          jsPDFInstance.text(value, footerX + footerWidth - 2, footerY + 5.5, { align: 'right' })
          footerY += 8
      }

      drawRow('BASE IMPONIBLE', `${baseImponible.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawRow(`IVA ${ivaPct}%`, `${ivaImp.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawRow('TOTAL', `${totalDoc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, true)

      const safeNum = docNum.replace(/[/\\?%*:|"<>]/g, '-')

      if (mode === 'preview') {
          return jsPDFInstance.output('bloburl')
      } else if (mode === 'blob') {
          return jsPDFInstance.output('blob')
      } else {
          jsPDFInstance.save(`Gasto_${safeNum}.pdf`)
      }
  }

  function getImageData(url: string): Promise<{ data: string, width: number, height: number } | null> {
      // En servidor no hay Image/canvas: el logo se pasa ya cargado en opts.logoDataUrl.
      if (typeof window === 'undefined') return Promise.resolve(null)
      return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve(null);
              ctx.drawImage(img, 0, 0);
              resolve({ data: canvas.toDataURL('image/png'), width: img.width, height: img.height });
          };
          img.onerror = () => resolve(null);
      });
  }
