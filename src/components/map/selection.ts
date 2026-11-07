/**
 * Which location is selected (ring), whether its popup is open, and whose
 * details panel is open, as in the redesign prototype's selectPlace /
 * popup close / openDetails:
 * - selecting a place opens its popup and closes another place's details;
 * - closing the popup (its ✕ or a click off the dots) keeps the selection
 *   while that place's details are open, and clears it otherwise;
 * - View details opens the details and closes the popup;
 * - closing the details keeps the ring.
 */
export interface Selection<T extends { id: string }> {
  selected: T | null
  popup: boolean
  details: T | null
}

export type SelectionAction<T> =
  | { type: "select"; location: T }
  | { type: "closePopup" }
  | { type: "openDetails" }
  | { type: "closeDetails" }
  /** The URL names a location's details (a shared link, or Back/Forward). */
  | { type: "showDetails"; location: T }

export function selectionReducer<T extends { id: string }>(state: Selection<T>, action: SelectionAction<T>): Selection<T> {
  switch (action.type) {
    case "select":
      return {
        selected: action.location,
        popup: true,
        details: state.details && state.details.id !== action.location.id ? null : state.details,
      }
    case "closePopup":
      return state.details && state.details.id === state.selected?.id
        ? { ...state, popup: false }
        : { selected: null, popup: false, details: state.details }
    case "openDetails":
      return state.selected ? { ...state, popup: false, details: state.selected } : state
    case "closeDetails":
      return { ...state, details: null }
    case "showDetails":
      return state.details?.id === action.location.id && state.selected?.id === action.location.id
        ? state
        : { selected: action.location, popup: false, details: action.location }
  }
}

export const NO_SELECTION = { selected: null, popup: false, details: null } as const
