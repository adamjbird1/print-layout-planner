import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { jsPDF } from 'jspdf'
import './App.css'

type Unit = 'mm' | 'cm' | 'in'

type PaperSize = {
  id: string
  label: string
  widthMm: number
  heightMm: number
}

type PrintObject = {
  id: string
  label: string
  widthMm: number
  heightMm: number
  xMm: number
  yMm: number
  color: string
  textureSrc?: string
  textureName?: string
  textureFormat?: 'PNG' | 'JPEG' | 'WEBP'
}

type SheetCanvasProps = {
  sheetWidthMm: number
  sheetHeightMm: number
  columns: number
  rows: number
  objects: PrintObject[]
  onUpdateObjectPosition: (id: string, xMm: number, yMm: number) => void
}

const PAPER_SIZES: PaperSize[] = [
  { id: 'a5', label: 'A5 · 148 × 210 mm', widthMm: 148, heightMm: 210 },
  { id: 'a4', label: 'A4 · 210 × 297 mm', widthMm: 210, heightMm: 297 },
  { id: 'a3', label: 'A3 · 297 × 420 mm', widthMm: 297, heightMm: 420 },
  { id: 'a2', label: 'A2 · 420 × 594 mm', widthMm: 420, heightMm: 594 },
  { id: 'a1', label: 'A1 · 594 × 841 mm', widthMm: 594, heightMm: 841 },
  { id: 'letter', label: 'US Letter · 8.5 × 11 in', widthMm: 215.9, heightMm: 279.4 },
  { id: 'tabloid', label: 'US Tabloid · 11 × 17 in', widthMm: 279.4, heightMm: 431.8 },
]

const UNIT_MULTIPLIERS: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
}

const UNIT_LABELS: Record<Unit, string> = {
  mm: 'Millimetres (mm)',
  cm: 'Centimetres (cm)',
  in: 'Inches (in)',
}

const COLOR_PALETTE = ['#5c6ac4', '#47a3f3', '#ec8c69', '#3f9c84', '#a364d9', '#fcda59']
const MAX_SHEET_GRID = 24
const EPSILON = 0.0001
const SUPPORTED_TEXTURE_FORMATS: Record<string, 'PNG' | 'JPEG' | 'WEBP'> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/webp': 'WEBP',
}

type PackingPlacement = {
  xMm: number
  yMm: number
}

type PackingResult = {
  columns: number
  rows: number
  placements: Map<string, PackingPlacement>
  layoutWidthMm: number
  layoutHeightMm: number
  wasteArea: number
}

type Shelf = {
  yMm: number
  heightMm: number
  usedWidthMm: number
}

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

function packWithinWidth(rectangles: PrintObject[], maxWidthMm: number) {
  const shelves: Shelf[] = []
  const placements = new Map<string, PackingPlacement>()
  let totalHeightMm = 0
  let maxUsedWidthMm = 0

  for (const rect of rectangles) {
    if (rect.widthMm > maxWidthMm + EPSILON) {
      return null
    }

    let bestShelfIndex = -1
    let tightestRemaining = Number.POSITIVE_INFINITY

    for (let index = 0; index < shelves.length; index += 1) {
      const shelf = shelves[index]
      const projectedWidth = shelf.usedWidthMm + rect.widthMm
      if (projectedWidth <= maxWidthMm + EPSILON) {
        const remaining = maxWidthMm - projectedWidth
        if (remaining < tightestRemaining) {
          tightestRemaining = remaining
          bestShelfIndex = index
        }
      }
    }

    if (bestShelfIndex === -1) {
      const newShelf: Shelf = {
        yMm: totalHeightMm,
        heightMm: rect.heightMm,
        usedWidthMm: rect.widthMm,
      }
      shelves.push(newShelf)
      placements.set(rect.id, { xMm: 0, yMm: newShelf.yMm })
      totalHeightMm += rect.heightMm
      maxUsedWidthMm = Math.max(maxUsedWidthMm, rect.widthMm)
      continue
    }

    const shelf = shelves[bestShelfIndex]
    const placementX = shelf.usedWidthMm
    placements.set(rect.id, { xMm: placementX, yMm: shelf.yMm })
    shelf.usedWidthMm += rect.widthMm
    maxUsedWidthMm = Math.max(maxUsedWidthMm, shelf.usedWidthMm)

    if (rect.heightMm > shelf.heightMm) {
      const deltaHeight = rect.heightMm - shelf.heightMm
      shelf.heightMm = rect.heightMm
      for (let i = bestShelfIndex + 1; i < shelves.length; i += 1) {
        shelves[i].yMm += deltaHeight
      }
      totalHeightMm += deltaHeight
    }
  }

  const heightExtent =
    shelves.length === 0
      ? 0
      : shelves[shelves.length - 1].yMm + shelves[shelves.length - 1].heightMm
  const layoutHeightMm = Math.max(totalHeightMm, heightExtent)

  return {
    placements,
    totalHeightMm: layoutHeightMm,
    usedWidthMm: Math.min(maxWidthMm, maxUsedWidthMm),
  }
}

function optimisePackingLayout(objects: PrintObject[], sheetWidthMm: number, sheetHeightMm: number) {
  if (!objects.length) {
    return null
  }

  const sorted = [...objects].sort((a, b) => {
    const aKey = Math.max(a.widthMm, a.heightMm)
    const bKey = Math.max(b.widthMm, b.heightMm)
    if (bKey !== aKey) {
      return bKey - aKey
    }
    return b.heightMm - a.heightMm || b.widthMm - a.widthMm
  })

  const totalArea = sorted.reduce((sum, rect) => sum + rect.widthMm * rect.heightMm, 0)
  const maxWidthRequirement = sorted.reduce((max, rect) => Math.max(max, rect.widthMm), 0)

  const minimumColumns = Math.max(1, Math.ceil(maxWidthRequirement / sheetWidthMm))
  const maximumColumns = Math.max(minimumColumns, MAX_SHEET_GRID)

  let best: PackingResult | null = null

  for (let columns = minimumColumns; columns <= maximumColumns; columns += 1) {
    const maxLayoutWidth = columns * sheetWidthMm
    const packing = packWithinWidth(sorted, maxLayoutWidth)
    if (!packing) {
      continue
    }

    const rows = Math.max(1, Math.ceil(packing.totalHeightMm / sheetHeightMm))
    const layoutWidth = Math.min(maxLayoutWidth, Math.max(sheetWidthMm, packing.usedWidthMm))
    const layoutHeight = Math.max(packing.totalHeightMm, rows * sheetHeightMm)
    const wasteArea = columns * rows * sheetWidthMm * sheetHeightMm - totalArea

    if (
      !best ||
      wasteArea < best.wasteArea - 0.5 ||
      (Math.abs(wasteArea - best.wasteArea) < 0.5 &&
        (rows < best.rows ||
          (rows === best.rows &&
            (columns < best.columns ||
              (columns === best.columns && packing.totalHeightMm < best.layoutHeightMm)))))
    ) {
      best = {
        columns,
        rows,
        placements: packing.placements,
        layoutWidthMm: layoutWidth,
        layoutHeightMm: layoutHeight,
        wasteArea,
      }
    }
  }

  return best
}

function SheetCanvas({
  sheetWidthMm,
  sheetHeightMm,
  columns,
  rows,
  objects,
  onUpdateObjectPosition,
}: SheetCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const dragState = useRef<{
    id: string
    offsetXMm: number
    offsetYMm: number
    widthMm: number
    heightMm: number
  } | null>(null)

  const totalWidthMm = useMemo(() => sheetWidthMm * columns, [sheetWidthMm, columns])
  const totalHeightMm = useMemo(() => sheetHeightMm * rows, [sheetHeightMm, rows])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const updateScale = () => {
      const bounds = container.getBoundingClientRect()
      const padding = 32 // keep a visual margin around the sheet
      const availableWidth = Math.max(bounds.width - padding, 100)
      const availableHeight = Math.max(bounds.height - padding, 100)
      const nextScale = Math.min(availableWidth / totalWidthMm, availableHeight / totalHeightMm)
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1)
    }

    updateScale()

    const resizeObserver = new ResizeObserver(updateScale)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [totalWidthMm, totalHeightMm])

  useEffect(() => {
    // Reset drag state if dimensions change to avoid stale bounds
    dragState.current = null
  }, [totalWidthMm, totalHeightMm])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>, object: PrintObject) => {
    if (!sheetRef.current) return
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const objectRect = target.getBoundingClientRect()
    const offsetXMm = (event.clientX - objectRect.left) / scale
    const offsetYMm = (event.clientY - objectRect.top) / scale

    dragState.current = {
      id: object.id,
      offsetXMm,
      offsetYMm,
      widthMm: object.widthMm,
      heightMm: object.heightMm,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !sheetRef.current) return

    const sheetRect = sheetRef.current.getBoundingClientRect()
    const { id, offsetXMm, offsetYMm, widthMm: objWidth, heightMm: objHeight } = dragState.current

    const relativeX = (event.clientX - sheetRect.left) / scale
    const relativeY = (event.clientY - sheetRect.top) / scale

    const maxX = Math.max(totalWidthMm - objWidth, 0)
    const maxY = Math.max(totalHeightMm - objHeight, 0)
    const minX = Math.min(0, totalWidthMm - objWidth)
    const minY = Math.min(0, totalHeightMm - objHeight)

    const clampedX = Math.min(Math.max(relativeX - offsetXMm, minX), maxX)
    const clampedY = Math.min(Math.max(relativeY - offsetYMm, minY), maxY)

    onUpdateObjectPosition(id, clampedX, clampedY)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragState.current = null
  }

  return (
    <div className="sheet-panel">
      <div className="sheet-panel__header">
        <div>
          <div className="sheet-panel__title">
            Layout {Math.round(totalWidthMm)} × {Math.round(totalHeightMm)} mm
          </div>
          <div className="sheet-panel__meta">
            {columns} × {rows} sheets · {Math.round(sheetWidthMm)} × {Math.round(sheetHeightMm)} mm each
          </div>
        </div>
        <span className="sheet-panel__scale">Scale · 1 mm = {scale.toFixed(2)} px</span>
      </div>
      <div ref={containerRef} className="sheet-panel__canvas">
        <div
          ref={sheetRef}
          className="sheet"
          style={{
            width: totalWidthMm * scale,
            height: totalHeightMm * scale,
          }}
        >
          {Array.from({ length: rows }).map((_, rowIndex) =>
            Array.from({ length: columns }).map((_, columnIndex) => (
              <div
                key={`sheet-${rowIndex}-${columnIndex}`}
                className="sheet-cell"
                style={{
                  width: sheetWidthMm * scale,
                  height: sheetHeightMm * scale,
                  left: columnIndex * sheetWidthMm * scale,
                  top: rowIndex * sheetHeightMm * scale,
                }}
              />
            )),
          )}
          {objects.map((object) => (
            <div
              key={object.id}
              className={`sheet-object${object.textureSrc ? ' has-texture' : ''}`}
              style={{
                left: object.xMm * scale,
                top: object.yMm * scale,
                width: object.widthMm * scale,
                height: object.heightMm * scale,
                backgroundColor: object.textureSrc ? '#ffffff' : object.color,
                backgroundImage: object.textureSrc ? `url(${object.textureSrc})` : undefined,
                border: object.textureSrc ? '1px solid rgba(15, 23, 42, 0.12)' : 'none',
              }}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => handlePointerDown(event, object)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div className="sheet-object__label">{object.label}</div>
              <div className="sheet-object__dimensions">
                {object.widthMm.toFixed(0)} × {object.heightMm.toFixed(0)} mm
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [paperSizeId, setPaperSizeId] = useState<string>('a4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [sheetColumns, setSheetColumns] = useState<number>(1)
  const [sheetRows, setSheetRows] = useState<number>(1)
  const [unit, setUnit] = useState<Unit>('cm')
  const [widthInput, setWidthInput] = useState<string>('')
  const [heightInput, setHeightInput] = useState<string>('')
  const [quantityInput, setQuantityInput] = useState<string>('1')
  const [objects, setObjects] = useState<PrintObject[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const selectedPaperSize = useMemo(
    () => PAPER_SIZES.find((size) => size.id === paperSizeId) ?? PAPER_SIZES[1],
    [paperSizeId],
  )

  const sheetDimensions = useMemo(() => {
    if (orientation === 'portrait') {
      return {
        widthMm: selectedPaperSize.widthMm,
        heightMm: selectedPaperSize.heightMm,
      }
    }
    return {
      widthMm: selectedPaperSize.heightMm,
      heightMm: selectedPaperSize.widthMm,
    }
  }, [orientation, selectedPaperSize])

  const layoutDimensions = useMemo(
    () => ({
      widthMm: sheetDimensions.widthMm * sheetColumns,
      heightMm: sheetDimensions.heightMm * sheetRows,
    }),
    [sheetDimensions, sheetColumns, sheetRows],
  )

  useEffect(() => {
    setObjects((current) => {
      let hasChanges = false
      const adjusted = current.map((object) => {
        const maxX = Math.max(layoutDimensions.widthMm - object.widthMm, 0)
        const maxY = Math.max(layoutDimensions.heightMm - object.heightMm, 0)
        const minX = Math.min(0, layoutDimensions.widthMm - object.widthMm)
        const minY = Math.min(0, layoutDimensions.heightMm - object.heightMm)
        const nextX = Math.min(Math.max(object.xMm, minX), maxX)
        const nextY = Math.min(Math.max(object.yMm, minY), maxY)

        if (nextX !== object.xMm || nextY !== object.yMm) {
          hasChanges = true
          return { ...object, xMm: nextX, yMm: nextY }
        }
        return object
      })
      return hasChanges ? adjusted : current
    })
  }, [layoutDimensions.widthMm, layoutDimensions.heightMm])

  const addPrintObject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const parsedWidth = parseFloat(widthInput)
    const parsedHeight = parseFloat(heightInput)

    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
      setFormError('Enter a valid width greater than zero.')
      return
    }
    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      setFormError('Enter a valid height greater than zero.')
      return
    }

    const parsedQuantity = parseInt(quantityInput, 10)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setFormError('Enter a quantity of at least 1.')
      return
    }

    const multiplier = UNIT_MULTIPLIERS[unit]
    const widthMm = parsedWidth * multiplier
    const heightMm = parsedHeight * multiplier
    const quantity = Math.min(parsedQuantity, 25)

    const notices: string[] = []

    if (parsedQuantity > 25) {
      notices.push('Quantity capped at 25 per add.')
    }

    if (widthMm > sheetDimensions.widthMm || heightMm > sheetDimensions.heightMm) {
      notices.push('This object is larger than a single sheet and will span multiple sheets.')
    }

    if (widthMm > layoutDimensions.widthMm || heightMm > layoutDimensions.heightMm) {
      notices.push('Increase the sheet grid to keep the full object within the workspace.')
    }

    const id = crypto.randomUUID?.() ?? `obj-${Date.now()}-${Math.round(Math.random() * 1000)}`
    const label = `Print ${objects.length + 1}`

    // Stagger default placement so new items are visible.
    const largestAxis = Math.max(1, Math.min(layoutDimensions.widthMm, layoutDimensions.heightMm))

    const createdObjects = Array.from({ length: quantity }).map((_, index) => {
      const globalIndex = objects.length + index
      const color = COLOR_PALETTE[globalIndex % COLOR_PALETTE.length]
      const objectId =
        index === 0
          ? id
          : crypto.randomUUID?.() ?? `obj-${Date.now()}-${Math.round(Math.random() * 1000)}`
      const baseOffset = (globalIndex * 18) % largestAxis

      const maxX = Math.max(layoutDimensions.widthMm - widthMm, 0)
      const maxY = Math.max(layoutDimensions.heightMm - heightMm, 0)
      const minX = Math.min(0, layoutDimensions.widthMm - widthMm)
      const minY = Math.min(0, layoutDimensions.heightMm - heightMm)

      return {
        id: objectId,
        label: quantity > 1 ? `Print ${globalIndex + 1}` : label,
        widthMm,
        heightMm,
        xMm: Math.min(Math.max(baseOffset, minX), maxX),
        yMm: Math.min(Math.max(baseOffset, minY), maxY),
        color,
      }
    })

    setObjects((current) => [...current, ...createdObjects])
    setWidthInput('')
    setHeightInput('')
    setQuantityInput('1')

    setFormError(notices.length ? notices.join(' • ') : null)
  }

  const updateObjectPosition = (id: string, xMm: number, yMm: number) => {
    setObjects((current) =>
      current.map((object) => (object.id === id ? { ...object, xMm, yMm } : object)),
    )
  }

  const handleTextureSelection = (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const { files } = input
    const file = files && files[0]
    if (!file) {
      return
    }

    const format = SUPPORTED_TEXTURE_FORMATS[file.type]
    if (!format) {
      setFormError('Please choose a PNG, JPG, or WebP image for the texture.')
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        setObjects((current) =>
          current.map((object) =>
            object.id === id
              ? { ...object, textureSrc: result, textureName: file.name, textureFormat: format }
              : object,
          ),
        )
        setFormError(null)
      }
      input.value = ''
    }
    reader.onerror = () => {
      setFormError('We could not read that file. Please try a different image.')
      input.value = ''
    }
    reader.readAsDataURL(file)
  }

  const removeObject = (id: string) => {
    setObjects((current) => current.filter((object) => object.id !== id))
  }

  const clearTexture = (id: string) => {
    setObjects((current) =>
      current.map((object) =>
        object.id === id
          ? { ...object, textureSrc: undefined, textureName: undefined, textureFormat: undefined }
          : object,
      ),
    )
  }

  const resetLayout = () => {
    setObjects([])
    setFormError(null)
    setQuantityInput('1')
  }

  const handleOptimise = () => {
    if (objects.length === 0) {
      window.alert('Add one or more print objects before running optimisation.')
      return
    }

    const result = optimisePackingLayout(objects, sheetDimensions.widthMm, sheetDimensions.heightMm)

    if (!result) {
      window.alert('Unable to generate an optimised layout. Try increasing the sheet grid or adjusting sizes.')
      return
    }

    setSheetColumns(result.columns)
    setSheetRows(result.rows)
    setObjects((current) =>
      current.map((object) => {
        const placement = result.placements.get(object.id)
        if (!placement) {
          return object
        }
        return {
          ...object,
          xMm: placement.xMm,
          yMm: placement.yMm,
        }
      }),
    )
    setFormError(null)
  }

  const exportToPdf = async () => {
    if (objects.length === 0) {
      window.alert('Add one or more print objects before exporting.')
      return
    }

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = src
      })

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

    const orientationSetting = sheetDimensions.widthMm >= sheetDimensions.heightMm ? 'landscape' : 'portrait'
    const doc = new jsPDF({
      orientation: orientationSetting,
      unit: 'mm',
      format: [sheetDimensions.widthMm, sheetDimensions.heightMm],
    })
    const scratchCanvas = document.createElement('canvas')
    const scratchContext = scratchCanvas.getContext('2d')

    if (!scratchContext) {
      window.alert('We could not prepare the export canvas. Please try again in a modern browser.')
      return
    }

    let hasAnyPage = false

    for (let row = 0; row < sheetRows; row += 1) {
      for (let column = 0; column < sheetColumns; column += 1) {
        const originX = column * sheetDimensions.widthMm
        const originY = row * sheetDimensions.heightMm
        const drawCommands: Array<() => void> = []

        objects.forEach((object) => {
          const objectRight = object.xMm + object.widthMm
          const objectBottom = object.yMm + object.heightMm
          const interLeft = Math.max(object.xMm, originX)
          const interTop = Math.max(object.yMm, originY)
          const interRight = Math.min(objectRight, originX + sheetDimensions.widthMm)
          const interBottom = Math.min(objectBottom, originY + sheetDimensions.heightMm)
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

  return (
    <div className="app-root">
      <aside className="control-panel">
        <h1>Print Layout Planner</h1>
        <p className="control-panel__intro">
          Pick a paper size, add your print objects, and drag them into place. When you’re ready hit 'Optimise layout' to pack them as best we can. 
        </p>

        <section className="control-panel__section">
          <h2>Paper setup</h2>
          <label className="control-panel__label">
            Paper size
            <select
              value={paperSizeId}
              onChange={(event) => setPaperSizeId(event.target.value)}
              className="control-panel__select"
            >
              {PAPER_SIZES.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>
          <div className="control-panel__orientation">
            <span>Orientation</span>
            <div className="orientation-toggle">
              <button
                type="button"
                className={orientation === 'portrait' ? 'is-active' : ''}
                onClick={() => setOrientation('portrait')}
              >
                Portrait
              </button>
              <button
                type="button"
                className={orientation === 'landscape' ? 'is-active' : ''}
                onClick={() => setOrientation('landscape')}
              >
                Landscape
              </button>
            </div>
          </div>
          <div className="sheet-grid-inputs">
                <label>
                  Sheets across
                  <input
                    type="number"
                    min={1}
                    max={Math.max(MAX_SHEET_GRID, sheetColumns)}
                    step={1}
                    value={sheetColumns}
                    onChange={(event) => {
                      const limit = Math.max(MAX_SHEET_GRID, sheetColumns)
                      const nextColumns = Math.max(1, Math.min(limit, Number(event.target.value) || 1))
                      setSheetColumns(nextColumns)
                    }}
                  />
                </label>
                <label>
                  Sheets down
                  <input
                    type="number"
                    min={1}
                    max={Math.max(MAX_SHEET_GRID, sheetRows)}
                    step={1}
                    value={sheetRows}
                    onChange={(event) => {
                      const limit = Math.max(MAX_SHEET_GRID, sheetRows)
                      const nextRows = Math.max(1, Math.min(limit, Number(event.target.value) || 1))
                      setSheetRows(nextRows)
                    }}
                  />
                </label>
          </div>
        </section>

        <section className="control-panel__section">
          <h2>Add print object</h2>
          <form onSubmit={addPrintObject} className="object-form">
            <div className="object-form__row">
              <label>
                Width
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={widthInput}
                  onChange={(event) => setWidthInput(event.target.value)}
                  required
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={heightInput}
                  onChange={(event) => setHeightInput(event.target.value)}
                  required
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="1"
                  max="25"
                  step="1"
                  inputMode="numeric"
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              Units
              <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                {(Object.keys(UNIT_LABELS) as Unit[]).map((value) => (
                  <option key={value} value={value}>
                    {UNIT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            {formError && <p className="form-warning">{formError}</p>}
            <button type="submit" className="primary">
              Add object
            </button>
          </form>
        </section>

        <section className="control-panel__section">
          <h2>Objects ({objects.length})</h2>
          {objects.length === 0 ? (
            <p className="control-panel__empty">No objects yet — add one to get started.</p>
          ) : (
            <ul className="object-list">
              {objects.map((object) => (
                <li key={object.id} style={{ borderLeftColor: object.color }}>
                  <div className="object-list__info">
                    <strong>{object.label}</strong>
                    <span>
                      {object.widthMm.toFixed(0)} × {object.heightMm.toFixed(0)} mm
                    </span>
                    <span className="object-list__texture">
                      {object.textureName ? `Texture: ${object.textureName}` : 'No texture uploaded'}
                    </span>
                  </div>
                  <div className="object-list__buttons">
                    <input
                      ref={(node) => {
                        if (node) {
                          fileInputRefs.current[object.id] = node
                        } else {
                          delete fileInputRefs.current[object.id]
                        }
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => handleTextureSelection(object.id, event)}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[object.id]?.click()}
                    >
                      {object.textureSrc ? 'Replace texture' : 'Upload texture'}
                    </button>
                    {object.textureSrc && (
                      <button type="button" onClick={() => clearTexture(object.id)}>
                        Remove texture
                      </button>
                    )}
                    <button type="button" onClick={() => removeObject(object.id)} className="danger">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="control-panel__actions">
            <button type="button" onClick={handleOptimise}>
              Optimise layout
            </button>
            <button type="button" onClick={exportToPdf} className="primary">
              Export PDF
            </button>
            <button type="button" onClick={resetLayout} className="danger">
              Clear objects
            </button>
          </div>
        </section>
      </aside>

      <main className="canvas-panel">
        <SheetCanvas
          sheetWidthMm={sheetDimensions.widthMm}
          sheetHeightMm={sheetDimensions.heightMm}
          columns={sheetColumns}
          rows={sheetRows}
          objects={objects}
          onUpdateObjectPosition={updateObjectPosition}
        />
      </main>
    </div>
  )
}

export default App
