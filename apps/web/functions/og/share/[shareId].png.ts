import { ImageResponse } from "@cloudflare/pages-plugin-vercel-og/api"
import React from "react"
import {
  DEFAULT_BRAND_NAME,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  buildShareMetadata,
  type ShareInfo,
  type ShareMetadata,
} from "../../_lib/share-metadata"

interface ApiServiceBinding {
  fetch(request: Request): Promise<Response>
}

interface PagesFunctionContext {
  request: Request
  env: {
    API_SERVICE: ApiServiceBinding
  }
  params: {
    shareId?: string | string[]
  }
}

type PagesFunctionHandler = (context: PagesFunctionContext) => Promise<Response>

export const onRequest: PagesFunctionHandler = async (context) => {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    })
  }

  const shareId = getParam(context.params.shareId)
  const info = shareId ? await fetchShareInfo(context.env, shareId) : null
  const metadata = buildShareMetadata(info)

  const response: Response = new ImageResponse(
    React.createElement(ShareOgImage, { metadata }),
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    },
  )
  response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400")
  return response
}

function ShareOgImage({ metadata }: { metadata: ShareMetadata }) {
  const resourceName = truncate(metadata.resourceName ?? "Secure shared link", 58)
  const brandName = truncate(metadata.brandName || DEFAULT_BRAND_NAME, 34)
  const badgeText = metadata.isUnavailable
    ? "Unavailable"
    : metadata.hasPassword
      ? "Password required"
      : "Ready to view"

  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0b1120",
        color: "#f8fafc",
        padding: "64px",
        fontFamily: "Inter, Arial, sans-serif",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "18px",
            fontSize: 30,
            fontWeight: 700,
          },
        },
        React.createElement(
          "div",
          {
            style: {
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              background: "#2563eb",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 800,
            },
          },
          brandName.slice(0, 1).toUpperCase(),
        ),
        React.createElement("span", null, brandName),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            borderRadius: 999,
            border: "1px solid #334155",
            background: "#111827",
            color: "#cbd5e1",
            padding: "12px 22px",
            fontSize: 24,
            fontWeight: 600,
          },
        },
        badgeText,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "26px",
          width: "100%",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            color: "#93c5fd",
            fontSize: 28,
            fontWeight: 700,
            textTransform: "uppercase",
          },
        },
        metadata.resourceLabel,
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            color: "#f8fafc",
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: 980,
          },
        },
        resourceName,
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            color: "#cbd5e1",
            fontSize: 32,
            lineHeight: 1.35,
            maxWidth: 900,
          },
        },
        metadata.description,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          color: "#64748b",
          fontSize: 24,
        },
      },
      React.createElement("span", null, "Secure link sharing"),
      React.createElement("span", null, DEFAULT_BRAND_NAME),
    ),
  )
}

async function fetchShareInfo(
  env: { API_SERVICE: ApiServiceBinding },
  shareId: string,
): Promise<ShareInfo | null> {
  const apiUrl = new URL(
    `/api/shares/${encodeURIComponent(shareId)}`,
    "https://api.internal/",
  )

  try {
    const response = await env.API_SERVICE.fetch(
      new Request(apiUrl, {
        headers: { Accept: "application/json" },
      }),
    )
    if (!response.ok) return null
    return (await response.json()) as ShareInfo
  } catch {
    return null
  }
}

function getParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}
