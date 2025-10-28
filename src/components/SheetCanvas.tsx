import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PrintObject } from '../types'

type SheetCanvasProps = {
  sheetWidthMm: number
  sheetHeightMm: number
  columns: number
  rows: number
  objects: PrintObject[]
  onUpdateObjectPosition: (id: string, xMm: number, yMm: number) => void
}

export function SheetCanvas({
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
      const padding = 32
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
