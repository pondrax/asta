// "warning" is for partial success — an AI plan that built three of four
// tables. Reporting that as an error would be a lie, and reporting it as
// success would hide the step that did not land.
type ToastType = "success" | "error" | "warning";

export const app = $state<{
  theme: string;
  showTour: boolean;
  showPassphrase: boolean;
  toasts: { id: number; type: ToastType; message: string }[];
  showToast: (type: ToastType, message: string, duration?: number) => void;
}>({
  theme: "light",
  showTour: false,
  showPassphrase: false,
  toasts: [],
  showToast(type: ToastType, message: string, duration = 3000) {
    const id = Date.now();
    this.toasts = [...this.toasts, { id, type, message }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, duration);
  },
});

