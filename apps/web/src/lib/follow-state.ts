import type { FollowStatus } from "@ayinou/shared";
import { apiErrorCode } from "./api-errors";

export async function reconcileFollow(
  following: boolean,
  write: () => Promise<FollowStatus>,
  read: () => Promise<FollowStatus>,
  apply: (status: FollowStatus) => void,
) {
  try { apply(await write()); }
  catch (cause) {
    if (["NETWORK_ERROR", "TIMEOUT", "SERVICE_UNAVAILABLE", "CONFLICT"].includes(apiErrorCode(cause))) {
      try {
        const current = await read();
        apply(current);
        if (current.following === following) return;
      } catch { /* Keep the last confirmed state and surface the write error. */ }
    }
    throw cause;
  }
}
