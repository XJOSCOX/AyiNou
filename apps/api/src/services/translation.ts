import type { Locale } from "@ayinou/shared";

/** Inject only a provider approved for independently public content. */
export interface TranslationProvider {
  supports(source: Locale, target: Locale): boolean;
  translate(parts: readonly string[], source: Locale, target: Locale, signal: AbortSignal): Promise<readonly string[]>;
}

export type TranslationSource = { eligible: false } | { eligible: true; body: string; language: Locale };
export type TranslationResult =
  | { status: "unavailable" }
  | { status: "translated"; body: string; language: Locale; machineGenerated: true };

// Preserve URLs, mentions, hashtags, and formatting before calling any provider.
const literal = /https?:\/\/[^\s]+|@(?:org:)?[\w-]+|#[\p{L}\p{N}_]+|\r\n|[\r\n\t]| {2,}/giu;
const unavailable = { status: "unavailable" } as const;
export async function translateOnRequest(
  source: TranslationSource, target: Locale, provider?: TranslationProvider,
): Promise<TranslationResult> {
  if (!source.eligible || !provider?.supports(source.language,target) || source.body.length > 3000) return unavailable;
  const segments = source.body.split(new RegExp("(" + literal.source + ")",literal.flags));
  const indices = segments.flatMap((segment,index) => index % 2 === 0 && segment.trim() ? [index] : []);
  if (!indices.length || indices.length > 48) return unavailable;
  const signal = AbortSignal.timeout(4000);
  try {
    const output = await Promise.race([
      provider.translate(indices.map((index) => segments[index]),source.language,target,signal),
      new Promise<never>((_resolve,reject) => signal.addEventListener("abort",() => reject(signal.reason),{ once: true })),
    ]);
    if (output.length !== indices.length || output.some((part) => typeof part !== "string" || !part.trim() || part.length > 5000
      || new RegExp(literal.source,literal.flags).test(part))) return unavailable;
    indices.forEach((index,position) => { segments[index] = output[position]; });
    const body = segments.join("");
    return body.length <= 6000 ? { status: "translated",body,language:target,machineGenerated:true } : unavailable;
  } catch {
    return unavailable;
  }
}
