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
  };
}
