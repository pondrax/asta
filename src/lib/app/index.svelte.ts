export const app = $state<{
  theme: string;
  showTour: boolean;
  showPassphrase: boolean;
  toasts: { id: number; type: "success" | "error"; message: string }[];
  showToast: (type: "success" | "error", message: string, duration?: number) => void;
}>({
  theme: "light",
  showTour: false,
  showPassphrase: false,
  toasts: [],
  showToast(type: "success" | "error", message: string, duration = 3000) {
    const id = Date.now();
    this.toasts = [...this.toasts, { id, type, message }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, duration);
  },
});

