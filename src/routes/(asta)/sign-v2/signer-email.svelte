<script lang="ts">
  import { onMount } from "svelte";
  import { debounce } from "$lib/utils";
  import { checkUser } from "$lib/remotes/sign.remote";

  let {
    form = $bindable({}),
    status = $bindable("NOT_REGISTERED"),
    loading = $bindable(false),
    useEmail = $bindable(true),
    onUser,
    placeholder = "Email Dinas",
    placement = "top",
    verify = true,
  }: {
    form?: Record<string, any>;
    status?: string;
    loading?: boolean;
    useEmail?: boolean;
    onUser?: (user: any) => void;
    placeholder?: string;
    placement?: "top" | "bottom";
    verify?: boolean;
  } = $props();

  let emailFocused = $state(false);

  const checkEmail = async () => {
    if (!form.email && !form.nik) return;
    const cancel = useEmail
      ? form.email.startsWith("@") || form.email.length === 0
      : form.nik.length == 0;
    if (cancel) return;

    loading = true;
    try {
      const result = await checkUser(
        useEmail ? { email: form.email } : { nik: form.nik },
      );
      if (verify) status = result.status;
      const u = result.user ?? {};
      form = {
        ...form,
        ...(u.name ? { nama: u.name } : {}),
        ...(u.rank ? { pangkat: u.rank } : {}),
        ...(u.organizations ? { instansi: u.organizations } : {}),
        ...(u.position ? { jabatan: u.position } : {}),
        ...(u.phone ? { nomor_telepon: u.phone } : {}),
      };
      onUser?.(result.user);
      localStorage.setItem("email", form.email);
    } catch {
      if (verify) status = "[Server Esign Error] Check User Failed";
    }
    loading = false;
  };
  const debounceCheckEmail = debounce(checkEmail, 500);

  onMount(() => {
    if (!verify) return;
    //@ts-ignore - debounce accepts a loose event argument
    debounceCheckEmail(new Event("init"));
  });
</script>

<div
  class="tooltip signer-email"
  class:tooltip-bottom={placement === "bottom"}
  class:tooltip-open={verify && status === "NOT_REGISTERED"}
>
  {#if verify && form.email?.split("@").at(0) !== ""}
    <div class="tooltip-content pointer-events-auto!">
      {#if status === "ISSUE"}
        <div class="">Status Akun : {status}</div>
      {:else if status === "NOT_REGISTERED"}
        <div class="">{status}</div>
        <div>
          <a
            href={`/services/register?identity=${form.email}`}
            class="btn btn-xs btn-error"
            target="_blank"
          >
            Daftar Sekarang
          </a>
        </div>
      {:else}
        <div class="">{status}</div>
      {/if}
    </div>
  {/if}


  <div
    class="input input-sm input-ghost w-60! h-8! flex! items-baseline! gap-1 leading-none"
  >
    <iconify-icon
      icon="bx:envelope"
      class="shrink-0 self-center mr-1 text-xs opacity-50 max-lg:hidden"
    ></iconify-icon>
    <!-- `mt-[-0.5px]` lifts the input half a pixel: the `TTE` label's text sits
         0.5px above the input's, because the label's anonymous flex item snaps
         to a whole pixel while the input's line box does not. A layout margin
         (not `relative`/`translate`) means the domain suffix follows along via
         baseline alignment, so input, suffix and `TTE` all share one baseline. -->
    <input
      class="min-w-0 flex-1 bg-transparent p-0 m-0 mt-[-0.5px] border-0 text-xs leading-none outline-none"
      bind:value={
        () => (verify ? form.email?.split("@")?.at(0) : form.email),
        (value) =>
          (form.email = verify
            ? String(value)
                .toLowerCase()
                .replace(/@mojokertokota\.go\.id/gi, "") +
              "@mojokertokota.go.id"
            : String(value))
      }
      required
      type="text"
      {placeholder}
      oninput={debounceCheckEmail}
      onfocus={() => (emailFocused = true)}
      onblur={() => (emailFocused = false)}
      onpaste={(e) => {
        const text = e.clipboardData?.getData("text") || "";
        if (/@mojokertokota\.go\.id/i.test(text)) {
          e.preventDefault();
          const cleaned = text.replace(/@mojokertokota\.go\.id/gi, "");
          const input = e.currentTarget as HTMLInputElement;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          input.value =
            input.value.slice(0, start) + cleaned + input.value.slice(end);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }}
    />
    {#if verify}
      <!-- `shrink-0` + `whitespace-nowrap` keep the domain on the same line as
           the address: without them the span is a shrinkable flex item and the
           long domain can be squeezed or pushed onto its own line. The typography
           (`text-xs`, `leading-none`) matches the input exactly, so the address
           and the domain sit on one baseline and line up with the 12px `TTE`
           label beside the group. No `self-center` — it would override the
           group's `items-baseline` and centre the domain, leaving its text off
           the input's baseline. -->
      <span
        class="shrink-0 whitespace-nowrap text-xs leading-none opacity-60"
        >{emailFocused ? "***go.id" : "@mojokertokota.go.id"}</span
      >
    {/if}
    {#if loading}
      <span class="loading self-center"></span>
    {:else if status == "ISSUE"}
      <iconify-icon
        icon="bx:check"
        class="self-center text-success"></iconify-icon>
    {:else}
      <iconify-icon
        icon="bx:x"
        class="self-center text-error"></iconify-icon>
    {/if}
  </div>
</div>

<style>
  .signer-email.tooltip {
    display: inline-flex;
    align-items: center;
  }
</style>
