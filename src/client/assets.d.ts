/** Image files imported from TypeScript resolve to their bundled URL (Bun bundler). */
declare module '*.svg' {
  const url: string;
  export default url;
}
declare module '*.png' {
  const url: string;
  export default url;
}
declare module '*.webp' {
  const url: string;
  export default url;
}
