import { locales } from "@ayinou/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FeedRouteContext } from "./context.js";
import { translateOnRequest, type TranslationSource } from "../../services/translation.js";

export function registerFeedLanguageRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
  app.get("/api/v1/me/feed-languages", async (request) => {
    const { token,actor } = await viewer(request,true);
    await read("feed",actor,request.ip);
    return repo().rpc(token,"feed_languages_for_client",{ p_languages:null });
  });
  app.put("/api/v1/me/feed-languages", { bodyLimit: 1024 }, async (request) => {
    const { token } = await viewer(request,true);
    const { languages } = z.strictObject({ languages:z.array(z.enum(locales)).max(4) }).parse(request.body);
    return repo().rpc(token,"feed_languages_for_client",{ p_languages:languages });
  });
  app.post("/api/v1/feed/translation", { bodyLimit: 1024 }, async (request) => {
    const { token,actor } = await viewer(request,true);
    await read("feed",actor,request.ip);
    const { kind,id,language } = z.strictObject({ kind:z.enum(["post","comment"]),id:z.uuid(),language:z.enum(locales) }).parse(request.body);
    const source = await repo().rpc<TranslationSource>(token,"translation_source_for_client",{
      p_kind:kind,p_id:id,p_target:language,
    });
    return translateOnRequest(source,language);
  });
}
