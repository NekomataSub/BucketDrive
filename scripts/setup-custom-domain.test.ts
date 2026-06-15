import assert from "node:assert/strict"
import { test } from "node:test"
import {
  ensureDnsRecord,
  ensurePagesDomain,
  findBestZoneForDomain,
  getPagesCnameTarget,
  type CloudflareClient,
  type CloudflareDnsRecord,
  type CloudflareZone,
  type CnameRecordInput,
  type PagesDomain,
} from "./setup-custom-domain"

class FakeCloudflareClient implements CloudflareClient {
  zones: CloudflareZone[] = []
  dnsRecords: CloudflareDnsRecord[] = []
  pagesDomains: PagesDomain[] = []
  createdDnsRecords: CnameRecordInput[] = []
  updatedDnsRecords: Array<{ id: string; record: CnameRecordInput }> = []
  addedPagesDomains: string[] = []

  listZones(): Promise<CloudflareZone[]> {
    return Promise.resolve(this.zones)
  }

  listDnsRecords(): Promise<CloudflareDnsRecord[]> {
    return Promise.resolve(this.dnsRecords)
  }

  createDnsRecord(_zoneId: string, record: CnameRecordInput): Promise<CloudflareDnsRecord> {
    this.createdDnsRecords.push(record)
    const created = { id: "created", name: record.name, type: record.type, content: record.content }
    this.dnsRecords.push(created)
    return Promise.resolve(created)
  }

  updateDnsRecord(
    _zoneId: string,
    recordId: string,
    record: CnameRecordInput,
  ): Promise<CloudflareDnsRecord> {
    this.updatedDnsRecords.push({ id: recordId, record })
    const updated = { id: recordId, name: record.name, type: record.type, content: record.content }
    this.dnsRecords = [updated]
    return Promise.resolve(updated)
  }

  listPagesDomains(): Promise<PagesDomain[]> {
    return Promise.resolve(this.pagesDomains)
  }

  addPagesDomain(
    _accountId: string,
    _pagesProjectName: string,
    domain: string,
  ): Promise<PagesDomain> {
    this.addedPagesDomains.push(domain)
    const added = { name: domain, status: "pending" }
    this.pagesDomains.push(added)
    return Promise.resolve(added)
  }
}

void test("findBestZoneForDomain returns the longest matching zone suffix", () => {
  const zone = findBestZoneForDomain("app.example.com", [
    { id: "root", name: "example.com" },
    { id: "sub", name: "app.example.com" },
  ])

  assert.equal(zone.id, "sub")
})

void test("ensureDnsRecord creates a Pages CNAME when missing", async () => {
  const client = new FakeCloudflareClient()
  const result = await ensureDnsRecord(client, "zone", "Drive.Example.Com", "bucketdrive")

  assert.equal(result, "created")
  assert.deepEqual(client.createdDnsRecords, [
    {
      type: "CNAME",
      name: "drive.example.com",
      content: getPagesCnameTarget("bucketdrive"),
      proxied: true,
      ttl: 1,
    },
  ])
})

void test("ensureDnsRecord leaves an existing proxied Pages CNAME unchanged", async () => {
  const client = new FakeCloudflareClient()
  client.dnsRecords = [
    {
      id: "record",
      name: "drive.example.com",
      type: "CNAME",
      content: "bucketdrive.pages.dev",
      proxied: true,
    },
  ]

  const result = await ensureDnsRecord(client, "zone", "drive.example.com", "bucketdrive")

  assert.equal(result, "unchanged")
  assert.equal(client.updatedDnsRecords.length, 0)
})

void test("ensureDnsRecord updates a wrong CNAME target", async () => {
  const client = new FakeCloudflareClient()
  client.dnsRecords = [
    {
      id: "record",
      name: "drive.example.com",
      type: "CNAME",
      content: "old.pages.dev",
      proxied: false,
    },
  ]

  const result = await ensureDnsRecord(client, "zone", "drive.example.com", "bucketdrive")
  const update = client.updatedDnsRecords.at(0)

  assert.equal(result, "updated")
  assert.ok(update)
  assert.equal(update.id, "record")
  assert.equal(update.record.content, "bucketdrive.pages.dev")
  assert.equal(update.record.proxied, true)
})

void test("ensureDnsRecord fails on non-CNAME conflicts", async () => {
  const client = new FakeCloudflareClient()
  client.dnsRecords = [{ id: "record", name: "drive.example.com", type: "A", content: "192.0.2.1" }]

  await assert.rejects(
    ensureDnsRecord(client, "zone", "drive.example.com", "bucketdrive"),
    /DNS record conflict/,
  )
})

void test("ensurePagesDomain adds missing Pages domain and returns refreshed status", async () => {
  const client = new FakeCloudflareClient()

  const status = await ensurePagesDomain(client, "account", "bucketdrive", "Drive.Example.Com")

  assert.deepEqual(client.addedPagesDomains, ["drive.example.com"])
  assert.equal(status.name, "drive.example.com")
  assert.equal(status.status, "pending")
})
