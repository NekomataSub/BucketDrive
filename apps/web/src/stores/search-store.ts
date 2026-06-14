import { create } from "zustand"

export type SearchRouteKey = "dashboard" | "trash" | "shares"
export type SearchTypeFilter = "all" | "documents" | "images" | "videos" | "audio" | "archives"
export type SearchSort = "relevance" | "name" | "created_at" | "size" | "type"
export type SearchOrder = "asc" | "desc"

interface RouteSearchState {
  query: string
}

interface DashboardSearchState extends RouteSearchState {
  type: SearchTypeFilter
  favoriteOnly: boolean
  selectedTagIds: string[]
  sort: SearchSort
  order: SearchOrder
}

export interface SearchStoreState {
  dashboard: DashboardSearchState
  trash: RouteSearchState
  shares: RouteSearchState
  setRouteQuery: (route: SearchRouteKey, query: string) => void
  setDashboardType: (type: SearchTypeFilter) => void
  setDashboardFavoriteOnly: (favoriteOnly: boolean) => void
  setDashboardSelectedTagIds: (tagIds: string[]) => void
  setDashboardSort: (sort: SearchSort) => void
  setDashboardOrder: (order: SearchOrder) => void
  clearDashboardSearch: () => void
}

const emptyRouteState = (): RouteSearchState => ({
  query: "",
})

const emptyDashboardState = (): DashboardSearchState => ({
  query: "",
  type: "all",
  favoriteOnly: false,
  selectedTagIds: [],
  sort: "relevance",
  order: "asc",
})

export const useSearchStore = create<SearchStoreState>((set) => ({
  dashboard: emptyDashboardState(),
  trash: emptyRouteState(),
  shares: emptyRouteState(),
  setRouteQuery: (route, query) => {
    set((state) => ({
      ...state,
      [route]: {
        ...state[route],
        query,
      },
    }))
  },
  setDashboardType: (type) => {
    set((state) => ({
      dashboard: {
        ...state.dashboard,
        type,
      },
    }))
  },
  setDashboardFavoriteOnly: (favoriteOnly) => {
    set((state) => ({
      dashboard: {
        ...state.dashboard,
        favoriteOnly,
      },
    }))
  },
  setDashboardSelectedTagIds: (selectedTagIds) => {
    set((state) => ({
      dashboard: {
        ...state.dashboard,
        selectedTagIds,
      },
    }))
  },
  setDashboardSort: (sort) => {
    set((state) => ({
      dashboard: {
        ...state.dashboard,
        sort,
      },
    }))
  },
  setDashboardOrder: (order) => {
    set((state) => ({
      dashboard: {
        ...state.dashboard,
        order,
      },
    }))
  },
  clearDashboardSearch: () => {
    set({
      dashboard: emptyDashboardState(),
    })
  },
}))
