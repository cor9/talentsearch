#!/usr/bin/env node
/**
 * Phase 5 Master Test Runner
 *
 * Runs all test suites in order and produces a final Phase 5 report.
 *
 * Usage:
 *   node tests/run.mjs              # run all suites
 *   node tests/run.mjs --acceptance  # run only acceptance tests
 *   node tests/run.mjs --security    # run only security tests
 *   node tests/run.mjs --perf        # run only performance tests
 *   node tests/run.mjs --normalization # run only normalization unit tests
 *
 * Environment:
 *   TEST_BASE_URL=http://localhost:3000  (default)
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   TALENTSEARCH_SESSION_SECRET=...
 *
 * Start the dev server first if you want HTTP-based tests to run:
 *   cd talentsearch && npm run dev
 */

import { getResults, printSummary, info } from './helpers/assert.mjs'

const args = process.argv.slice(2)
const runAll = args.length === 0
const runAcceptance    = runAll || args.includes('--acceptance')
const runSecurity      = runAll || args.includes('--security')
const runPerf          = runAll || args.includes('--perf') || args.includes('--performance')
const runNormalization = runAll || args.includes('--normalization')

const BANNER = `
╔══════════════════════════════════════════════════════════╗
║        Open Call Phase 5 — Test Runner                  ║
║        Security · Acceptance · Normalization · Perf      ║
╚══════════════════════════════════════════════════════════╝
`

async function main() {
  process.stdout.write(BANNER + '\n')
  process.stdout.write(`Started: ${new Date().toISOString()}\n\n`)

  // ─── Normalization unit tests (no network required) ──────────────────────
  if (runNormalization) {
    process.stdout.write('─── Normalization Unit Tests ───────────────────────────────\n')
    const { run } = await import('./normalization.test.mjs')
    await run()
    process.stdout.write('\n')
  }

  // ─── Security tests ────────────────────────────────────────────────────────
  if (runSecurity) {
    process.stdout.write('─── Security Tests (R2 + R3) ───────────────────────────────\n')
    const { run } = await import('./security.test.mjs')
    await run()
    process.stdout.write('\n')
  }

  // ─── Acceptance tests ──────────────────────────────────────────────────────
  if (runAcceptance) {
    process.stdout.write('─── Acceptance Tests (R1 — Spec v2 Section 10) ─────────────\n')
    const { run } = await import('./acceptance.test.mjs')
    await run()
    process.stdout.write('\n')
  }

  // ─── Performance tests ─────────────────────────────────────────────────────
  if (runPerf) {
    process.stdout.write('─── Performance Tests (R4) ─────────────────────────────────\n')
    const { run } = await import('./performance.test.mjs')
    await run()
    process.stdout.write('\n')
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  process.stdout.write(`\nFinished: ${new Date().toISOString()}\n`)
  const { passed, failed, skipped, total } = printSummary()

  if (failed > 0) {
    process.stdout.write(`\n⚠  ${failed} test(s) FAILED — see details above.\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`\n✓  All ${passed} test(s) passed (${skipped} skipped).\n`)
  }
}

main().catch(err => {
  process.stderr.write(`\nFatal error in test runner:\n${err.stack ?? err}\n`)
  process.exitCode = 1
})
