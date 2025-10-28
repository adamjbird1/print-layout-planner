export type Unit = 'mm' | 'cm' | 'in'

export type PaperSize = {
  id: string
  label: string
  widthMm: number
  heightMm: number
}

export type TextureFormat = 'PNG' | 'JPEG' | 'WEBP'

export type PrintObject = {
  id: string
  label: string
  widthMm: number
  heightMm: number
  xMm: number
  yMm: number
  color: string
  textureSrc?: string
  textureName?: string
  textureFormat?: TextureFormat
}

export type SheetDimensions = {
  widthMm: number
  heightMm: number
}
