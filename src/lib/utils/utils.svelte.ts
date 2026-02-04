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

  const factory =
    typeof promiseOrFactory === "function"
      ? promiseOrFactory
      : () => promiseOrFactory;

  function execute() {
    loading = true;
    error = undefined;

    let timerId: any;
    const promise = Promise.resolve(factory());
    const timeout = ms
      ? new Promise<never>((_, reject) => {
          console.log(`[withTimeout] Starting timeout: ${ms}ms`);
          timerId = setTimeout(() => {
            console.error(`[withTimeout] Timed out after ${ms}ms`);
            reject(new Error("Request timed out"));
          }, ms);
        })
      : null;

    const race = timeout ? Promise.race([promise, timeout]) : promise;

    race
      .then((result) => {
        current = result;
      })
      .catch((err) => {
        error = err instanceof Error ? err : new Error(String(err));
      })
      .finally(() => {
        loading = false;
        if (timerId) {
          clearTimeout(timerId);
          console.log(`[withTimeout] Cleared timeout`);
        }
      });
  }

  execute();

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
    refresh: execute,
  };
}
