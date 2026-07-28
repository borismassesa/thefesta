#!/usr/bin/env node
// Opus answer-quality regression harness.
//
// Runs a golden Q&A set against a running Opus chat endpoint and checks each
// answer contains at least one expected phrase (case-insensitive). This guards
// the guardrail-escalation, RAG-grounding, multilingual and on-topic behaviours
// from silently regressing.
//
// Usage:
//   OPUS_EVAL_URL=http://localhost:3006 node scripts/opus-eval.mjs
// Exit code is non-zero if any case fails, so it can gate CI.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.OPUS_EVAL_URL || 'http://localhost:3006'
const ENDPOINT = `${BASE}/api/opus/chat`

async function ask(question) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
      visitorId: `eval-${Math.random().toString(36).slice(2)}`,
    }),
  })
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${body.slice(0, 120)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text.trim()
}

const cases = JSON.parse(await readFile(join(__dirname, 'opus-eval-golden.json'), 'utf8'))

let passed = 0
const failures = []

for (const c of cases) {
  process.stdout.write(`• ${c.q}\n`)
  try {
    const answer = await ask(c.q)
    const lower = answer.toLowerCase()
    const hit = c.expectAny.some((p) => lower.includes(p.toLowerCase()))
    if (hit) {
      passed++
      console.log(`  PASS — ${c.note}`)
    } else {
      failures.push({ q: c.q, expected: c.expectAny, answer })
      console.log(`  FAIL — expected one of [${c.expectAny.join(', ')}]`)
      console.log(`         got: ${answer.slice(0, 160)}...`)
    }
  } catch (err) {
    failures.push({ q: c.q, error: String(err) })
    console.log(`  ERROR — ${err}`)
  }
}

console.log(`\n${passed}/${cases.length} passed`)
if (failures.length > 0) {
  console.error(`${failures.length} failing case(s).`)
  process.exit(1)
}
