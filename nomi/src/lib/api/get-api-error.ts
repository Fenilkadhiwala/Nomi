import axios from "axios";

export interface ClientApiError {
  code: string;
  message: string;
}

interface ApiErrorResponse {
  success?: boolean;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

export function getApiError(error: unknown): ClientApiError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (!error.response) {
      return {
        code: "NETWORK_ERROR",
        message: "Unable to connect to the server. Please try again.",
      };
    }

    const { status, data } = error.response;

    if (
      typeof data?.error?.code === "string" &&
      typeof data.error.message === "string"
    ) {
      return {
        code: data.error.code,
        message: data.error.message,
      };
    }

    // Compatibility with older API responses.
    if (status === 429) {
      return {
        code: "RATE_LIMITED",
        message: data?.message || "Too many attempts. Please try again later.",
      };
    }

    if (status === 401) {
      return {
        code: "INVALID_CREDENTIALS",
        message: "Incorrect email or password. Please try again.",
      };
    }

    if (status === 409) {
      return {
        code: "EMAIL_ALREADY_EXISTS",
        message: "An account with this email already exists. Please sign in.",
      };
    }

    if (status === 400) {
      return {
        code: "VALIDATION_ERROR",
        message: data?.message || "Please check the information you entered.",
      };
    }

    return {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again later.",
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again later.",
  };
}
