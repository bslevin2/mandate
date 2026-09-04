import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AuditRow } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const AUDIT_PATH = join(DATA_DIR, 'audit.json')

/** Genesis prevHash for the first row in a chain. */
export const GENESIS_HASH = '0'.repeat(64)

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(AUDIT_PATH)) writeFileSync(AUDIT_PATH, '[]', 'utf8')
}

function save(rows: AuditRow[]) {
  writeFileSync(AUDIT_PATH, JSON.stringify(rows.slice(0, 500), null, 2), 'utf8')
}

export function loadAudit(): AuditRow[] {
  ensure()
  try {
    const raw = JSON.parse(readFileSync(AUDIT_PATH, 'utf8')) as AuditRow[]
    if (!Array.isArray(raw) || raw.length === 0) return []
    // Migrate pre-integrity rows by re-sealing the chain once.
    if (raw.some((r) => !r.rowHash || !r.tenant)) {
      const oldestFirst = [...raw]
        .map((r) => ({
          ...r,
          tenant: r.tenant || 'acme',
        }))
        .reverse()
      let prevHash = GENESIS_HASH
      const sealed: AuditRow[] = []
      for (const row of oldestFirst) {
        const { prevHash: _p, rowHash: _r, ...payload } = row
        const withTenant = {
          ...payload,
          tenant: payload.tenant || 'acme',
        }
        const rowHash = computeRowHash(withTenant, prevHash)
        sealed.push({ ...withTenant, prevHash, rowHash })
        prevHash = rowHash
      }
      const newestFirst = sealed.reverse()
      save(newestFirst)
      return newestFirst
    }
    return raw
  } catch {
    return []
  }
}

/** Canonical payload for hashing — excludes integrity fields. */
function canonicalPayload(row: Omit<AuditRow, 'prevHash' | 'rowHash'>): string {
  return JSON.stringify({
    id: row.id,
    ts: row.ts,
    tenant: row.tenant,
    audienceId: row.audienceId,
    auth: row.auth,
    decision: row.decision,
    evidence: row.evidence,
    phase: row.phase,
  })
}

export function computeRowHash(
  row: Omit<AuditRow, 'prevHash' | 'rowHash'>,
  prevHash: string,
): string {
  return createHash('sha256')
    .update(canonicalPayload(row) + prevHash)
    .digest('hex')
}

export function listAudit(opts?: { tenant?: string }): AuditRow[] {
  const rows = loadAudit()
  if (!opts?.tenant) return rows
  return rows.filter((r) => r.tenant === opts.tenant)
}

export function appendAudit(
  row: Omit<AuditRow, 'prevHash' | 'rowHash'>,
): AuditRow {
  const rows = loadAudit()
  const tip = rows[0]
  const prevHash = tip?.rowHash ?? GENESIS_HASH
  const sealed: AuditRow = {
    ...row,
    prevHash,
    rowHash: computeRowHash(row, prevHash),
  }
  rows.unshift(sealed)
  save(rows)
  return sealed
}

export function findByRequestId(
  requestId: string,
  tenant?: string,
): AuditRow | undefined {
  return loadAudit().find((r) => {
    if (r.evidence.requestId !== requestId) return false
    if (tenant && r.tenant !== tenant) return false
    return true
  })
}

/** Lookup without tenant filter — used to detect cross-tenant access. */
export function findByRequestIdAny(
  requestId: string,
): AuditRow | undefined {
  return loadAudit().find((r) => r.evidence.requestId === requestId)
}

export function findByAuthId(
  authId: string,
  tenant?: string,
): AuditRow | undefined {
  return loadAudit().find((r) => {
    if (r.auth.authId !== authId) return false
    if (tenant && r.tenant !== tenant) return false
    return true
  })
}

export function findByAuthIdAny(authId: string): AuditRow | undefined {
  return loadAudit().find((r) => r.auth.authId === authId)
}

export function sessionSpendUsd(tenant?: string): number {
  return listAudit(tenant ? { tenant } : undefined).reduce(
    (sum, r) => sum + (r.evidence.costUsd ?? 0),
    0,
  )
}

export interface IntegrityReport {
  valid: boolean
  length: number
  brokenAt: string | null
  tipHash: string | null
}

/**
 * Verify newest→oldest: each row's prevHash must equal the next (older) row's
 * rowHash, and rowHash must match a recomputation over the payload.
 */
export function verifyChain(tenant?: string): IntegrityReport {
  const rows = listAudit(tenant ? { tenant } : undefined)
  if (rows.length === 0) {
    return { valid: true, length: 0, brokenAt: null, tipHash: null }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const expectedPrev =
      i === rows.length - 1 ? GENESIS_HASH : rows[i + 1]!.rowHash
    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        length: rows.length,
        brokenAt: row.id,
        tipHash: rows[0]?.rowHash ?? null,
      }
    }
    const { prevHash: _p, rowHash: _r, ...payload } = row
    const expectedHash = computeRowHash(payload, row.prevHash)
    if (row.rowHash !== expectedHash) {
      return {
        valid: false,
        length: rows.length,
        brokenAt: row.id,
        tipHash: rows[0]?.rowHash ?? null,
      }
    }
  }

  return {
    valid: true,
    length: rows.length,
    brokenAt: null,
    tipHash: rows[0]?.rowHash ?? null,
  }
}

/** Local-only demo: mutate the tip row so verifyChain fails. */
export function breakIntegrity(): IntegrityReport {
  const rows = loadAudit()
  if (rows.length === 0) {
    return { valid: true, length: 0, brokenAt: null, tipHash: null }
  }
  const tip = rows[0]!
  tip.evidence = {
    ...tip.evidence,
    reason: `${tip.evidence.reason} [TAMPERED]`,
  }
  // Leave rowHash stale so the chain fails verification.
  save(rows)
  return verifyChain()
}

/** Re-seal every row from oldest→newest so the chain is valid again. */
export function restoreIntegrity(): IntegrityReport {
  const rows = loadAudit()
  // Process oldest first (end of array), rebuild hashes, then reverse back to newest-first.
  const oldestFirst = [...rows].reverse()
  let prevHash = GENESIS_HASH
  const sealedOldestFirst: AuditRow[] = []
  for (const row of oldestFirst) {
    const { prevHash: _p, rowHash: _r, ...payload } = row
    const rowHash = computeRowHash(payload, prevHash)
    sealedOldestFirst.push({ ...payload, prevHash, rowHash })
    prevHash = rowHash
  }
  save(sealedOldestFirst.reverse())
  return verifyChain()
}
