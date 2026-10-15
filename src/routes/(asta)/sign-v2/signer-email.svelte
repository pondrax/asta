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
    if (!verify) return;
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
      status = result.status;
      form = {
        ...form,
        nama: result.user?.name,
        pangkat: result.user?.rank,
        instansi: result.user?.organizations,
        jabatan: result.user?.position,
        nomor_telepon: result.user?.phone || "",
      };
      onUser?.(result.user);
      localStorage.setItem("email", form.email);
    } catch {
      status = "[Server Esign Error] Check User Failed";
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
    class="input input-sm input-ghost w-64! self-center h-8!"
  >
    <!-- <iconify-icon icon="bx:pen" class="opacity-50"></iconify-icon> -->
    <input
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
      <span class="label"
        >{emailFocused ? "***go.id" : "@mojokertokota.go.id"}</span
      >
    {/if}
    {#if loading}
      <span class="loading"></span>
    {:else if status == "ISSUE"}
      <iconify-icon icon="bx:check" class="text-success"></iconify-icon>
    {:else}
      <iconify-icon icon="bx:x" class="text-error"></iconify-icon>
    {/if}
  </div>
</div>

<style>
  .signer-email.tooltip {
    display: inline-flex;
    align-items: center;
  }
</style>
