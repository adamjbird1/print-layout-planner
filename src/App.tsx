import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'
import { ControlPanel } from './components/ControlPanel'
import { SheetCanvas } from './components/SheetCanvas'
import {
  COLOR_PALETTE,
  PAPER_SIZES,
  SUPPORTED_TEXTURE_FORMATS,
  UNIT_MULTIPLIERS,
} from './constants'
import { exportLayoutToPdf } from './helpers/exportPdf'
import { optimisePackingLayout } from './helpers/packing'
import type { PrintObject, SheetDimensions, TextureFormat, Unit } from './types'

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

  const selectedPaperSize = useMemo(
    () => PAPER_SIZES.find((size) => size.id === paperSizeId) ?? PAPER_SIZES[1],
    [paperSizeId],
  )

  const sheetDimensions = useMemo<SheetDimensions>(() => {
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

    const format: TextureFormat | undefined = SUPPORTED_TEXTURE_FORMATS[file.type]
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

  const handleExportPdf = () => {
    void exportLayoutToPdf(objects, sheetDimensions, sheetColumns, sheetRows)
  }

  return (
    <div className="app-root">
      <ControlPanel
        paperSizeId={paperSizeId}
        orientation={orientation}
        sheetColumns={sheetColumns}
        sheetRows={sheetRows}
        unit={unit}
        widthInput={widthInput}
        heightInput={heightInput}
        quantityInput={quantityInput}
        formError={formError}
        objects={objects}
        onPaperSizeChange={setPaperSizeId}
        onOrientationChange={setOrientation}
        onSheetColumnsChange={setSheetColumns}
        onSheetRowsChange={setSheetRows}
        onUnitChange={setUnit}
        onWidthInputChange={setWidthInput}
        onHeightInputChange={setHeightInput}
        onQuantityInputChange={setQuantityInput}
        onAddPrintObject={addPrintObject}
        onSelectTexture={handleTextureSelection}
        onClearTexture={clearTexture}
        onRemoveObject={removeObject}
        onOptimise={handleOptimise}
        onExportPdf={handleExportPdf}
        onResetLayout={resetLayout}
      />

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
