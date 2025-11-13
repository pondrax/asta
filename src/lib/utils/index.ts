export function debounce(fn: (el: Event) => Promise<void>, delay: number) {
  let timeoutId: number | NodeJS.Timeout;
  return (el: Event) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(el), delay);
  };
}