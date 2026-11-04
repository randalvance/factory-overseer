/** Relative host art shares the factory asset base; explicit URLs keep their meaning. */
export function resolveAssetUrl(url: string, base: string): string {
  return /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(url) ? url : `${base.replace(/\/?$/, "/")}${url.replace(/^\.\//, "")}`
}
