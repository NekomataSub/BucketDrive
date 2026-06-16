import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./routes"
import { BrandingEffects } from "./lib/branding"
import { I18nProvider } from "./lib/i18n"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrandingEffects />
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  )
}
