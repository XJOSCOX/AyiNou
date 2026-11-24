import type { Locale } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

export type FeedLanguageSettings = { languages: Locale[]; enabled: boolean; translationEnabled: boolean };
export type ContentTranslation = { status: "unavailable" } |
  { status: "translated"; body: string; language: Locale; machineGenerated: true };

const route = "/api/v1/me/feed-languages";
export const loadFeedLanguages = (signal: AbortSignal): Promise<FeedLanguageSettings> => authorizedSocialRequest(route,{ signal });
export const saveFeedLanguages = (languages: Locale[]): Promise<FeedLanguageSettings> =>
  authorizedSocialRequest(route,{ method:"PUT",body:JSON.stringify({ languages }) });
export const translateFeedContent = (kind: "post" | "comment", id: string, language: Locale): Promise<ContentTranslation> =>
  authorizedSocialRequest("/api/v1/feed/translation",{ method:"POST",body:JSON.stringify({ kind,id,language }) });
