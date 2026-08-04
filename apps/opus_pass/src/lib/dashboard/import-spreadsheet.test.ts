import assert from 'node:assert/strict'
import test from 'node:test'
import { rowsToImportLines } from './import-spreadsheet'

test('maps recognized guest columns and carries Ticket Type through', () => {
  const rows = [
    ['GUEST LIST — MOSES SEETA'],
    ['#', 'Name', 'Phone', 'WhatsApp (+255)', 'Has WhatsApp?', 'Ticket Type', 'Notes'],
    ['1', 'Familia ya Seeta', '0755000850', '+255755000850', 'Not checked', 'Double', ''],
    ['2', 'Mrs Joyce Nkembo', '', '', 'No number', 'Single', 'No phone yet'],
    ['', 'TOTAL', '', '', '', '2', ''],
  ]

  assert.equal(
    rowsToImportLines(rows, true),
    [
      'Familia ya Seeta, , 0755000850, Double',
      'Mrs Joyce Nkembo, , , Single',
    ].join('\n'),
  )
})

test('does not mistake Review sheet phrases for a guest header', () => {
  const reviewRows = [
    ['ITEMS TO CHECK BEFORE SENDING'],
    ['Type', 'Guest / Item', 'Issue', 'Action'],
    ['Duplicate Name', 'Joel Leo / Joel Leo', 'The same name on more than one row.', 'Confirm'],
    ['Missing Numbers', '21 guests', 'No phone number', 'Find numbers'],
  ]

  assert.equal(rowsToImportLines(reviewRows, true), '')
})

test('does not mistake Summary sheet phrases for a guest header', () => {
  const summaryRows = [
    ['SUMMARY'],
    ['Item', 'Count'],
    ['Total guests (invitations)', '85'],
    ['With a phone number', '64'],
    ['Without a phone number', '21'],
    ['COLOUR KEY'],
    ['Red', 'No phone number — no card can be sent.'],
  ]

  assert.equal(rowsToImportLines(summaryRows, true), '')
})

test('quotes a cell containing a comma so the line reads back intact', () => {
  const rows = [
    ['Name', 'Phone', 'Ticket Type'],
    ['Ngando, Jr.', '0762269228', 'Double'],
  ]

  assert.equal(rowsToImportLines(rows, true), '"Ngando, Jr.", , 0762269228, Double')
})

test('falls back to the documented paste order when there is no header', () => {
  assert.equal(
    rowsToImportLines([['Asha', 'asha@example.com', '0755000850', 'Double']]),
    'Asha, asha@example.com, 0755000850, Double',
  )
  // With requireHeader a headerless sheet is skipped rather than guessed at.
  assert.equal(rowsToImportLines([['NoHeaderName']], true), '')
})

test('trims a trailing empty ticket column', () => {
  const rows = [
    ['Name', 'Phone'],
    ['Juma', '0712345678'],
  ]

  assert.equal(rowsToImportLines(rows, true), 'Juma, , 0712345678')
})

test('imports every genuine sheet that uses a recognized Jina header', () => {
  assert.equal(
    rowsToImportLines([
      ['Jina', 'Namba ya Simu', 'Aina ya Tiketi'],
      ['Bw. Juma', '0712345678', 'Double'],
    ], true),
    'Bw. Juma, , 0712345678, Double',
  )
})
