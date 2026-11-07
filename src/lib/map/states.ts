/**
 * Each US state's name and bounding box, from public/geo/us-states.json
 * (checked by __tests__/lib/map-url-state.test.ts). Server code uses it to open
 * the map on a state without loading the outlines.
 */
import type { LngLatBounds } from "./geo"

export const STATES: Record<string, { name: string; bounds: LngLatBounds }> = {
  AK: { name: "Alaska", bounds: [[-187.54,51.229],[-129.981,71.353]] },
  AL: { name: "Alabama", bounds: [[-88.475,30.223],[-84.892,35.008]] },
  AR: { name: "Arkansas", bounds: [[-94.619,33.004],[-89.655,36.5]] },
  AS: { name: "American Samoa", bounds: [[-170.845,-14.374],[-169.424,-14.157]] },
  AZ: { name: "Arizona", bounds: [[-114.813,31.332],[-109.045,37.004]] },
  CA: { name: "California", bounds: [[-124.411,32.534],[-114.134,42.01]] },
  CO: { name: "Colorado", bounds: [[-109.059,36.993],[-102.042,41.002]] },
  CT: { name: "Connecticut", bounds: [[-73.726,40.985],[-71.788,42.051]] },
  DC: { name: "District of Columbia", bounds: [[-77.118,38.792],[-76.91,38.994]] },
  DE: { name: "Delaware", bounds: [[-75.79,38.451],[-75.051,39.839]] },
  FL: { name: "Florida", bounds: [[-87.635,24.515],[-80.033,31.001]] },
  GA: { name: "Georgia", bounds: [[-85.607,30.359],[-80.844,35.001]] },
  GU: { name: "Guam", bounds: [[144.621,13.246],[144.959,13.652]] },
  HI: { name: "Hawaii", bounds: [[-160.25,18.917],[-154.808,22.232]] },
  IA: { name: "Iowa", bounds: [[-96.633,40.378],[-90.14,43.5]] },
  ID: { name: "Idaho", bounds: [[-117.243,41.988],[-111.044,49.001]] },
  IL: { name: "Illinois", bounds: [[-91.515,36.97],[-87.495,42.509]] },
  IN: { name: "Indiana", bounds: [[-88.098,37.772],[-84.785,41.761]] },
  KS: { name: "Kansas", bounds: [[-102.053,36.993],[-94.591,40.003]] },
  KY: { name: "Kentucky", bounds: [[-89.573,36.497],[-81.967,39.146]] },
  LA: { name: "Louisiana", bounds: [[-94.042,28.93],[-88.816,33.02]] },
  MA: { name: "Massachusetts", bounds: [[-73.507,41.239],[-69.929,42.887]] },
  MD: { name: "Maryland", bounds: [[-79.487,37.917],[-75.051,39.723]] },
  ME: { name: "Maine", bounds: [[-71.084,43.059],[-66.982,47.46]] },
  MI: { name: "Michigan", bounds: [[-90.416,41.696],[-82.416,48.191]] },
  MN: { name: "Minnesota", bounds: [[-97.24,43.499],[-89.49,49.385]] },
  MO: { name: "Missouri", bounds: [[-95.768,35.995],[-89.099,40.614]] },
  MP: { name: "Commonwealth of the Northern Mariana Islands", bounds: [[145.12,14.111],[146.082,18.812]] },
  MS: { name: "Mississippi", bounds: [[-91.644,30.18],[-88.098,34.995]] },
  MT: { name: "Montana", bounds: [[-116.051,44.358],[-104.041,49.002]] },
  NC: { name: "North Carolina", bounds: [[-84.322,33.851],[-75.46,36.588]] },
  ND: { name: "North Dakota", bounds: [[-104.049,45.935],[-96.558,49.001]] },
  NE: { name: "Nebraska", bounds: [[-104.052,40],[-95.309,43.001]] },
  NH: { name: "New Hampshire", bounds: [[-72.556,42.697],[-70.704,45.306]] },
  NJ: { name: "New Jersey", bounds: [[-75.56,38.928],[-73.895,41.358]] },
  NM: { name: "New Mexico", bounds: [[-109.048,31.332],[-103,37]] },
  NV: { name: "Nevada", bounds: [[-120.007,35.001],[-114.041,42.002]] },
  NY: { name: "New York", bounds: [[-79.763,40.502],[-71.856,45.016]] },
  OH: { name: "Ohio", bounds: [[-84.821,38.405],[-80.521,41.978]] },
  OK: { name: "Oklahoma", bounds: [[-103.004,33.617],[-94.433,37.002]] },
  OR: { name: "Oregon", bounds: [[-124.554,41.992],[-116.464,46.268]] },
  PA: { name: "Pennsylvania", bounds: [[-80.521,39.72],[-74.695,42.27]] },
  PR: { name: "Puerto Rico", bounds: [[-67.94,17.912],[-65.223,18.516]] },
  RI: { name: "Rhode Island", bounds: [[-71.86,41.151],[-71.12,42.019]] },
  SC: { name: "South Carolina", bounds: [[-83.349,32.034],[-78.539,35.215]] },
  SD: { name: "South Dakota", bounds: [[-104.059,42.485],[-96.436,45.945]] },
  TN: { name: "Tennessee", bounds: [[-90.309,34.983],[-81.648,36.678]] },
  TX: { name: "Texas", bounds: [[-106.647,25.84],[-93.518,36.501]] },
  UT: { name: "Utah", bounds: [[-114.052,36.998],[-109.041,42.002]] },
  VA: { name: "Virginia", bounds: [[-83.676,36.541],[-75.241,39.466]] },
  VI: { name: "United States Virgin Islands", bounds: [[-65.083,17.679],[-64.577,18.385]] },
  VT: { name: "Vermont", bounds: [[-73.439,42.727],[-71.494,45.016]] },
  WA: { name: "Washington", bounds: [[-124.734,45.544],[-116.916,49.002]] },
  WI: { name: "Wisconsin", bounds: [[-92.889,42.492],[-86.824,47.077]] },
  WV: { name: "West Virginia", bounds: [[-82.638,37.202],[-77.721,40.639]] },
  WY: { name: "Wyoming", bounds: [[-111.058,40.995],[-104.052,45.006]] },
}

/** Two-letter state codes, e.g. "WA". */
/** States and territories outside the conterminous US: the landing map frames the lower 48 and DC. */
export const OUTSIDE_LOWER_48 = ["AK", "HI", "PR", "GU", "VI", "AS", "MP"] as const

export const isStateCode = (code: string): boolean => Object.hasOwn(STATES, code)

const CODE_BY_NAME = new Map(Object.entries(STATES).map(([code, { name }]) => [name.toLowerCase(), code]))

/**
 * A state's two-letter code from its name ("Washington" → "WA") or its code
 * in any case or ISO form ("wa", "US-WA"); undefined when it isn't a state.
 */
export function stateCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  const code = v.toUpperCase().replace(/^US-/, "")
  if (isStateCode(code)) return code
  return CODE_BY_NAME.get(v.toLowerCase())
}
