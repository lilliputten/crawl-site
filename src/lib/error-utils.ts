// src/lib/error-utils.ts

import { AxiosError } from 'axios';

/**
 * Format Axios error into a readable message
 */
export function formatAxiosError(error: unknown, url?: string): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  // Check if it's an Axios error
  const axiosError = error as AxiosError;

  if (axiosError.isAxiosError) {
    // Network error (no response)
    if (!axiosError.response) {
      const code = axiosError.code || 'UNKNOWN';
      const message = axiosError.message || 'Network error';
      return `${code}: ${message}`;
    }

    // HTTP error with status code
    const status = axiosError.response.status;
    const statusText = axiosError.response.statusText || 'Unknown';
    return `HTTP ${status} ${statusText}`;
  }

  // Regular error
  return error.message;
}

/**
 * Get HTTP status code from error if available
 */
export function getHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const axiosError = error as AxiosError;
  if (axiosError.isAxiosError && axiosError.response) {
    return axiosError.response.status;
  }

  return null;
}
