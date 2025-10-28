import type { PaperSize, TextureFormat, Unit } from './types'

export const PAPER_SIZES: PaperSize[] = [
  { id: 'a5', label: 'A5 · 148 × 210 mm', widthMm: 148, heightMm: 210 },
  { id: 'a4', label: 'A4 · 210 × 297 mm', widthMm: 210, heightMm: 297 },
  { id: 'a3', label: 'A3 · 297 × 420 mm', widthMm: 297, heightMm: 420 },
  { id: 'a2', label: 'A2 · 420 × 594 mm', widthMm: 420, heightMm: 594 },
  { id: 'a1', label: 'A1 · 594 × 841 mm', widthMm: 594, heightMm: 841 },
  { id: 'letter', label: 'US Letter · 8.5 × 11 in', widthMm: 215.9, heightMm: 279.4 },
  { id: 'tabloid', label: 'US Tabloid · 11 × 17 in', widthMm: 279.4, heightMm: 431.8 },
]

export const UNIT_MULTIPLIERS: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
}

export const UNIT_LABELS: Record<Unit, string> = {
  mm: 'Millimetres (mm)',
  cm: 'Centimetres (cm)',
  in: 'Inches (in)',
}

export const COLOR_PALETTE = ['#5c6ac4', '#47a3f3', '#ec8c69', '#3f9c84', '#a364d9', '#fcda59']

export const MAX_SHEET_GRID = 24

export const EPSILON = 0.0001

export const SUPPORTED_TEXTURE_FORMATS: Record<string, TextureFormat> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/webp': 'WEBP',
}
