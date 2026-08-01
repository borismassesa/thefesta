// fontkit 2.x ships no type declarations and has no @types package.
//
// Declared here rather than pulling in another dependency, and deliberately
// narrow: it describes only the surface font-metadata.ts actually reads, so
// this file doubles as the record of what we depend on. Anything else stays
// `unknown` and has to be narrowed at the call site.
//
// Note the runtime resolves `fontkit` through an exports map with a `node`
// condition (dist/main.cjs). There is no default export; import it as
// `import * as fontkit from 'fontkit'`.

declare module 'fontkit' {
  /** OS/2 fsType embedding permission bits, decoded. */
  export interface FsType {
    noEmbedding?: boolean
    viewOnly?: boolean
    editable?: boolean
    noSubsetting?: boolean
    bitmapOnly?: boolean
  }

  export interface Os2Table {
    usWeightClass?: number
    fsSelection?: { italic?: boolean; oblique?: boolean; bold?: boolean }
    fsType?: FsType
  }

  export interface Font {
    familyName?: string
    subfamilyName?: string
    fullName?: string
    postscriptName?: string
    /** Name-table lookup, e.g. 'preferredFamily' (ID 16). Null when absent. */
    getName(key: string): string | null
    numGlyphs?: number
    type?: string
    hasGlyphForCodePoint(codePoint: number): boolean
    /** Indexed because the table name contains a slash. */
    ['OS/2']?: Os2Table
  }

  /** A .ttc holds several faces and must be handled separately. */
  export interface FontCollection {
    fonts: Font[]
  }

  export function create(buffer: Uint8Array): Font | FontCollection
}
