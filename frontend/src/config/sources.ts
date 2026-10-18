/**
 * Every outside provider whose data, imagery or photos the kiosk and the bridge show, with the credit its licence
 * asks for (checked against each provider's terms on 2026-10-17). The screens take their credit text from here,
 * never typed by hand, so a credit changes in one place. SOURCES.md at the repo root lists, for each value on screen,
 * which of these it comes from, with the full citations.
 */

// Not imported from src/i18n: scripts/download-tiles.ts loads this file (through tiles.ts) in Node.
type Lang = 'en' | 'fr'
type Text = Record<Lang, string>

export interface Source {
  /** Organisation */
  name: Text
  /** Short form for a corner credit or a panel label */
  short: Text
  /** The credit line, worded as the provider asks */
  credit: Text
  licence: Text
  licenceUrl?: string
  url: string
  /** DOIs of the datasets used, where the provider issues them */
  doi?: string[]
  /** A notice the licence requires to be shown in full */
  notice?: Text
}

const OGL: Text = { en: 'Open Government Licence – Canada', fr: 'Licence du gouvernement ouvert – Canada' }
const OGL_URL = 'https://open.canada.ca/en/open-government-licence-canada'

export const SOURCES = {
  onc: {
    // ONC has no official French name: it stays in English in French text.
    name: { en: 'Ocean Networks Canada', fr: 'Ocean Networks Canada' },
    short: { en: 'ONC', fr: 'ONC' },
    credit: {
      en: 'Ocean Networks Canada: instruments aboard BC Ferries vessels (British Columbia Ferry Services Inc.) and seafloor observatories (CC BY 4.0)',
      fr: 'Ocean Networks Canada : instruments à bord des traversiers de BC Ferries (British Columbia Ferry Services Inc.) et observatoires sous-marins (CC BY 4.0)',
    },
    licence: { en: 'CC BY 4.0', fr: 'CC BY 4.0' },
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    url: 'https://data.oceannetworks.ca',
    // TWSB TSG, oxygen, optics, navigation, pressure, air temperature; the CODAR; the SCVIP and SEVIP ADCPs; TWDP TSG,
    // oxygen, optics, navigation. Titles in SOURCES.md.
    doi: [
      '10.34943/9fb1ecdb-2b07-42a3-b4a0-5f423b5db196',
      '10.34943/3943c511-0e0d-4b3a-b9a2-1f739abcb484',
      '10.34943/a6cade0b-2f5d-4081-9d1c-4c3f9640d48b',
      '10.34943/650bbbf7-c3ab-4fb5-9980-5730dfa839c3',
      '10.34943/4145870e-4d86-43a7-bb51-6c9411055e2f',
      '10.34943/42a043e3-f2aa-4dd5-9438-3d6b14eae0dc',
      '10.34943/10483644-44a9-486c-b9d8-a76fd466277e',
      '10.34943/41e992e6-5386-4abf-bef2-6ba88e4fd5fb',
      '10.34943/ba11bb9b-22ed-4cd7-9aad-23f41621856b',
      '10.34943/60aba3d2-7ae8-43b8-a1fa-46096e52b59b',
      '10.34943/eb0924b9-ff2d-4864-a256-c9b3e424ac8f',
      '10.34943/458fe0be-3f86-41ff-a795-09de29e96ccf',
      '10.34943/029493d0-c5bd-4cfe-8e54-cfe216ad6046',
    ],
  },
  dfo: {
    name: { en: 'Fisheries and Oceans Canada, Canadian Hydrographic Service', fr: 'Pêches et Océans Canada, Service hydrographique du Canada' },
    short: { en: 'DFO', fr: 'MPO' },
    credit: {
      en: 'Tide and current predictions: Canadian Hydrographic Service, Fisheries and Oceans Canada',
      fr: 'Prédictions des marées et des courants : Service hydrographique du Canada, Pêches et Océans Canada',
    },
    licence: { en: 'CHS licence agreement', fr: 'Accord de licence du SHC' },
    licenceUrl: 'https://tides.gc.ca/en/licence-agreement',
    url: 'https://api-iwls.dfo-mpo.gc.ca',
    // Clause 10 of the licence, word for word (the user is the SEAsk team).
    notice: {
      en: 'This product is not to be used for navigation. This product was made by or for the User [the SEAsk team] and contains intellectual property (Data) of the Canadian Hydrographic Service of the Department of Fisheries and Oceans. The copyrights in the Data are and remain the property of His Majesty the King in Right of Canada and shall not be sold, licensed, leased, assigned or given to a third party. The incorporation of the Data in this product does not constitute an endorsement or an approval of this product by the Canadian Hydrographic Service, the Department of Fisheries and Oceans or His Majesty the King in Right of Canada',
      fr: 'Ce produit ne doit pas être utilisé pour la navigation. Ce produit a été conçu par ou pour l’Utilisateur [l’équipe SEAsk] à partir de données dont la propriété intellectuelle appartient au Service hydrographique du Canada (ministère des Pêches et des Océans). Les droits d’auteur sur les données sont et demeurent la propriété de Sa Majesté le Roi du chef du Canada et ne doivent pas être vendus, concédés sous licence, loués, cédés ou donnés à un tiers. L’incorporation de ces données dans ce produit ne constitue aucunement une approbation du produit par le Service hydrographique du Canada, le ministère des Pêches et des Océans ou Sa Majesté le Roi du chef du Canada.',
    },
  },
  eccc: {
    name: { en: 'Environment and Climate Change Canada', fr: 'Environnement et Changement climatique Canada' },
    short: { en: 'ECCC', fr: 'ECCC' },
    credit: { en: 'Data Source: Environment and Climate Change Canada', fr: 'Source des données : Environnement et Changement climatique Canada' },
    licence: { en: 'ECCC Data Services End-use Licence', fr: 'Licence d’utilisation finale pour les services de données d’ECCC' },
    licenceUrl: 'https://eccc-msc.github.io/open-data/licence/readme_en/',
    url: 'https://api.weather.gc.ca',
  },
  openMeteo: {
    name: { en: 'Open-Meteo', fr: 'Open-Meteo' },
    short: { en: 'Open-Meteo', fr: 'Open-Meteo' },
    credit: { en: 'Weather data by Open-Meteo.com (CC BY 4.0)', fr: 'Données météo par Open-Meteo.com (CC BY 4.0)' },
    licence: { en: 'CC BY 4.0 (free API: non-commercial)', fr: 'CC BY 4.0 (API gratuite : non commercial)' },
    licenceUrl: 'https://open-meteo.com/en/licence',
    url: 'https://open-meteo.com',
  },
  copernicusMarine: {
    name: { en: 'Copernicus Marine Service', fr: 'Service Copernicus Marine' },
    short: { en: 'Copernicus Marine', fr: 'Copernicus Marine' },
    credit: {
      en: 'Waves and global currents (via Open-Meteo Marine): generated using E.U. Copernicus Marine Service Information',
      fr: 'Vagues et courants mondiaux (via Open-Meteo Marine) : générés à partir d’informations du service Copernicus Marine de l’UE',
    },
    licence: { en: 'Copernicus Marine Service licence', fr: 'Licence du service Copernicus Marine' },
    licenceUrl: 'https://marine.copernicus.eu/user-corner/service-commitments-and-licence',
    url: 'https://marine.copernicus.eu',
    // MeteoFrance MFWAM waves and SMOC currents (Mercator Ocean International)
    doi: ['10.48670/moi-00017', '10.48670/moi-00016'],
  },
  salishSeaCast: {
    name: { en: 'SalishSeaCast, University of British Columbia', fr: 'SalishSeaCast, Université de la Colombie-Britannique' },
    short: { en: 'SalishSeaCast', fr: 'SalishSeaCast' },
    credit: {
      en: 'Current model: SalishSeaCast Project Contributors and the University of British Columbia (Apache 2.0), with MEOPAR, Ocean Networks Canada and the Digital Research Alliance of Canada',
      fr: 'Modèle de courants : contributeurs du projet SalishSeaCast et Université de la Colombie-Britannique (Apache 2.0), avec MEOPAR, Ocean Networks Canada et l’Alliance de recherche numérique du Canada',
    },
    licence: { en: 'Apache License 2.0', fr: 'Licence Apache 2.0' },
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    url: 'https://salishsea.eos.ubc.ca/erddap',
    // Soontiens et al. 2016; Soontiens and Allen 2017 (the papers the project asks users to cite)
    doi: ['10.1080/07055900.2015.1108899', '10.1016/j.ocemod.2017.02.008'],
  },
  owm: {
    name: { en: 'OpenWeather', fr: 'OpenWeather' },
    short: { en: 'OpenWeather', fr: 'OpenWeather' },
    credit: { en: 'Weather data © OpenWeather (ODbL)', fr: 'Données météo © OpenWeather (ODbL)' },
    licence: { en: 'ODbL', fr: 'ODbL' },
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/',
    url: 'https://openweathermap.org',
  },
  gebco: {
    name: { en: 'GEBCO Bathymetric Compilation Group', fr: 'GEBCO Bathymetric Compilation Group' },
    short: { en: 'GEBCO 2026', fr: 'GEBCO 2026' },
    credit: {
      en: 'Seafloor depth: GEBCO Bathymetric Compilation Group 2026 (2026), The GEBCO_2026 Grid',
      fr: 'Profondeur du fond : GEBCO Bathymetric Compilation Group 2026 (2026), The GEBCO_2026 Grid',
    },
    licence: { en: 'public domain', fr: 'domaine public' },
    licenceUrl: 'https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use',
    url: 'https://www.gebco.net',
    doi: ['10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa'],
  },
  eox: {
    name: { en: 'EOX IT Services GmbH', fr: 'EOX IT Services GmbH' },
    short: { en: 'EOX · Copernicus Sentinel-2', fr: 'EOX · Copernicus Sentinel-2' },
    credit: {
      en: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
      fr: 'EOxCloudless https://cloudless.eox.at par EOX IT Services GmbH (contient des données Copernicus Sentinel 2025 modifiées)',
    },
    licence: { en: 'CC BY-NC-SA 4.0 (non-commercial)', fr: 'CC BY-NC-SA 4.0 (non commercial)' },
    licenceUrl: 'https://cloudless.eox.at/documentation/license',
    url: 'https://cloudless.eox.at',
  },
  nrcan: {
    name: { en: 'Natural Resources Canada', fr: 'Ressources naturelles Canada' },
    short: { en: 'NRCan', fr: 'RNCan' },
    credit: {
      en: '© His Majesty the King in Right of Canada, as represented by the Minister of Natural Resources Canada (Open Government Licence – Canada)',
      fr: '© Sa Majesté le Roi du chef du Canada, représenté par le ministre de Ressources naturelles Canada (Licence du gouvernement ouvert – Canada)',
    },
    licence: OGL,
    licenceUrl: OGL_URL,
    url: 'https://natural-resources.canada.ca',
  },
  mrdem: {
    name: { en: 'Natural Resources Canada (MRDEM-30 elevation)', fr: 'Ressources naturelles Canada (relief MNEMR-30)' },
    short: { en: 'NRCan terrain', fr: 'Relief RNCan' },
    credit: {
      en: 'Terrain: NRCan MRDEM-30 (Open Government Licence – Canada)',
      fr: 'Relief : RNCan MNEMR-30 (Licence du gouvernement ouvert – Canada)',
    },
    licence: OGL,
    licenceUrl: OGL_URL,
    url: 'https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da',
  },
  photos: {
    name: { en: 'iNaturalist and Wikimedia Commons photographers', fr: 'Photographes d’iNaturalist et de Wikimedia Commons' },
    short: { en: 'Photos', fr: 'Photos' },
    credit: {
      en: 'Photos: their authors on iNaturalist and Wikimedia Commons; each photo is credited where it is shown',
      fr: 'Photos : leurs auteurs sur iNaturalist et Wikimedia Commons; chaque photo est créditée là où elle paraît',
    },
    licence: { en: 'CC0, CC BY or CC BY-SA (per photo)', fr: 'CC0, CC BY ou CC BY-SA (selon la photo)' },
    url: 'https://www.inaturalist.org',
  },
} satisfies Record<string, Source>

export type SourceId = keyof typeof SOURCES

/** What the passenger kiosk shows, for its "About the data" list (the bridge has its own list). */
export const KIOSK_SOURCES: SourceId[] = ['onc', 'dfo', 'owm', 'openMeteo', 'copernicusMarine', 'gebco', 'eox', 'nrcan', 'mrdem', 'photos']

/** What the captain's bridge shows. OpenWeather only fills in the live wind when the model is missing. */
export const BRIDGE_SOURCES: SourceId[] = ['onc', 'dfo', 'eccc', 'openMeteo', 'copernicusMarine', 'salishSeaCast', 'owm', 'eox', 'nrcan']

export const credit = (id: SourceId, lang: Lang = 'en') => SOURCES[id].credit[lang]
export const short = (id: SourceId, lang: Lang = 'en') => SOURCES[id].short[lang]
