import { useRef } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { MAX_SHEET_GRID, PAPER_SIZES, UNIT_LABELS } from '../constants'
import type { PrintObject, Unit } from '../types'

type ControlPanelProps = {
  paperSizeId: string
  orientation: 'portrait' | 'landscape'
  sheetColumns: number
  sheetRows: number
  unit: Unit
  widthInput: string
  heightInput: string
  quantityInput: string
  formError: string | null
  objects: PrintObject[]
  onPaperSizeChange: (value: string) => void
  onOrientationChange: (value: 'portrait' | 'landscape') => void
  onSheetColumnsChange: (value: number) => void
  onSheetRowsChange: (value: number) => void
  onUnitChange: (value: Unit) => void
  onWidthInputChange: (value: string) => void
  onHeightInputChange: (value: string) => void
  onQuantityInputChange: (value: string) => void
  onAddPrintObject: (event: FormEvent<HTMLFormElement>) => void
  onSelectTexture: (id: string, event: ChangeEvent<HTMLInputElement>) => void
  onClearTexture: (id: string) => void
  onRemoveObject: (id: string) => void
  onOptimise: () => void
  onExportPdf: () => void
  onResetLayout: () => void
}

export function ControlPanel({
  paperSizeId,
  orientation,
  sheetColumns,
  sheetRows,
  unit,
  widthInput,
  heightInput,
  quantityInput,
  formError,
  objects,
  onPaperSizeChange,
  onOrientationChange,
  onSheetColumnsChange,
  onSheetRowsChange,
  onUnitChange,
  onWidthInputChange,
  onHeightInputChange,
  onQuantityInputChange,
  onAddPrintObject,
  onSelectTexture,
  onClearTexture,
  onRemoveObject,
  onOptimise,
  onExportPdf,
  onResetLayout,
}: ControlPanelProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  return (
    <aside className="control-panel">
      <h1>Print Layout Planner</h1>
      <p className="control-panel__intro">
        Pick a paper size, add your print objects, and drag them into place. When you’re ready we’ll add automatic
        layout optimisation.
      </p>

      <section className="control-panel__section">
        <h2>Paper setup</h2>
        <label className="control-panel__label">
          Paper size
          <select
            value={paperSizeId}
            onChange={(event) => onPaperSizeChange(event.target.value)}
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
              onClick={() => onOrientationChange('portrait')}
            >
              Portrait
            </button>
            <button
              type="button"
              className={orientation === 'landscape' ? 'is-active' : ''}
              onClick={() => onOrientationChange('landscape')}
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
                onSheetColumnsChange(nextColumns)
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
                onSheetRowsChange(nextRows)
              }}
            />
          </label>
        </div>
      </section>

      <section className="control-panel__section">
        <h2>Add print object</h2>
        <form onSubmit={onAddPrintObject} className="object-form">
          <div className="object-form__row">
            <label>
              Width
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={widthInput}
                onChange={(event) => onWidthInputChange(event.target.value)}
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
                onChange={(event) => onHeightInputChange(event.target.value)}
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
                onChange={(event) => onQuantityInputChange(event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Units
            <select value={unit} onChange={(event) => onUnitChange(event.target.value as Unit)}>
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
                    onChange={(event) => onSelectTexture(object.id, event)}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => fileInputRefs.current[object.id]?.click()}>
                    {object.textureSrc ? 'Replace texture' : 'Upload texture'}
                  </button>
                  {object.textureSrc && (
                    <button type="button" onClick={() => onClearTexture(object.id)}>
                      Remove texture
                    </button>
                  )}
                  <button type="button" onClick={() => onRemoveObject(object.id)} className="danger">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="control-panel__actions">
          <button type="button" onClick={onOptimise}>
            Optimise layout
          </button>
          <button type="button" onClick={onExportPdf} className="primary">
            Export PDF
          </button>
          <button type="button" onClick={onResetLayout} className="danger">
            Clear objects
          </button>
        </div>
      </section>
    </aside>
  )
}
