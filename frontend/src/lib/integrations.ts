// Pure helpers for the Integrations and Compliance pages (T14). No React, so they are unit-tested directly.
import type { ComplianceItem, ComplianceReport, IntegrationEvent, IntegrationProcess } from './types'

export interface BoomiProcess {
  id: IntegrationProcess
  name: string
  direction: string
  /** When the process runs. */
  trigger: string
  /** What it does, in order. */
  steps: string[]
}

/** Boomi processes as the UI shows them (docs/API_CONTRACTS.md, docs/BOOMI_FLOW.md). */
export const PROCESSES: BoomiProcess[] = [
  {
    id: 'B1',
    name: 'Scheduled scan trigger',
    direction: 'Boomi → PatchPilot',
    trigger: 'Boomi schedule, every day at 09:00 IST (or "Run Process" by hand).',
    steps: [
      'Loads the client list (client, repo URL, branch, auto-fix, owner email).',
      'Splits it: one POST /api/scans per repository.',
      'Logs the returned scan_id; a failing client is logged and the run continues.',
    ],
  },
  {
    id: 'B2',
    name: 'Finding notify',
    direction: 'PatchPilot → Boomi',
    trigger: 'Once per real finding (reachable, or unsure with confidence ≥ 0.5), after the fix step.',
    steps: [
      'Creates (or updates) a Jira ticket with CVE, priority, evidence and PR link.',
      'Posts a Slack alert to #security-alerts.',
      'Writes the finding to the compliance log (Supabase). Safe to repeat.',
    ],
  },
  {
    id: 'B3',
    name: 'Scan summary',
    direction: 'PatchPilot → Boomi',
    trigger: 'Once at the end of every scan.',
    steps: [
      'Receives the totals: alerts, real risks, P1/P2, fixed, PRs opened.',
      'Posts one summary message to Slack with a link to the dashboard.',
    ],
  },
  {
    id: 'B4',
    name: 'Compliance report',
    direction: 'PatchPilot → Boomi',
    trigger: 'When someone opens the Compliance page.',
    steps: [
      'Reads the compliance log for the client from a given date.',
      'Returns each CVE with detected / fixed time, Jira key and PR link.',
    ],
  },
]

export type ProcessHealth = 'ok' | 'failed' | 'unknown'

/** Health dot = result of the most recent call for that process (highest event id). */
export function processHealth(events: IntegrationEvent[], process: IntegrationProcess): ProcessHealth {
  let last: IntegrationEvent | null = null
  for (const e of events) {
    if (e.process === process && (last === null || e.id > last.id)) last = e
  }
  if (last === null) return 'unknown'
  return last.ok ? 'ok' : 'failed'
}

/** Ids that arrived since the previous poll. The first load animates nothing (prev is null). */
export function freshEventIds(prev: IntegrationEvent[] | null, next: IntegrationEvent[]): Set<number> {
  if (prev === null) return new Set()
  const seen = new Set(prev.map((e) => e.id))
  return new Set(next.filter((e) => !seen.has(e.id)).map((e) => e.id))
}

const CSV_HEADERS: (keyof ComplianceItem)[] = [
  'compliance_log_id',
  'cve_id',
  'package',
  'priority',
  'detected_at',
  'fixed_at',
  'time_to_fix_minutes',
  'jira_key',
  'pr_url',
  'status',
]

/** RFC 4180 quoting, plus a guard so spreadsheet apps never run a cell as a formula. */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function complianceCsv(report: ComplianceReport): string {
  const rows = report.items.map((item) => CSV_HEADERS.map((h) => csvCell(item[h])).join(','))
  return [CSV_HEADERS.join(','), ...rows].join('\r\n') + '\r\n'
}
