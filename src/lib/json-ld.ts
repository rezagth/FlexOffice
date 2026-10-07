/**
 * Serializes structured data for a `<script type="application/ld+json">`.
 *
 * The payload contains partner-written text (space name, description), so
 * `<` is escaped: a description containing `</script><script>…` must not be
 * able to close the tag and run as HTML. U+2028/U+2029 are escaped too,
 * for old JavaScript parsers.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
