// xlsx-js-style is a drop-in fork of SheetJS (xlsx) with the same API plus a
// `s` style property on cells. It doesn't ship its own TypeScript types, so we
// reuse the types from the `xlsx` package (already a dependency). This lets
// `import * as XLSX from 'xlsx-js-style'` type-check under strict mode.
declare module 'xlsx-js-style' {
  export * from 'xlsx';
}
