import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getErrorMessage(
  error: any,
  defaultMessage = 'An unknown error occurred'
): string {
  return error instanceof Error ? error.message : defaultMessage
}


export type SafeSuccess<T> = {
  success: true;
  data: T;
};

export type SafeError = {
  success: false;
  error?: any;
  errorMessage?: string;
};

export type Safe<T> = SafeSuccess<T> | SafeError;

// If T is Promise<X>, return Promise<Safe<X>>; otherwise return Safe<T>.
export type SafeResult<T> = T extends Promise<infer U>
  ? Promise<Safe<U>>
  : Safe<T>;

// If T looks like SafeSuccess<U>, return U (the data type); otherwise return never.
export type SafeValue<T> = T extends SafeSuccess<infer U> ? U : never;

// For a function type T, take its return type, unwrap Promise if needed, then extract the SafeSuccess data type inside.
export type SafeReturnType<T extends (...args: any[]) => any> = SafeValue<Awaited<ReturnType<T>>>;

export function safeSuccess<T>(data: T): SafeSuccess<T> {
  return { success: true, data: data };
}

type SafeErrorOptions = {
  message?: string;
  serializeError?: boolean;
};
export function safeError(
  error: any,
  options: SafeErrorOptions = { serializeError: true }
): SafeError {
  return {
    success: false,
    error: options?.serializeError
      ? getErrorMessage(error) ?? JSON.stringify(error)
      : error,
    errorMessage: options?.message ?? getErrorMessage(error),
  };
}

/**
 * Wraps a function in a try/catch block and returns a safe result.
 *
 * This is useful for handling errors in a more functional way.
 * Instead of throwing, we can treat errors as data, thereby avoiding
 * large, nested try/catch blocks.
 *
 * @example
 * ```ts
 * const result = safe(async () => {
 *   return await fetch('https://api.example.com')
 * })
 *
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.message)
 * }
 * ```
 */

// Run any function (sync or async) and return {success, data} or {success: false, ...} instead of throwing.
export function safe<T extends (...args: any[]) => any>(
  fn: T,
  ...args: Parameters<T>
): SafeResult<ReturnType<T>> {
  try {
    const result = fn(...args);
    if (result instanceof Promise) {
      return result
        .then((value) => safeSuccess(value))
        .catch((error) => safeError(error)) as SafeResult<ReturnType<T>>;
    }
    return safeSuccess(result) as SafeResult<ReturnType<T>>;
  } catch (error) {
    console.error("safe error:", error);
    return safeError(error) as SafeResult<ReturnType<T>>;
  }
}

export function unsafe<T>(value: Safe<T>) {
  if (value.success) {
    return value.data;
  }
  throw new Error(value.errorMessage);
}