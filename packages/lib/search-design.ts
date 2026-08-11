/** Product-wide Opus search-field contract shared by every application. */
export function opusSearchClass({ customClear = false }: { customClear?: boolean } = {}): string {
  return customClear ? 'opus-search opus-search--custom-clear' : 'opus-search'
}
