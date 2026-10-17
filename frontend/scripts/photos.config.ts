/**
 * The photo to fetch for each photo id the app shows (species cards, lookout cards, quiz pictures).
 * Read by scripts/fetch-photos.ts, which writes public/images/photos/<id>.<ext> and src/config/photos.json.
 *
 * With only taxonId, the script picks a free-licensed photo (CC0, CC BY, CC BY-SA, public domain):
 * the taxon photos first, then research-grade observations in British Columbia, then anywhere.
 * To override a bad pick, pin observationId + photoIndex, or a Commons file.
 *
 * Run: node scripts/fetch-photos.ts [--force] [--only=orca,humpback]
 */

export type PhotoSource = {
  /** iNaturalist taxon id. */
  taxonId?: number
  /** Scientific name, checked against the taxon so a wrong id shows up in the log. */
  name?: string
  /** Wider iNaturalist taxa to try when the taxon has no free photo. */
  fallbackTaxonIds?: number[]
  /** Pin one observation photo instead of the automatic pick (photoIndex counts from 0). */
  observationId?: number
  photoIndex?: number
  /** Pin a Wikimedia Commons file ("File:…") instead of iNaturalist. */
  file?: string
  /** Commons files to try when iNaturalist has no free photo. */
  commonsFallback?: string[]
  /** Commons search (File namespace) to try last. */
  commonsSearch?: string
  /** Credit name to use instead of the one the source gives. */
  author?: string
}

// The pins were chosen by looking at the photos (October 2026): the automatic pick was a
// diagram, portrait, too small in the frame, or showed the animal being eaten.
export const PHOTOS: Record<string, PhotoSource> = {
  orca: { taxonId: 41521, name: 'Orcinus orca' },
  humpback: { taxonId: 41566, name: 'Megaptera novaeangliae' },
  'harbour-seal': { taxonId: 41708, name: 'Phoca vitulina' },
  'white-sided-dolphin': {
    taxonId: 1664971,
    name: 'Aethalodelphis obliquidens',
    file: 'File:PacificWhiteSidedDolphine.jpg', // two leaping beside the ship (NOAA)
  },
  chinook: { taxonId: 54191, name: 'Oncorhynchus tshawytscha' },
  octopus: {
    taxonId: 48863,
    name: 'Enteroctopus dofleini',
    file: 'File:Enteroctopus dolfeini.jpg', // adult on the seafloor (NOAA)
    author: 'NOAA / R. N. Lea',
  },
  'glass-sponge': {
    taxonId: 424651,
    name: 'Aphrocallistes vastus',
    fallbackTaxonIds: [152110], // Hexactinellida; neither has a free research-grade photo
    file: 'File:Aphrocallistes vastus (10.3897-BDJ.10.e76050) Figure 4.jpeg', // BC cloud sponge reef (DFO)
  },
  'bull-kelp': {
    taxonId: 120499,
    name: 'Nereocystis luetkeana',
    observationId: 397103669, // underwater forest, Steep Island BC
    photoIndex: 0,
  },
  cormorant: {
    taxonId: 1454382,
    name: 'Nannopterum auritum',
    file: 'File:Double-Crested Cormorant - Flickr - Colin Durfee.jpg', // perched, drying its wings
  },
  'great-blue-heron': {
    taxonId: 4956,
    name: 'Ardea herodias',
    file: 'File:2026-07-12 01 Great blue heron (Ardea herodias fannini) hunting - WA USA.jpg', // hunting in shallow sea water
  },
  phytoplankton: { taxonId: 123880, name: 'Bacillariophyceae' },
  'fraser-plume': {
    file: 'File:The Big Muddy, Western Edition (6987590721).jpg',
    author: 'NASA Goddard Space Flight Center',
  },
  'earth-moon': { file: 'File:NASA-Apollo8-Dec24-Earthrise-b.jpg' }, // Earthrise, Apollo 8
}
