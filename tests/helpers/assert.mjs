/**
 * Minimal test assertion and result-tracking helpers.
 */

const results = []
let currentSuite = 'default'

export function suite(name) {
  currentSuite = name
}

export function pass(name) {
  results.push({ suite: currentSuite, name, status: 'PASS' })
  process.stdout.write(`  ✓ ${name}\n`)
}

export function fail(name, reason) {
  results.push({ suite: currentSuite, name, status: 'FAIL', reason })
  process.stdout.write(`  ✗ ${name}\n    → ${reason}\n`)
}

export function skip(name, reason) {
  results.push({ suite: currentSuite, name, status: 'SKIP', reason })
  process.stdout.write(`  ⊘ ${name}\n    → SKIPPED: ${reason}\n`)
}

export function info(msg) {
  process.stdout.write(`  · ${msg}\n`)
}

export function getResults() {
  return results
}

export function printSummary() {
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'SKIP').length
  const total = results.length

  process.stdout.write(`\n${'─'.repeat(60)}\n`)
  process.stdout.write(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped / ${total} total\n`)

  if (failed > 0) {
    process.stdout.write(`\nFAILURES:\n`)
    for (const r of results.filter(r => r.status === 'FAIL')) {
      process.stdout.write(`  [${r.suite}] ${r.name}\n`)
      process.stdout.write(`    ${r.reason}\n`)
    }
  }

  return { passed, failed, skipped, total }
}

/**
 * Wrap a test to catch unexpected errors.
 * If fn throws, records a FAIL with the error message.
 */
export async function test(name, fn) {
  try {
    await fn()
  } catch (err) {
    fail(name, `Unexpected error: ${err?.message || String(err)}`)
  }
}

/**
 * Simple assertion — throws if condition is false.
 * Use inside test() blocks.
 */
export function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

export function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}
