import photosJson from '../../config/photos.json'

export interface PhotoInfo {
  src: string
  width: number
  height: number
  /** "Photo: author · licence · source", shown with the picture (licence attribution) */
  credit: string
}

/** Free-licensed photos by id. scripts/fetch-photos.ts writes the manifest and public/images/photos. */
export const PHOTOS: Record<string, PhotoInfo> = photosJson

export const photoCredit = (id: string | undefined) => (id ? PHOTOS[id]?.credit : undefined)
