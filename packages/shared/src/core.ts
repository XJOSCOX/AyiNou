export type ServiceState = "ok";

export interface HealthResponse {
  status: ServiceState;
  service: "ayinou-api";
}

export interface StatusResponse extends HealthResponse {
  version: "v1";
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    retryable?: boolean;
  };
}

export const locales = ["ht", "fr", "en", "es"] as const;
export type Locale = (typeof locales)[number];
