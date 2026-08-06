import 'server-only'
import { readBeemConfig, readBeemConfigPresence } from './config'
import { isBeemEnabledForPurpose, type SmsPurpose } from './purpose'
import { selectSmsProvider } from './select'
import type { SmsProvider } from './types'

export type { SmsProvider, SmsLinkSend, SmsSendResult } from './types'
export { type SmsPurpose, SMS_PURPOSES, purposeFlagName } from './purpose'
export { analyzeSmsLength, type SmsLengthAnalysis, type SmsEncoding } from './segments'

/**
 * Returns the live provider for this surface, else the dry-run stub.
 *
 * `purpose` is required rather than optional. Before it existed this function
 * took no arguments, so configuring a gateway would have switched on every SMS
 * surface in the app at once — couples' pledge nudges and staff-triggered
 * sends alongside whatever was actually being launched. Each purpose now has
 * its own env flag (see `purposeFlagName`), and a purpose that is switched off
 * quietly keeps using the stub, exactly as it does today.
 */
export function getSmsProvider(purpose: SmsPurpose): SmsProvider {
  const enabled = isBeemEnabledForPurpose(purpose)
  return selectSmsProvider(purpose, { enabled, config: enabled ? readBeemConfig() : null })
}

export interface SmsProviderDiagnostics {
  purpose: SmsPurpose
  /** What `SMS_PROVIDER` asks for, which is not always what gets used. */
  configuredProvider: string
  /** What this purpose will actually send through right now. */
  selectedProvider: string
  live: boolean
  purposeEnabled: boolean
  credentialsPresent: boolean
  senderIdPresent: boolean
  debugResponseEnabled: boolean
}

/**
 * Why a purpose is or isn't live, in a form safe to render in an admin health
 * check. Contains no credential, sender secret or partial value — only
 * presence booleans — and sends nothing.
 */
export function getSmsProviderDiagnostics(purpose: SmsPurpose): SmsProviderDiagnostics {
  const purposeEnabled = isBeemEnabledForPurpose(purpose)
  const presence = readBeemConfigPresence()
  const provider = getSmsProvider(purpose)
  return {
    purpose,
    configuredProvider: process.env.SMS_PROVIDER?.trim().toLowerCase() || 'stub',
    selectedProvider: provider.name,
    live: provider.live,
    purposeEnabled,
    ...presence,
  }
}
