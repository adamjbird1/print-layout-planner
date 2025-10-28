import { EPSILON, MAX_SHEET_GRID } from '../constants'
import type { PrintObject } from '../types'

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

export function optimisePackingLayout(objects: PrintObject[], sheetWidthMm: number, sheetHeightMm: number) {
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
