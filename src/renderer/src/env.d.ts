declare module '*.css'

/** Vite inlines `?inline` assets as data URLs (used for the logo on printed documents). */
declare module '*?inline' {
  const src: string
  export default src
}
