import { drizzle } from "drizzle-orm/d1"
import * as schema from "@bucketdrive/shared/db/schema"

declare const process: { env: { NODE_ENV?: string } }

const serializeParams = (params: unknown[]): unknown[] =>
  params.map((p) => (p instanceof Date ? p.toISOString() : p))

function wrapD1Binding(binding: D1Database): D1Database {
  const originalPrepare = binding.prepare.bind(binding)
  return new Proxy(binding, {
    get(target, prop) {
      if (prop === "prepare") {
        return (query: string) => {
          const stmt = originalPrepare(query)
          const originalBind = stmt.bind.bind(stmt)
          return new Proxy(stmt, {
            get(target2, prop2) {
              if (prop2 === "bind") {
                return (...params: unknown[]) => originalBind(...serializeParams(params))
              }
              const value = target2[prop2 as keyof typeof target2]
              return typeof value === "function" ? value.bind(target2) : value
            },
          })
        }
      }
      const value = target[prop as keyof typeof target]
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

let db: ReturnType<typeof drizzle<typeof schema>> | undefined
let d1Binding: D1Database | undefined

export function createD1DB(binding: D1Database) {
  if (!db) {
    d1Binding = wrapD1Binding(binding)
    db = drizzle(d1Binding, { schema })
  }
  return db
}

export function getDB() {
  if (!db) throw new Error("Database not initialized. Call createD1DB first.")
  return db
}

export function getD1Binding() {
  if (!d1Binding) throw new Error("Database not initialized. Call createD1DB first.")
  return d1Binding
}

export function resetD1DBForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetD1DBForTests can only be used in tests")
  }
  db = undefined
  d1Binding = undefined
}
