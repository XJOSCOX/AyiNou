import type { ReactionKind, ReactionSummary } from "@ayinou/shared";
import { apiErrorCode } from "./api-errors";

type Result = { reactions: ReactionSummary };

export async function reconcileReaction(
  kind: ReactionKind | null,
  write: () => Promise<Result>,
  read: () => Promise<Result>,
  apply: (summary: ReactionSummary) => void,
) {
  try {
    apply((await write()).reactions);
  } catch (cause) {
    if (["NETWORK_ERROR", "TIMEOUT", "SERVICE_UNAVAILABLE"].includes(apiErrorCode(cause))) {
      try {
        const { reactions } = await read();
        apply(reactions);
        if (reactions.mine === kind) return;
      } catch { /* Keep the previous confirmed state and surface the write error. */ }
    }
    throw cause;
  }
}
