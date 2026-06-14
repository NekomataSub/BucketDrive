type SearchRouteKey = "dashboard" | "trash" | "shares"

interface SearchContextConfig {
  enabled: boolean
  routeKey: SearchRouteKey | null
  placeholder: string
}

export function getSearchContextFromPath(pathname: string): SearchContextConfig {
  if (pathname === "/dashboard/files") {
    return {
      enabled: true,
      routeKey: "dashboard",
      placeholder: "Search files, tags, and favorites",
    }
  }

  if (pathname === "/dashboard/trash") {
    return {
      enabled: true,
      routeKey: "trash",
      placeholder: "Search trash by name or location",
    }
  }

  if (pathname === "/dashboard/shares") {
    return {
      enabled: true,
      routeKey: "shares",
      placeholder: "Search share links",
    }
  }

  return {
    enabled: false,
    routeKey: null,
    placeholder: "Search is unavailable on this page",
  }
}
