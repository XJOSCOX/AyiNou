import type { HealthResponse, StatusResponse } from "@ayinou/shared";

export function getHealth(): HealthResponse {
  return { status: "ok", service: "ayinou-api" };
}

export function getStatus(): StatusResponse {
  return { ...getHealth(), version: "v1" };
}
