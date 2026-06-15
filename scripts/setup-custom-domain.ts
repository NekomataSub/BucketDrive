/* eslint-disable no-console */
import { pathToFileURL } from "url"

const CF_API_BASE = "https://api.cloudflare.com/client/v4"

export interface SetupOptions {
  accountId: string
  apiToken: string
  domain: string
  pagesProjectName: string
}

interface CfError {
  code?: number
  message: string
}

interface CfResponse<T> {
  success: boolean
  result?: T
  errors?: CfError[]
  messages?: CfError[]
}

export interface CloudflareZone {
  id: string
  name: string
}

export interface CloudflareDnsRecord {
  id: string
  name: string
  type: string
  content: string
  proxied?: boolean
  ttl?: number
}

export interface PagesDomain {
  name: string
  status?: string
  validation_data?: {
    method?: string
    status?: string
    error_message?: string
    txt_name?: string
    txt_value?: string
  }
  verification_data?: {
    status?: string
    error_message?: string
  }
}

export interface DomainStatus {
  name: string
  status: string
  validationStatus?: string
  validationError?: string
  verificationStatus?: string
  verificationError?: string
}

export interface CloudflareClient {
  listZones(accountId: string): Promise<CloudflareZone[]>
  listDnsRecords(zoneId: string, name: string): Promise<CloudflareDnsRecord[]>
  createDnsRecord(zoneId: string, record: CnameRecordInput): Promise<CloudflareDnsRecord>
  updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: CnameRecordInput,
  ): Promise<CloudflareDnsRecord>
  listPagesDomains(accountId: string, pagesProjectName: string): Promise<PagesDomain[]>
  addPagesDomain(accountId: string, pagesProjectName: string, domain: string): Promise<PagesDomain>
}

export interface CnameRecordInput {
  type: "CNAME"
  name: string
  content: string
  proxied: boolean
  ttl: 1
}

class CloudflareApiClient implements CloudflareClient {
  constructor(private readonly apiToken: string) {}

  async listZones(accountId: string): Promise<CloudflareZone[]> {
    const response = await this.request<CloudflareZone[]>(
      `/zones?account.id=${encodeURIComponent(accountId)}&per_page=500`,
    )
    return response.result ?? []
  }

  async listDnsRecords(zoneId: string, name: string): Promise<CloudflareDnsRecord[]> {
    const response = await this.request<CloudflareDnsRecord[]>(
      `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
    )
    return response.result ?? []
  }

  async createDnsRecord(zoneId: string, record: CnameRecordInput): Promise<CloudflareDnsRecord> {
    const response = await this.request<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records`,
      "POST",
      record,
    )
    if (!response.result) throw new Error("Cloudflare did not return the created DNS record")
    return response.result
  }

  async updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: CnameRecordInput,
  ): Promise<CloudflareDnsRecord> {
    const response = await this.request<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records/${recordId}`,
      "PUT",
      record,
    )
    if (!response.result) throw new Error("Cloudflare did not return the updated DNS record")
    return response.result
  }

  async listPagesDomains(accountId: string, pagesProjectName: string): Promise<PagesDomain[]> {
    const response = await this.request<PagesDomain[]>(
      `/accounts/${accountId}/pages/projects/${pagesProjectName}/domains`,
    )
    return response.result ?? []
  }

  async addPagesDomain(
    accountId: string,
    pagesProjectName: string,
    domain: string,
  ): Promise<PagesDomain> {
    const response = await this.request<PagesDomain>(
      `/accounts/${accountId}/pages/projects/${pagesProjectName}/domains`,
      "POST",
      { name: domain },
    )
    if (!response.result) throw new Error("Cloudflare did not return the added Pages domain")
    return response.result
  }

  private async request<T>(
    path: string,
    method: string = "GET",
    body?: object,
  ): Promise<CfResponse<T>> {
    const res = await fetch(`${CF_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = (await res.json()) as CfResponse<T>
    if (!res.ok || !data.success) {
      const errors = formatCfMessages(data.errors)
      throw new Error(
        `Cloudflare API ${method} ${path} failed with HTTP ${String(res.status)}${
          errors ? `: ${errors}` : ""
        }`,
      )
    }

    return data
  }
}

export function findBestZoneForDomain(domain: string, zones: CloudflareZone[]): CloudflareZone {
  const normalizedDomain = normalizeDomain(domain)
  const matches = zones
    .filter(
      (zone) =>
        normalizedDomain === normalizeDomain(zone.name) ||
        normalizedDomain.endsWith(`.${normalizeDomain(zone.name)}`),
    )
    .sort((a, b) => b.name.length - a.name.length)

  const zone = matches[0]
  if (!zone) {
    throw new Error(
      `No Cloudflare zone found for ${domain}. Ensure the domain DNS zone is in this account and the token has Zone Read permission.`,
    )
  }

  return zone
}

export function getPagesCnameTarget(pagesProjectName: string): string {
  return `${pagesProjectName}.pages.dev`
}

export function buildCnameRecord(domain: string, pagesProjectName: string): CnameRecordInput {
  return {
    type: "CNAME",
    name: normalizeDomain(domain),
    content: getPagesCnameTarget(pagesProjectName),
    proxied: true,
    ttl: 1,
  }
}

export function summarizeDomainStatus(domain: PagesDomain): DomainStatus {
  return {
    name: domain.name,
    status: domain.status ?? "unknown",
    validationStatus: domain.validation_data?.status,
    validationError: domain.validation_data?.error_message,
    verificationStatus: domain.verification_data?.status,
    verificationError: domain.verification_data?.error_message,
  }
}

export async function ensureDnsRecord(
  client: CloudflareClient,
  zoneId: string,
  domain: string,
  pagesProjectName: string,
): Promise<"created" | "updated" | "unchanged"> {
  const desired = buildCnameRecord(domain, pagesProjectName)
  const records = await client.listDnsRecords(zoneId, desired.name)
  const conflicting = records.filter((record) => record.type !== "CNAME")

  if (conflicting.length > 0) {
    throw new Error(
      `DNS record conflict for ${desired.name}: found ${conflicting
        .map((record) => record.type)
        .join(", ")} record(s). Remove or change them before provisioning the Pages CNAME.`,
    )
  }

  const cname = records.find((record) => record.type === "CNAME")
  if (!cname) {
    await client.createDnsRecord(zoneId, desired)
    return "created"
  }

  if (normalizeDomain(cname.content) === normalizeDomain(desired.content) && cname.proxied) {
    return "unchanged"
  }

  await client.updateDnsRecord(zoneId, cname.id, desired)
  return "updated"
}

export async function ensurePagesDomain(
  client: CloudflareClient,
  accountId: string,
  pagesProjectName: string,
  domain: string,
): Promise<DomainStatus> {
  const normalizedDomain = normalizeDomain(domain)
  const domains = await client.listPagesDomains(accountId, pagesProjectName)
  const existing = domains.find((item) => normalizeDomain(item.name) === normalizedDomain)

  if (!existing) {
    await client.addPagesDomain(accountId, pagesProjectName, normalizedDomain)
  }

  const refreshedDomains = await client.listPagesDomains(accountId, pagesProjectName)
  const refreshed = refreshedDomains.find((item) => normalizeDomain(item.name) === normalizedDomain)
  if (!refreshed) {
    throw new Error(`Pages domain ${normalizedDomain} was not found after provisioning`)
  }

  return summarizeDomainStatus(refreshed)
}

export async function setupCustomDomain(
  options: SetupOptions,
  client: CloudflareClient = new CloudflareApiClient(options.apiToken),
): Promise<DomainStatus> {
  const domain = normalizeDomain(options.domain)
  const target = getPagesCnameTarget(options.pagesProjectName)

  console.log(`\n🌐 Setting up custom domain for Pages...`)
  console.log(`   Domain: ${domain}`)
  console.log(`   Project: ${options.pagesProjectName}`)
  console.log(`   DNS target: ${target}`)

  console.log(`\n🔍 Finding Cloudflare zone for "${domain}"...`)
  const zones = await client.listZones(options.accountId)
  const zone = findBestZoneForDomain(domain, zones)
  console.log(`✅ Found zone "${zone.name}" (${zone.id})`)

  console.log(`\n🔍 Ensuring DNS CNAME ${domain} -> ${target}...`)
  const dnsResult = await ensureDnsRecord(client, zone.id, domain, options.pagesProjectName)
  console.log(`✅ DNS CNAME ${dnsResult}`)

  console.log(`\n🔍 Ensuring Pages custom domain "${domain}"...`)
  const status = await ensurePagesDomain(
    client,
    options.accountId,
    options.pagesProjectName,
    domain,
  )
  logDomainStatus(status)

  return status
}

function logDomainStatus(status: DomainStatus): void {
  console.log(`✅ Pages custom domain "${status.name}" is configured`)
  console.log(`   Domain status: ${status.status}`)
  if (status.validationStatus) console.log(`   Validation: ${status.validationStatus}`)
  if (status.verificationStatus) console.log(`   Verification: ${status.verificationStatus}`)
  if (status.validationError) console.log(`   Validation error: ${status.validationError}`)
  if (status.verificationError) console.log(`   Verification error: ${status.verificationError}`)
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/\.$/, "").toLowerCase()
}

function formatCfMessages(messages?: CfError[]): string {
  return (messages ?? [])
    .map((message) => {
      const code = message.code ? `${String(message.code)} ` : ""
      return `${code}${message.message}`
    })
    .join("; ")
}

function getEnvVar(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`❌ Missing environment variable: ${key}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const options: SetupOptions = {
    accountId: getEnvVar("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: getEnvVar("CLOUDFLARE_API_TOKEN"),
    domain: getEnvVar("CUSTOM_DOMAIN"),
    pagesProjectName: getEnvVar("PAGES_PROJECT_NAME"),
  }

  await setupCustomDomain(options)
  console.log(`\n✅ Custom domain setup complete!`)
  console.log(`   Cloudflare may take a few minutes to issue certificates and mark it active.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Custom domain setup failed")
    process.exit(1)
  })
}
