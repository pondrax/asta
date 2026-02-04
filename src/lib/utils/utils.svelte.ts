import { query } from "$app/server";
import type { RemoteQueryFunction } from "@sveltejs/kit";

export type ReactivePromise<T> = {
  readonly loading: boolean;
  readonly current: T | undefined;
  readonly error: Error | undefined;
  refresh: () => void;
};

export function withTimeout<T>(
  promiseOrFactory: Promise<T> | (() => Promise<T>),
  ms: number = 30000,
): ReactivePromise<T> {
  let loading = $state(true);
  let current = $state<T | undefined>(undefined);
  let error = $state<Error | undefined>(undefined);
  let trigger = $state(0);

  const factory =
    typeof promiseOrFactory === "function"
      ? promiseOrFactory
      : () => promiseOrFactory;

  $effect(() => {
    // Access trigger to re-run when refresh() is called
    trigger;

    loading = true;
    error = undefined;

    const promise = Promise.resolve(factory());
    let timerId: any;

    const timeout = ms
      ? new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            reject(new Error("Request timed out"));
          }, ms);
        })
      : null;

    const race = timeout ? Promise.race([promise, timeout]) : promise;

    race
      .then((result) => {
        current = result as T;
      })
      .catch((err) => {
        error = err instanceof Error ? err : new Error(String(err));
      })
      .finally(() => {
        loading = false;
        if (timerId) {
          clearTimeout(timerId);
        }
      });
    // console.log(promiseOrFactory)
  });

  return {
    get loading() {
      return loading;
    },
    get current() {
      return current;
    },
    get error() {
      return error;
    },
    refresh: () => {
      trigger++;
    },
  };
}
