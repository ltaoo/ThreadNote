const src_base_url = new URL("./src/", import.meta.url);

export function resolve(specifier, context, next_resolve) {
  if (specifier.startsWith("@/")) {
    return next_resolve(new URL(specifier.slice(2), src_base_url).href, context);
  }

  return next_resolve(specifier, context);
}
