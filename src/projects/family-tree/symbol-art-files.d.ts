// Next types every .svg import as `any` (to leave room for SVGR). The symbol
// art loads as plain static assets, whose default export is the file's URL,
// so this narrower pattern, which TypeScript prefers over the `*.svg` one,
// says so. It needs the `@/` path: an ambient module can't be relative.
declare module "@/projects/family-tree/symbol-art/*.svg" {
  const url: string;
  export default url;
}
