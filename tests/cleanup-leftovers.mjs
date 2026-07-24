#!/usr/bin/env node
/**
 * Emergency cleanup script — removes any leftover [TEST-P5] test fixtures
 * from the database that were not cleaned up by a previous test run.
 *
 * Safe to run at any time. Only deletes rows whose name starts with [TEST-P5].
 *
 * Usage: node tests/cleanup-leftovers.mjs
 */

import './helpers/env.mjs'
import { dbSelect, dbDelete, dbUpdate } from './helpers/db.mjs'

async function cleanup() {
  console.log('Scanning for leftover [TEST-P5] fixtures...\n')
  let found = false

  // Find all test events by name prefix
  const events = await dbSelect('p101_opencall_events', {}, { select: 'id,year,name', order: 'year.desc' })
  const testEvents = events.filter(e => e.name.startsWith('[TEST-P5]'))

  if (testEvents.length === 0) {
    console.log('No leftover test events found.')
  } else {
    found = true
    console.log(`Found ${testEvents.length} leftover test event(s):`)
    for (const ev of testEvents) {
      console.log(`  year=${ev.year}  id=${ev.id}  name=${ev.name}`)
    }
  }

  for (const ev of testEvents) {
    const evId = ev.id

    // Get all invites for this event
    const invites = await dbSelect('p101_opencall_rep_invites', { event_id: `eq.${evId}` }, { select: 'id' })
    for (const inv of invites) {
      await dbDelete('p101_opencall_access_log',    { invite_id: `eq.${inv.id}` }).catch(e => console.warn(`  access_log: ${e.message}`))
      await dbDelete('p101_opencall_intro_requests', { invite_id: `eq.${inv.id}` }).catch(e => console.warn(`  intro_requests: ${e.message}`))
      await dbDelete('p101_opencall_rep_favorites',  { invite_id: `eq.${inv.id}` }).catch(e => console.warn(`  favorites: ${e.message}`))
      await dbDelete('p101_opencall_rep_invites',    { id: `eq.${inv.id}` }).catch(e => console.warn(`  invites: ${e.message}`))
      console.log(`  Deleted invite ${inv.id}`)
    }

    // Get all applications for this event
    const apps = await dbSelect('p101_opencall_applications', { event_id: `eq.${evId}` }, { select: 'id,user_id' })
    const userIds = [...new Set(apps.map(a => a.user_id))]

    for (const app of apps) {
      await dbDelete('p101_opencall_applications', { id: `eq.${app.id}` }).catch(e => console.warn(`  applications: ${e.message}`))
      console.log(`  Deleted application ${app.id}`)
    }

    // Delete the event
    await dbDelete('p101_opencall_events', { id: `eq.${evId}` }).catch(e => console.warn(`  events: ${e.message}`))
    console.log(`  Deleted event ${evId} (year=${ev.year})`)

    // Clean up auth users — look for test email addresses
    const { requireEnv } = await import('./helpers/env.mjs')
    const supabaseUrl = requireEnv('SUPABASE_URL')
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

    for (const uid of userIds) {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      })
      if (res.ok || res.status === 404) {
        console.log(`  Deleted auth user ${uid}`)
      } else {
        console.warn(`  Could not delete auth user ${uid}: ${res.status}`)
      }
    }
  }

  if (found) {
    console.log('\nCleanup complete.')
  } else {
    console.log('Database is clean — no leftover test data found.')
  }
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err.message)
  process.exitCode = 1
})
