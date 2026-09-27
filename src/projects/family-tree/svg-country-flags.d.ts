// Next types every .svg import as `any` (to leave room for SVGR). The flag
// files load as plain static assets, whose default export is the file's URL,
// so this narrower pattern, which TypeScript prefers over the `*.svg` one,
// says so.
declare module "svg-country-flags/svg/*.svg" {
  const url: string;
  export default url;
}
