import { jsPDF } from 'jspdf'
import { EPSILON } from '../constants'
import type { PrintObject, SheetDimensions } from '../types'

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const expand = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized
  const int = Number.parseInt(expand, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })

export async function exportLayoutToPdf(
  objects: PrintObject[],
  sheet: SheetDimensions,
  columns: number,
  rows: number,
) {
  if (objects.length === 0) {
    window.alert('Add one or more print objects before exporting.')
    return
  }

  const textures = new Map<string, { image: HTMLImageElement; widthPx: number; heightPx: number }>()

  try {
    await Promise.all(
      objects
        .filter((object) => object.textureSrc)
        .map(async (object) => {
          if (!object.textureSrc) return
          const image = await loadImage(object.textureSrc)
          textures.set(object.id, {
            image,
            widthPx: image.naturalWidth,
            heightPx: image.naturalHeight,
          })
        }),
    )
  } catch (error) {
    console.error('Texture loading error', error)
    window.alert('We could not load one of the textures. Please re-upload it and try again.')
    return
  }

  const orientationSetting = sheet.widthMm >= sheet.heightMm ? 'landscape' : 'portrait'
  const doc = new jsPDF({
    orientation: orientationSetting,
    unit: 'mm',
    format: [sheet.widthMm, sheet.heightMm],
  })

  const scratchCanvas = document.createElement('canvas')
  const scratchContext = scratchCanvas.getContext('2d')

  if (!scratchContext) {
    window.alert('We could not prepare the export canvas. Please try again in a modern browser.')
    return
  }

  let hasAnyPage = false

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const originX = columnIndex * sheet.widthMm
      const originY = rowIndex * sheet.heightMm
      const drawCommands: Array<() => void> = []

      objects.forEach((object) => {
        const objectRight = object.xMm + object.widthMm
        const objectBottom = object.yMm + object.heightMm
        const interLeft = Math.max(object.xMm, originX)
        const interTop = Math.max(object.yMm, originY)
        const interRight = Math.min(objectRight, originX + sheet.widthMm)
        const interBottom = Math.min(objectBottom, originY + sheet.heightMm)
        const interWidth = interRight - interLeft
        const interHeight = interBottom - interTop

        if (interWidth <= EPSILON || interHeight <= EPSILON) {
          return
        }

        const relativeX = interLeft - originX
        const relativeY = interTop - originY
        const texture = textures.get(object.id)

        if (texture) {
          const { image, widthPx, heightPx } = texture
          const scaleX = widthPx / object.widthMm
          const scaleY = heightPx / object.heightMm
          const sxFloat = Math.max(0, (interLeft - object.xMm) * scaleX)
          const syFloat = Math.max(0, (interTop - object.yMm) * scaleY)
          const sWidthFloat = Math.max(1, Math.min(widthPx - sxFloat, interWidth * scaleX))
          const sHeightFloat = Math.max(1, Math.min(heightPx - syFloat, interHeight * scaleY))

          const canvasWidth = Math.max(1, Math.round(sWidthFloat))
          const canvasHeight = Math.max(1, Math.round(sHeightFloat))
          scratchCanvas.width = canvasWidth
          scratchCanvas.height = canvasHeight
          scratchContext.clearRect(0, 0, canvasWidth, canvasHeight)
          scratchContext.drawImage(
            image,
            sxFloat,
            syFloat,
            sWidthFloat,
            sHeightFloat,
            0,
            0,
            canvasWidth,
            canvasHeight,
          )
          const segmentDataUrl = scratchCanvas.toDataURL('image/png')

          drawCommands.push(() => {
            doc.addImage(segmentDataUrl, 'PNG', relativeX, relativeY, interWidth, interHeight)
            doc.rect(relativeX, relativeY, interWidth, interHeight, 'S')
          })
        } else {
          const rgb = hexToRgb(object.color)
          drawCommands.push(() => {
            doc.setFillColor(rgb.r, rgb.g, rgb.b)
            doc.rect(relativeX, relativeY, interWidth, interHeight, 'FD')
          })
        }
      })

      if (drawCommands.length > 0) {
        if (!hasAnyPage) {
          hasAnyPage = true
        } else {
          doc.addPage()
        }
        doc.setDrawColor(180, 187, 201)
        doc.setLineWidth(0.25)
        drawCommands.forEach((draw) => draw())
      }
    }
  }

  if (!hasAnyPage) {
    window.alert('Nothing to export — make sure objects are placed within the sheet layout.')
    return
  }

  doc.save('print-layout.pdf')
}
