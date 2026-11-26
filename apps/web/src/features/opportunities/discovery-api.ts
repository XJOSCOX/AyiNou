import { useRef } from "react";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useFeedMutation } from "@/lib/feed-state";

export const discoveryPath = "/api/v1/me/opportunity-discovery";

export function discoveryRead<T>(suffix: string, signal: AbortSignal): Promise<T> {
  return authorizedSocialRequest(discoveryPath + suffix, { signal, cache: "no-store" });
}

export function useDiscoveryCommand(version: number, refresh: () => void) {
  const mutation = useFeedMutation();
  const receipt = useRef<{ requestId: string; body: string } | null>(null);
  function send(input: object) {
    const fields = { expectedVersion: version, ...input };
    const body = JSON.stringify(fields);
    if (receipt.current?.body !== body) receipt.current = { body, requestId: crypto.randomUUID() };
    const { requestId } = receipt.current;
    return mutation.run(async () => {
      await authorizedSocialRequest(discoveryPath, { method: "PATCH", body: JSON.stringify({ ...fields, requestId }) });
      refresh();
    });
  }
  return { ...mutation, send };
}
