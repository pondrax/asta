<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { page } from "$app/state";
  import { Toolbar, Chart, Modal } from "$lib/components";
  import {
    closeBsre,
    fetchBsreUsers,
    getSessionStatus,
    launchBsre,
    navigateBsre,
    debugBsreSession,
    getBsreStats,
    syncCertDates,
    getBsreUserCerts,
    resetCertPassphrase,
    requestEsignCert,
  } from "$lib/remotes/bsre.remote";
  import { getData, type GetParams } from "$lib/remotes/api.remote";
  import { d } from "$lib/utils";
  import { app } from "$lib/app/index.svelte";

  const userId = $derived(page.data.user?.id ?? page.data.user?.email ?? "");

  // Track token availability independently so Sync enables immediately after launch
  let tokenReady = $state(false);
  const status = $derived(getSessionStatus({ userId }));
  // Sync status's hasToken into our local state too
  $effect(() => {
    if (status.current?.hasToken) tokenReady = true;
  });

  let customUrl = $state("https://portal-bsre.bssn.go.id/");

  // Toolbar query state
  let query: GetParams<"bsreUsers"> = $state({
    table: "bsreUsers",
    limit: 20,
    offset: 0,
    where: {},
  });

  // Reactive records from local DB
  const records = $derived(getData({ ...query }));
  const items = $derived(records.current ?? { data: [], count: 0 });

  function setCertRange(
    where: Record<string, any>,
    field: "certStart" | "certEnd",
    bound: "from" | "to",
    value: string,
  ) {
    const existing = where[field] ?? {};
    const key = bound === "from" ? "gte" : "lte";
    if (value) {
      where[field] = { ...existing, [key]: value };
    } else {
      const next = { ...existing };
      delete next[key];
      if (Object.keys(next).length === 0) delete where[field];
      else where[field] = next;
    }
  }

  function certRangeVal(
    where: Record<string, any>,
    field: "certStart" | "certEnd",
    bound: "from" | "to",
  ): string {
    const key = bound === "from" ? "gte" : "lte";
    return where?.[field]?.[key] ?? "";
  }

  /**
   * Bulk email filter: one address per line becomes an `inArray` so a batch of
   * users can be looked up in a single query. `inArray` is exact-match — the
   * same semantics as the bare-string form, which drizzle RQB resolves to `eq`
   * (`relationsFieldFilterToSQL` short-circuits non-objects to `eq`) — so this
   * never degrades into a partial/`LIKE` match. Used for every count, including
   * a single line, so the filter shape doesn't flip while typing.
   */
  function parseBulkEmails(raw: string): string[] {
    const seen = new Set<string>();
    const emails: string[] = [];
    // Accept commas/semicolons too, so a pasted list works without cleanup.
    for (const line of raw.split(/[\r\n,;]+/)) {
      const email = line.trim();
      if (!email) continue;
      // Dedup case-insensitively but keep the address as typed, so `eq` still
      // compares against the stored casing.
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    return emails;
  }

  function setBulkEmails(where: Record<string, any>, raw: string) {
    const emails = parseBulkEmails(raw);
    if (!emails.length) {
      // `delete` rather than `undefined`: the toolbar renders a chip for any
      // key whose leaf values are non-empty, and `getLeafValues(undefined)`
      // yields `[undefined]`, which would leave a stale chip behind.
      delete where.emailAddress;
    } else {
      where.emailAddress = { inArray: emails };
    }
  }

  /** Renders the current filter back into the textarea. Tolerates the legacy
   *  bare-string form so an already-applied single-email filter still shows. */
  function bulkEmailVal(where: Record<string, any>): string {
    const filter = where?.emailAddress;
    if (typeof filter === "string") return filter;
    const list = (filter as { inArray?: unknown })?.inArray;
    return Array.isArray(list) ? list.join("\n") : "";
  }

  function bulkEmailCount(where: Record<string, any>): number {
    return parseBulkEmails(bulkEmailVal(where)).length;
  }

  // Sync state
  let syncing = $state(false);
  let selectedUser = $state<any>(null);

  // PII masking
  let showPii = $state(false);

  // ---------------------------------------------------------------------------
  // Bulk passphrase reset
  // ---------------------------------------------------------------------------

  /** Pause inserted between two consecutive portal resets. The portal is a
   *  government service that throttles aggressively; a short gap keeps a long
   *  selection from tripping its rate limiter partway through. */
  const RESET_STEP_DELAY = 400;

  /**
   * Users ticked for a bulk reset, keyed by BSrE user id. `SvelteSet` rather
   * than a plain array/Set because the built-in `Set` is not reactive — reading
   * `.size` in a `$derived` would never re-run after a toggle.
   */
  let selectedUsers = $state(new SvelteSet<string>());

  /**
   * The certificate of a user that the portal will accept a passphrase reset
   * for: status `ISSUE` *and* a serial number present, since the reset URL is
   * keyed by serial number and a cert without one 404s. Mirrors
   * `RESETTABLE_CERT_STATUSES` / `canReset` in `listUserCerts` so the bulk
   * button's count matches what the per-user modal would actually allow.
   */
  function resettableCert(user: any) {
    const certs: any[] = user?.details?.data?.sertifikat ?? [];
    const ok = certs.filter(
      (c) => c?.status === "ISSUE" && Boolean(c?.serialNumber),
    );
    if (!ok.length) return null;
    // Newest expiry first, so a user holding a stale and a current cert resets
    // the current one rather than whichever happened to sync first.
    return [...ok].sort(
      (a, b) =>
        new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime(),
    )[0];
  }

  /** Reset targets for the current selection — only users with a resettable cert. */
  const resetTargets = $derived.by(() =>
    items.data
      .filter((u) => u && selectedUsers.has(u.id))
      .map((u) => ({
        bsreUserId: u.id as string,
        serialNumber: resettableCert(u)?.serialNumber as string,
      }))
      .filter((t) => t.serialNumber),
  );

  // Users on this page that actually have something to reset, so the header
  // "select all" can't tick rows the bulk action would then silently skip.
  const pageResettable = $derived(
    items.data.filter((u) => u && resettableCert(u)),
  );
  const allPageSelected = $derived(
    pageResettable.length > 0 &&
      pageResettable.every((u) => selectedUsers.has(u.id)),
  );

  function toggleUser(id: string) {
    // Copy before mutating: `SvelteSet` exposes the same mutating API as `Set`,
    // but replacing the instance is what actually notifies `$derived`.
    const next = new SvelteSet(selectedUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedUsers = next;
  }

  function togglePageSelection() {
    const next = new SvelteSet(selectedUsers);
    if (allPageSelected) for (const u of pageResettable) next.delete(u.id);
    else for (const u of pageResettable) next.add(u.id);
    selectedUsers = next;
  }

  let confirmBulkReset = $state(false);
  let bulkResetting = $state(false);

  /** One line of the dialog's list — identity is copied in at open time. */
  type ResetQueueRow = {
    bsreUserId: string;
    serialNumber: string;
    nama: string;
    emailAddress: string;
  };

  /**
   * The rows the dialog *displays*, frozen when it opens.
   *
   * Deliberately not `resetTargets`: a finished run unticks its successes from
   * `selectedUsers`, which `resetTargets` derives from — so keying the list off
   * it would blank every name and message the instant the last reset succeeded,
   * destroying the very results the dialog exists to hold open for the operator
   * to read. It would also drop the count to "Reset 0 Passphrase" while the
   * summary above still said the run had succeeded.
   *
   * Name and email are copied in rather than looked up per render for the same
   * reason: the operator can page or filter the table while the dialog is open,
   * and a live `items.data.find` would start printing "-" for rows that had
   * scrolled off the current page.
   */
  let resetQueue = $state<ResetQueueRow[]>([]);

  /** Per-row outcome of the current run, keyed by BSrE user id. Absent = idle. */
  type ResetRowState = {
    status: "pending" | "running" | "ok" | "fail";
    message?: string;
  };
  let resetRows = $state<Record<string, ResetRowState>>({});

  /** The dialog's row count — the frozen queue, not the live selection. */
  const resetQueueTotal = $derived(resetQueue.length);

  /** Ids belonging to the current queue, so the counters below describe *this*
   *  run rather than every result ever recorded on the page. */
  const resetQueueIds = $derived(new Set(resetQueue.map((t) => t.bsreUserId)));

  /** Rows that finished (either way) in the current run — drives the progress
   *  counter without having to count statuses twice. */
  const resetDoneCount = $derived(
    Object.entries(resetRows).filter(
      ([id, r]) =>
        resetQueueIds.has(id) && (r.status === "ok" || r.status === "fail"),
    ).length,
  );
  const resetOkCount = $derived(
    Object.entries(resetRows).filter(
      ([id, r]) => resetQueueIds.has(id) && r.status === "ok",
    ).length,
  );
  const resetFailCount = $derived(
    Object.entries(resetRows).filter(
      ([id, r]) => resetQueueIds.has(id) && r.status === "fail",
    ).length,
  );

  /** Rows this run still owes a request to. Anything already "ok" is excluded,
   *  which is what makes "Coba Lagi" safe: the queue is frozen for the dialog's
   *  lifetime, so a naive retry would re-send the reset link to everyone who
   *  already received one. */
  const resetPendingCount = $derived(
    resetQueue.filter((t) => resetRows[t.bsreUserId]?.status !== "ok").length,
  );

  /**
   * Open the dialog for the current selection.
   *
   * Freezes the selection into `resetQueue` and puts those rows back to
   * "pending", so every opening is a clean, self-consistent attempt: the list,
   * the counts and the per-row verdicts all describe this run alone. Carrying the
   * previous attempt's statuses over would let the summary announce a result
   * the operator had not asked for yet.
   */
  function openResetDialog() {
    if (bulkResetting) return;
    const targets = [...resetTargets];
    const byId = new Map(items.data.map((u) => [u.id, u]));

    // Freeze the plan into `resetQueue` before the dialog opens: from here on
    // the list must survive `selectedUsers` being emptied by a successful run.
    resetQueue = targets.map((t) => {
      const u = byId.get(t.bsreUserId);
      return {
        ...t,
        nama: (u?.nama as string) ?? "-",
        emailAddress: (u?.emailAddress as string) ?? "-",
      };
    });

    // Start this session clean: every queued row goes back to "pending" so the
    // summary line does not read "Selesai" before anything has been sent, and
    // anything left over from a previous run is dropped. The table's Hasil Reset
    // column is the history of record for earlier attempts.
    resetRows = Object.fromEntries(
      targets.map((t) => [t.bsreUserId, { status: "pending" as const }]),
    );
    confirmBulkReset = true;
  }

  /**
   * Walk the ticked rows one at a time, calling the existing single-cert
   * remote per row.
   *
   * Deliberately sequential and in the browser rather than a server-side batch:
   * each reset mails a real reset link to a real account holder, so the operator
   * needs to watch progress row by row and see each message as it lands. A
   * server loop would return one blob at the very end and give them nothing to
   * look at while it ran.
   *
   * `for … of` with `await` in the body is the whole sequencing mechanism —
   * nothing is dispatched in parallel, so the portal sees one request at a time.
   */
  async function runBulkReset() {
    if (bulkResetting || !resetQueue.length) return;
    bulkResetting = true;

    // Work off the frozen queue, not `resetTargets`: this loop clears the
    // selection as it finishes, and a live read would shrink underfoot.
    // Rows already marked "ok" are skipped — that is the retry path, and
    // re-sending would mail a second reset link to the same person.
    const queue = resetQueue.filter(
      (t) => resetRows[t.bsreUserId]?.status !== "ok",
    );

    if (!queue.length) {
      bulkResetting = false;
      return;
    }

    // Show the whole pending plan up front rather than revealing rows one by
    // one, so the operator can see what is about to be sent.
    resetRows = {
      ...resetRows,
      ...Object.fromEntries(
        queue.map((t) => [t.bsreUserId, { status: "pending" as const }]),
      ),
    };

    try {
      for (const [index, target] of queue.entries()) {
        // Mark the current row before awaiting so the spinner is visible for
        // the whole duration of that one request, not just between them.
        resetRows = {
          ...resetRows,
          [target.bsreUserId]: { status: "running" },
        };

        try {
          const res = await resetCertPassphrase({
            userId,
            bsreUserId: target.bsreUserId,
            serialNumber: target.serialNumber,
          });

          resetRows = {
            ...resetRows,
            [target.bsreUserId]: {
              status: res?.success ? "ok" : "fail",
              message: res?.message ?? "",
            },
          };
        } catch (e: any) {
          // A thrown transport error must not abort the remaining rows — the
          // point of the sequence is that the operator can retry just the
          // failures afterwards.
          resetRows = {
            ...resetRows,
            [target.bsreUserId]: {
              status: "fail",
              message: e?.message ?? "Gagal menghubungi portal BSrE.",
            },
          };
        }

        // Small gap between portal calls. The portal is a government service
        // that throttles aggressively, and 14 back-to-back resets is enough to
        // trip it; the pause is what keeps the sequence from self-inflicting a
        // rate limit partway through.
        if (index < queue.length - 1) {
          await new Promise((r) => setTimeout(r, RESET_STEP_DELAY));
        }
      }
    } finally {
      bulkResetting = false;
    }

    // No toast here on purpose: the dialog stays open holding the per-row
    // results and is dismissed by hand. A timed toast would expire the only
    // place the operator can still read why a given certificate was refused.

    // Drop the rows that succeeded from the selection but keep the failures
    // ticked, so "Coba Lagi" re-runs only those instead of forcing a re-tick by
    // hand.
    selectedUsers = new SvelteSet(
      [...selectedUsers].filter((id) => resetRows[id]?.status !== "ok"),
    );
  }

  // Chart state
  let chartStartDate = $state("");
  let chartEndDate = $state("");
  let chartCollapsed = $state(false);
  let sessionCollapsed = $state(true);

  // Persist the chart panel's open/collapsed state.
  //
  // Split into two effects on purpose: the loader reads no reactive state, so it
  // runs exactly once on mount; the writer depends on `chartCollapsed`, so it
  // re-runs on real toggles. Folding both into one effect would either persist
  // the hard-coded default over a saved value, or never re-run after a click.
  //
  // `localStorage` is only touched inside `$effect`, which never runs during SSR,
  // and reading it during initialisation instead would desync the server-rendered
  // markup from the client's first paint.
  const CHART_COLLAPSED_KEY = "portal_bsre_chart_collapsed";

  /** The writer must not run until the loader has had its say. Both effects are
   *  queued on mount, and the writer tracks `chartCollapsed` — without this flag
   *  it would persist the in-progress default and overwrite the stored value the
   *  loader is one line away from adopting, so a collapsed chart would spring
   *  back open on every reload. */
  let chartPreferenceLoaded = $state(false);

  $effect(() => {
    try {
      const saved = localStorage.getItem(CHART_COLLAPSED_KEY);
      // Only adopt the stored value when a value was actually stored — a missing
      // key must leave the default (expanded) alone rather than collapse it.
      if (saved !== null) chartCollapsed = saved === "true";
    } catch {
      // Private mode / storage disabled — fall back to the in-memory default.
    } finally {
      chartPreferenceLoaded = true;
    }
  });

  $effect(() => {
    if (!chartPreferenceLoaded) return;
    try {
      localStorage.setItem(CHART_COLLAPSED_KEY, String(chartCollapsed));
    } catch {
      // Quota exceeded / storage disabled — the toggle still works for this visit.
    }
  });

  const ALL_USER_STATUSES = ["VERIFIED", "NEW", "UPDATE"];
  const ALL_CERT_STATUSES = ["ISSUE", "NEW", "REVOKE", "EXPIRED", "DENIED"];

  const stats = $derived(
    getBsreStats({
      ...((query.where as any)?.status
        ? { status: (query.where as any).status }
        : {}),
      ...((query.where as any)?.certificateStatus
        ? { certificateStatus: (query.where as any).certificateStatus }
        : {}),
      ...(chartStartDate ? { chartStartDate } : {}),
      ...(chartEndDate ? { chartEndDate } : {}),
    }),
  );
  const statsData = $derived(stats.current);

  const totalUsers = $derived(statsData?.total ?? 0);
  const chartData = $derived(statsData?.chartData ?? []);

  const userStatusChartData = $derived.by(() => {
    const counts = { ...((statsData as any)?.userStatusCounts ?? {}) };
    for (const s of ALL_USER_STATUSES) {
      if (!(s in counts)) counts[s] = 0;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([label, value]) => ({ label, value }));
  });

  const certStatusChartData = $derived.by(() => {
    const counts = { ...((statsData as any)?.certStatusCounts ?? {}) };
    for (const s of ALL_CERT_STATUSES) {
      if (!(s in counts)) counts[s] = 0;
    }
    return ALL_CERT_STATUSES.map((label) => ({ label, value: counts[label] }));
  });

  function statusBg(label: string) {
    const map: Record<string, string> = {
      Total: "bg-primary/10",
      VERIFIED: "bg-success/10",
      ACTIVE: "bg-info/10",
      INACTIVE: "bg-neutral/10",
      PENDING: "bg-warning/10",
      ISSUE: "bg-success/10",
      REVOKE: "bg-error/10",
      NEW: "bg-info/10",
      EXPIRED: "bg-warning/10",
      DENIED: "bg-neutral/10",
    };
    return map[label] ?? "bg-base-200/50";
  }

  function resetChartDate() {
    chartStartDate = "";
    chartEndDate = "";
  }

  function selectFilter(field: string, value: string) {
    const w = (query.where ??= {}) as Record<string, any>;
    if (field === "reset") {
      query.where = {};
    } else if (w[field] === value) {
      const next = { ...w };
      delete next[field];
      query.where = next;
    } else {
      query.where = { ...w, [field]: value };
    }
  }

  function latestCert(user: any) {
    const certs: any[] = user?.details?.data?.sertifikat ?? [];
    if (!certs.length) return null;
    return [...certs].sort(
      (a, b) =>
        new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime(),
    )[0];
  }

  function maskPii(
    value: string | null | undefined,
    type: "nik" | "nip" | "username" | "phone",
  ): string {
    if (!value) return "-";
    if (showPii) return value;
    if (type === "nik" || type === "nip") {
      const clean = value.replace(/\s/g, "");
      if (clean.length <= 4) return clean;
      return "••••••" + clean.slice(-4);
    }
    if (type === "phone") {
      const clean = value.replace(/\s/g, "");
      if (clean.length <= 4) return clean;
      return "••••••" + clean.slice(-4);
    }
    if (type === "username") {
      if (value.length <= 1) return value;
      return value[0] + "••••";
    }
    return value;
  }

  // Debug state
  let debugData = $state<any>(null);
  let debugLoading = $state(false);

  // Certificates of the user opened in the detail modal
  type UserCert = {
    id: string;
    status: string | null;
    product: string | null;
    serialNumber: string | null;
    notBeforeDate: string | null;
    notAfterDate: string | null;
    jenisSertifikat: string | null;
    canReset: boolean;
  };
  let userCerts = $state<UserCert[]>([]);
  let certsLoading = $state(false);
  let resettingSerial = $state<string | null>(null);
  let certsLoadedFor = $state<string | null>(null);

  // New certificate request
  let showNewCert = $state(false);
  let certProducts = $state<string[]>([
    "Tanda Tangan Elektronik",
    "Tanda Tangan Digital",
  ]);
  let newCertProduct = $state("Tanda Tangan Elektronik");
  let newCertCn = $state("");
  let newCertJenis = $state("INDIVIDU");
  let creatingCert = $state(false);
  let blockingSerial = $state<string | null>(null);

  // Fetch the certificate list whenever the detail modal opens on a new user
  $effect(() => {
    const id = selectedUser?.id;
    if (!id) {
      certsLoadedFor = null;
      return;
    }
    if (certsLoadedFor === id) return;
    certsLoadedFor = id;
    void loadUserCerts(id);
  });

  async function loadUserCerts(bsreUserId: string) {
    certsLoading = true;
    try {
      userCerts = await getBsreUserCerts({ userId, bsreUserId });
    } catch (e: any) {
      userCerts = [];
      app.showToast("error", e?.message ?? "Gagal memuat daftar sertifikat.");
    } finally {
      certsLoading = false;
    }
  }

  async function doResetPassphrase(cert: UserCert) {
    const bsreUserId = selectedUser?.id;
    // The portal endpoint takes the certificate serial number, not its UUID.
    if (!bsreUserId || !cert.serialNumber) return;
    resettingSerial = cert.serialNumber;
    try {
      const res = await resetCertPassphrase({
        userId,
        bsreUserId,
        serialNumber: cert.serialNumber,
      });
      if (res?.success) {
        // The portal's message is long ("Kirim link reset passphrase berhasil,
        // silakan cek email/handphone Anda") — give it longer than the 3s default.
        app.showToast("success", res.message ?? "Passphrase direset.", 7000);
      } else {
        app.showToast("error", res?.message ?? "Gagal reset passphrase.", 7000);
      }
    } catch (e: any) {
      app.showToast("error", e?.message ?? "Gagal reset passphrase.", 7000);
    } finally {
      resettingSerial = null;
    }
  }

  function openNewCertDialog() {
    blockingSerial = null;
    newCertCn = selectedUser?.nama ?? "";
    showNewCert = true;
  }

  async function doRequestCert() {
    const bsreUserId = selectedUser?.id;
    if (!bsreUserId || creatingCert) return;
    creatingCert = true;
    blockingSerial = null;
    try {
      const res = await requestEsignCert({
        userId,
        bsreUserId,
        cn: newCertCn,
        product: newCertProduct,
        jenisSertifikat: newCertJenis,
      });
      if (res?.success) {
        app.showToast("success", res.message ?? "Sertifikat dibuat.", 7000);
        showNewCert = false;
        if (bsreUserId) await loadUserCerts(bsreUserId);
      } else {
        blockingSerial = res?.blockingSerial ?? null;
        app.showToast(
          "error",
          res?.message ?? "Gagal membuat sertifikat.",
          7000,
        );
      }
    } catch (e: any) {
      app.showToast("error", e?.message ?? "Gagal membuat sertifikat.", 7000);
    } finally {
      creatingCert = false;
    }
  }

  // Reset offset when count changes (like users page)
  let lastCount = $state(0);
  $effect(() => {
    if (records.current && lastCount !== items.count) {
      query.offset = 0;
      lastCount = items.count;
    }
  });

  async function syncFromBsre() {
    if (syncing) return;
    syncing = true;
    try {
      const res = await fetchBsreUsers({ userId });
      if (res?.success) {
        app.showToast(
          "success",
          `Data BSrE tersinkronisasi (${res.total} pengguna).`,
        );
        records.refresh();
      } else {
        app.showToast("error", res?.message ?? "Gagal sinkronisasi.");
      }
    } catch (e: any) {
      app.showToast("error", e?.message ?? "Gagal sinkronisasi.");
    } finally {
      syncing = false;
    }
  }

  async function runDebug() {
    debugLoading = true;
    try {
      const res = await debugBsreSession({ userId });
      if (res?.success) {
        debugData = res;
        app.showToast("success", "Data debug berhasil diambil.");
      } else {
        app.showToast("error", res?.message ?? "Gagal mengambil data debug.");
      }
    } catch (e: any) {
      app.showToast("error", e?.message ?? "Gagal.");
    } finally {
      debugLoading = false;
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  async function launch() {
    const res = await launchBsre({ userId });
    if (res?.hasToken) tokenReady = true;
    if (res?.success)
      app.showToast("success", res.message ?? "Browser dibuka.");
    else app.showToast("error", "Gagal membuka browser.");
    status.refresh();
  }

  async function close() {
    const res = await closeBsre({ userId });
    if (res?.success) tokenReady = false;
    app.showToast("success", res?.message ?? "Sesi ditutup.");
    status.refresh();
  }

  async function navigate() {
    const res = await navigateBsre({ userId, url: customUrl });
    if (res?.success)
      app.showToast("success", res.message ?? "Navigasi berhasil.");
    else app.showToast("error", res?.message ?? "Gagal navigasi.");
    status.refresh();
  }
</script>

<div class="px-6 py-4 space-y-4 mx-auto flex flex-col h-[calc(100vh-4rem)]">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Portal BSrE
      </h1>
      <p class="text-sm opacity-60">Integrasi data dengan portal BSrE BSSN</p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <a
        href="https://portal-bsre.bssn.go.id/"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-sm btn-ghost gap-1"
      >
        <iconify-icon icon="bx:link-external" class="text-sm"></iconify-icon>
        Buka Portal
      </a>

      <button
        aria-label={chartCollapsed ? "Expand" : "Collapse"}
        class="btn btn-sm btn-ghost gap-1"
        onclick={() => (chartCollapsed = !chartCollapsed)}
      >
        <iconify-icon icon="bx:chart"></iconify-icon>
        Grafik
      </button>

      <button
        aria-label={sessionCollapsed ? "Expand" : "Collapse"}
        class="btn btn-sm btn-ghost gap-1"
        onclick={() => (sessionCollapsed = !sessionCollapsed)}
      >
        <iconify-icon icon="bx:cog"></iconify-icon>
        Konfig
      </button>
    </div>
  </div>

  <!-- Charts -->
  {#if !chartCollapsed}
    <div
      class="bg-base-100/40 border border-base-200/60 rounded-2xl shadow-sm backdrop-blur transition-all duration-500 {chartCollapsed
        ? 'max-h-0 overflow-hidden p-0'
        : 'p-3'}"
    >
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 relative">
          <div class="absolute z-1 px-5 py-2">
            <div class="flex items-center gap-3">
              <span class="text-lg">Status Sertifikat</span>

              {#if status.current?.lastSync}
                <div
                  class="flex gap-1 items-center mt-1 text-[10px] font-bold opacity-40"
                >
                  <iconify-icon icon="bx:time-five"></iconify-icon>
                  Sync: {d(status.current.lastSync).format(
                    "DD MMM YYYY, HH:mm",
                  )}
                </div>
              {/if}
            </div>
          </div>
          <Chart
            subtitle=""
            data={chartData}
            height={250}
            type="line"
            categories={[
              {
                key: "start",
                color: "var(--color-success)",
                label: "Sertifikat Mulai",
              },
              {
                key: "end",
                color: "var(--color-error)",
                label: "Sertifikat Berakhir",
              },
            ]}
          />
        </div>
        <div class="flex flex-col gap-3">
          <div>
            <div class="flex flex-wrap items-end gap-2 mb-2">
              <label class="form-control">
                <span
                  class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black"
                  >Dari</span
                >
                <input
                  type="date"
                  class="input input-bordered input-xs w-28"
                  bind:value={chartStartDate}
                />
              </label>
              <label class="form-control">
                <span
                  class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black"
                  >Sampai</span
                >
                <input
                  type="date"
                  class="input input-bordered input-xs w-28"
                  bind:value={chartEndDate}
                />
              </label>
              <button class="btn btn-ghost btn-xs" onclick={resetChartDate}
                >Reset</button
              >
            </div>
            <span
              class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black block mb-1"
              >Status User</span
            >
            <div class="grid grid-cols-3 gap-1.5">
              <div
                class="rounded-lg px-2 py-0 text-center cursor-pointer hover:ring-2 hover:ring-base-content/30 transition-all {statusBg(
                  'Total',
                )} {!query.where?.status && !query.where?.certificateStatus
                  ? 'ring-2 ring-primary/60'
                  : ''}"
                onclick={() => selectFilter("reset", "")}
                onkeydown={(e) =>
                  e.key === "Enter" && selectFilter("reset", "")}
                role="button"
                tabindex="0"
              >
                <div class="text-sm font-black font-mono tracking-tighter">
                  {totalUsers}
                </div>
                <div
                  class="text-[9px] font-bold opacity-50 uppercase tracking-wider"
                >
                  Total
                </div>
              </div>
              {#each userStatusChartData as d}
                <div
                  class="rounded-lg px-2 py-0 text-center cursor-pointer hover:ring-2 hover:ring-base-content/30 transition-all {statusBg(
                    d.label,
                  )} {query.where?.status === d.label
                    ? 'ring-2 ring-primary/60'
                    : ''}"
                  onclick={() => selectFilter("status", d.label)}
                  onkeydown={(e) =>
                    e.key === "Enter" && selectFilter("status", d.label)}
                  role="button"
                  tabindex="0"
                >
                  <div class="text-sm font-black font-mono tracking-tighter">
                    {d.value}
                  </div>
                  <div
                    class="text-[9px] font-bold opacity-50 uppercase tracking-wider truncate"
                  >
                    {d.label}
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <div>
            <div>
              <span
                class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black block mb-1"
                >Status Sertifikat</span
              >
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              {#each certStatusChartData as d}
                <div
                  class="rounded-lg px-2 py-0 text-center cursor-pointer hover:ring-2 hover:ring-base-content/30 transition-all {statusBg(
                    d.label,
                  )} {query.where?.certificateStatus === d.label
                    ? 'ring-2 ring-primary/60'
                    : ''}"
                  onclick={() => selectFilter("certificateStatus", d.label)}
                  onkeydown={(e) =>
                    e.key === "Enter" &&
                    selectFilter("certificateStatus", d.label)}
                  role="button"
                  tabindex="0"
                >
                  <div class="text-sm font-black font-mono tracking-tighter">
                    {d.value}
                  </div>
                  <div
                    class="text-[9px] font-bold opacity-50 uppercase tracking-wider truncate"
                  >
                    {d.label}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Session Status -->
  {#if !sessionCollapsed}
    <div
      class="bg-base-100/40 border border-base-200/60 rounded-2xl py-1 px-4 shadow-sm backdrop-blur transition-all duration-500"
    >
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 ml-2">
          <div
            class="badge badge-sm {status.current?.active
              ? 'badge-success'
              : 'badge-neutral'} gap-1"
          >
            <iconify-icon
              icon={status.current?.active
                ? "bx:radio-circle-marked"
                : "bx:radio-circle"}
            ></iconify-icon>
            {status.current?.active ? "Sesi Aktif" : "Sesi Tidak Aktif"}
          </div>
          <div
            class="badge badge-sm {status.current?.hasToken
              ? 'badge-info'
              : 'badge-ghost'} gap-1"
          >
            <iconify-icon icon={status.current?.hasToken ? "bx:key" : "bx:lock"}
            ></iconify-icon>
            {status.current?.hasToken ? "Token OK" : "No Token"}
          </div>
          {#if status.current?.active && status.current.mode?.startsWith("remote")}
            <span class="text-xs opacity-60">🌐 Remote</span>
          {/if}
        </div>
        <div class="flex gap-2 ml-auto">
          <button
            class="btn btn-sm btn-primary gap-1"
            onclick={syncFromBsre}
            disabled={(!status.current?.active &&
              !status.current?.hasToken &&
              !tokenReady) ||
              syncing}
          >
            {#if syncing}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:sync"></iconify-icon>
            {/if}
            Sync
          </button>
          <button
            class="btn btn-sm btn-accent gap-1"
            onclick={async () => {
              const res = await syncCertDates({});
              if (res?.success) {
                app.showToast(
                  "success",
                  `Sertifikat diperbarui (${res.updated}/${res.total}).`,
                );
                records.refresh();
              }
            }}
            disabled={!!syncCertDates.pending}
          >
            {#if syncCertDates.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:calendar-check"></iconify-icon>
            {/if}
            Update Tanggal
          </button>
          <button class="btn btn-primary btn-sm gap-1" onclick={launch}>
            {#if launchBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:key"></iconify-icon>
            {/if}
            Update Token
          </button>
          <button
            class="btn btn-warning btn-sm gap-1"
            onclick={runDebug}
            disabled={!status.current?.active}
          >
            {#if debugLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:bug"></iconify-icon>
            {/if}
            Debug
          </button>
          <button
            class="btn btn-error btn-outline btn-sm gap-1"
            onclick={close}
            disabled={!status.current?.active}
          >
            {#if closeBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:stop"></iconify-icon>
            {/if}
            Tutup
          </button>
        </div>
      </div>

      {#if debugData}
        <div class="border-t border-base-content/10 mt-2 pt-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-semibold opacity-60"
              >Info Debug Sesi</span
            >
            <button
              class="btn btn-ghost btn-xs"
              onclick={() => (debugData = null)}>Tutup</button
            >
          </div>
          <pre
            class="bg-base-200/80 p-2 rounded text-[10px] overflow-auto max-h-40">{JSON.stringify(
              debugData,
              null,
              2,
            )}</pre>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Users Table -->
  <div
    class="bg-base-100/40 border border-base-200/60 rounded-2xl p-3 shadow-sm backdrop-blur space-y-0 flex-1 min-h-0 flex flex-col"
  >
    <Toolbar bind:query {records}>
      {#snippet filter(where)}
        <label class="floating-label mt-3">
          <span>NIK</span>
          <div class="input input-sm">
            <input bind:value={where.nik} placeholder="NIK" />
          </div>
        </label>
        <label class="floating-label mt-3">
          <span>NIP</span>
          <div class="input input-sm">
            <input bind:value={where.nip} placeholder="NIP" />
          </div>
        </label>
        <div class="relative mt-3">
          <label class="floating-label" for="filter-bulk-email">
            <span>Email (dapat lebih dari satu, satu email per baris)</span>
            <!-- Uncontrolled on purpose: a controlled `value` round-tripped through
                 `parseBulkEmails` would strip the trailing newline, making it
                 impossible to press Enter. The draft lives in the DOM; `where`
                 (the modal's own copy) is still what gets committed on submit. -->
            <textarea
              id="filter-bulk-email"
              class="textarea textarea-sm w-full"
              rows="4"
              spellcheck="false"
              placeholder="nama@mojokertokota.go.id"
              value={bulkEmailVal(where)}
              oninput={(e) => setBulkEmails(where, e.currentTarget.value)}
            ></textarea>
          </label>
          <!-- Sibling of the label, not a child: `.floating-label > span` is
               absolutely positioned, so a badge inside would be dragged out of
               the field and overlap the floated label text. -->
          {#if bulkEmailCount(where)}
            <span
              class="badge badge-info badge-xs absolute top-1.5 right-1.5 z-1 pointer-events-none"
            >
              {bulkEmailCount(where)}
            </span>
          {/if}
        </div>
        <label class="floating-label mt-3">
          <span>Nama</span>
          <div class="input input-sm">
            <input bind:value={where.nama} placeholder="Nama" />
          </div>
        </label>

        <div class="">
          <span class="label-text text-[10px]">Sertifikat Mulai</span>
          <div class="flex gap-1 items-center">
            <input
              type="date"
              class="input input-sm input-bordered text-xs w-full"
              value={certRangeVal(where, "certStart", "from")}
              oninput={(e) =>
                setCertRange(where, "certStart", "from", e.currentTarget.value)}
            />
            <span class="text-[10px] opacity-40">–</span>
            <input
              type="date"
              class="input input-sm input-bordered text-xs w-full"
              value={certRangeVal(where, "certStart", "to")}
              oninput={(e) =>
                setCertRange(where, "certStart", "to", e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="">
          <span class="label-text text-[10px]">Sertifikat Berakhir</span>
          <div class="flex gap-1 items-center">
            <input
              type="date"
              class="input input-sm input-bordered text-xs w-full"
              value={certRangeVal(where, "certEnd", "from")}
              oninput={(e) =>
                setCertRange(where, "certEnd", "from", e.currentTarget.value)}
            />
            <span class="text-[10px] opacity-40">–</span>
            <input
              type="date"
              class="input input-sm input-bordered text-xs w-full"
              value={certRangeVal(where, "certEnd", "to")}
              oninput={(e) =>
                setCertRange(where, "certEnd", "to", e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="">
          <label class="label" for="filter-user-status">
            <span class="text-[10px]">Status User</span>
          </label>
          <div class="flex flex-wrap gap-1">
            {#each ALL_USER_STATUSES as s}
              <button
                type="button"
                class="btn btn-xs {where.status === s
                  ? 'btn-primary'
                  : 'btn-soft'}"
                onclick={() =>
                  (where.status = where.status === s ? undefined : s)}
              >
                {s}
              </button>
            {/each}
          </div>
        </div>
        <div class="form-control w-full max-w-xs">
          <label class="label" for="filter-cert-status">
            <span class="text-[10px]">Status Sertifikat</span>
          </label>
          <div class="flex flex-wrap gap-1">
            {#each ALL_CERT_STATUSES as s}
              <button
                type="button"
                class="btn btn-xs {where.certificateStatus === s
                  ? 'btn-primary'
                  : 'btn-soft'}"
                onclick={() =>
                  (where.certificateStatus =
                    where.certificateStatus === s ? undefined : s)}
              >
                {s}
              </button>
            {/each}
          </div>
        </div>
      {/snippet}
      {#snippet actions()}
        <li>
          <button onclick={() => (showPii = !showPii)}>
            <iconify-icon icon={showPii ? "bx:show" : "bx:hide"}></iconify-icon>
            {showPii ? "Tampilkan PII" : "Masking PII"}
          </button>
        </li>
      {/snippet}
      {#snippet trail()}
        <!-- Strictly tied to the selection. Previously it also stayed visible
             while `resetDoneCount` was non-zero, but a finished run unticks its
             successes, so that left a dead "Reset 0 Passphrase" button on screen
             after the dialog closed. With nothing ticked there is nothing to
             reset, so the button goes too; the run's results stay readable in
             the table's Hasil Reset column. -->
        {#if selectedUsers.size}
          <button
            class="btn btn-sm btn-error btn-outline gap-1"
            disabled={!resetTargets.length || bulkResetting}
            onclick={openResetDialog}
          >
            <iconify-icon icon="bx:lock-open"></iconify-icon>
            Reset Passphrase
            <span class="badge badge-error badge-sm font-bold"
              >{resetTargets.length}</span
            >
          </button>
        {/if}
        <!-- Progress lives outside the dialog because the dialog is dismissed
             to read the table, and the run may outlive it. Counts against the
             frozen queue: `resetTargets` follows the selection, which a run
             empties as it succeeds, so it would bottom out at "1/0". -->
        {#if bulkResetting}
          <span class="text-xs opacity-60 flex items-center gap-1.5">
            <span class="loading loading-spinner loading-xs"></span>
            {resetDoneCount}/{resetQueueTotal}
          </span>
        {/if}
      {/snippet}
    </Toolbar>

    <div
      class="overflow-x-auto border border-base-300/60 rounded-xl bg-base-100/50 backdrop-blur-md flex-1 min-h-0 relative shadow-inner"
    >
      <table class="table table-xs table-pin-rows table-pin-cols">
        <thead class="z-30">
          <tr
            class="bg-base-200 text-base-content/80 font-bold border-b border-base-300"
          >
            <th class="w-10 text-center bg-base-200 sticky left-0 z-20 py-2"
              >#</th
            >
            <th class="w-8 text-center bg-base-200 py-2">
              <input
                type="checkbox"
                class="checkbox checkbox-xs"
                checked={allPageSelected}
                disabled={!pageResettable.length || bulkResetting}
                onchange={togglePageSelection}
                aria-label="Pilih semua di halaman ini"
              />
            </th>
            <th class="min-w-[180px] bg-base-200 sticky left-10 z-20">Nama</th>
            <th class="w-56 bg-base-200">Email</th>
            <th class="w-36 bg-base-200">NIK</th>
            <th class="w-36 bg-base-200">NIP</th>
            <th class="w-24 text-center bg-base-200">Sertifikat</th>
            <th class="w-28 bg-base-200">Mulai</th>
            <th class="w-28 bg-base-200">Berakhir</th>
            <th class="w-48 bg-base-200">Jabatan</th>
            <th class="w-28 text-center bg-base-200">Status</th>
            <!-- Placed before "Aksi" so the action column stays last and keeps
                 its `sticky right-0` edge without a sticky column in between. -->
            <th class="w-64 bg-base-200">Hasil Reset</th>
            <th class="w-20 text-center bg-base-200">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading && !items.data.length}
            <tr>
              <td colspan="13" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"
                  ></span>
                  <span class="text-sm opacity-55 font-medium"
                    >Memuat data pengguna BSrE...</span
                  >
                </div>
              </td>
            </tr>
          {:else if !status.current?.active && !status.current?.hasToken && !items.data.length}
            <tr>
              <td colspan="13" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-2 opacity-50"
                >
                  <iconify-icon icon="bx:globe" class="text-3xl"></iconify-icon>
                  <p class="text-sm font-medium">
                    Buka sesi BSrE terlebih dahulu
                  </p>
                  <p class="text-xs">
                    Pastikan token tersimpan untuk memuat data pengguna.
                  </p>
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="13" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-3 text-error"
                >
                  <iconify-icon icon="bx:error-circle" class="text-3xl"
                  ></iconify-icon>
                  <div class="text-sm font-semibold">
                    {records.error.message}
                  </div>
                  <button
                    class="btn btn-sm btn-error btn-outline"
                    onclick={() => records.refresh()}
                  >
                    Coba Lagi
                  </button>
                </div>
              </td>
            </tr>
          {:else if !items.data.length}
            <tr>
              <td colspan="13" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-2 opacity-40"
                >
                  <iconify-icon icon="bx:group" class="text-3xl"></iconify-icon>
                  <span class="text-sm font-medium"
                    >Belum ada data. Klik "Sync" untuk mengambil data dari BSrE.</span
                  >
                </div>
              </td>
            </tr>
          {:else}
            {#each items.data as user, i}
              {#if user}
                {@const cert = resettableCert(user)}
                {@const rowState = resetRows[user.id]?.status}
                {@const rowMessage = resetRows[user.id]?.message ?? ""}
                <tr class="hover:bg-base-200/30 transition-colors">
                  <td
                    class="text-center text-xs opacity-60 bg-base-100 sticky left-0 z-1"
                    >{query.offset + i + 1}</td
                  >
                  <td class="text-center">
                    <!-- Rows with nothing resettable are shown disabled rather
                         than hidden, so the count in the toolbar always equals
                         the number of checkboxes an operator can actually tick. -->
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      checked={selectedUsers.has(user.id)}
                      disabled={!cert || bulkResetting}
                      onchange={() => toggleUser(user.id)}
                      aria-label="Pilih {user?.nama ?? user?.id}"
                    />
                  </td>
                  <td class="font-semibold bg-base-100 sticky left-10 z-1"
                    >{user?.nama ?? "-"}</td
                  >
                  <td class="text-xs">{user?.emailAddress ?? "-"}</td>
                  <td class="text-xs font-mono"
                    >{maskPii(user?.nik ?? "-", "nik")}</td
                  >
                  <td class="text-xs font-mono"
                    >{maskPii(user?.nip ?? "-", "nip")}</td
                  >
                  <td class="text-center">
                    <span
                      class="badge badge-sm {latestCert(user)?.status ===
                      'ISSUE'
                        ? 'badge-success'
                        : latestCert(user)?.status === 'REVOKE'
                          ? 'badge-error'
                          : 'badge-ghost'} font-semibold"
                    >
                      {latestCert(user)?.status ?? "-"}
                    </span>
                  </td>
                  <td class="text-xs"
                    >{latestCert(user)?.notBeforeDate?.split(" ")[0] ?? "-"}</td
                  >
                  <td class="text-xs"
                    >{latestCert(user)?.notAfterDate?.split(" ")[0] ?? "-"}</td
                  >
                  <td class="text-xs">{user?.jabatanOrganisasi ?? "-"}</td>
                  <td class="text-center">
                    <span
                      class="badge badge-sm {user?.status === 'VERIFIED' ||
                      (user?.status as string) === 'ACTIVE' ||
                      user?.aktif
                        ? 'badge-success'
                        : 'badge-ghost'} font-semibold"
                    >
                      {user?.status ||
                        (user?.aktif ? "Aktif" : "Nonaktif") ||
                        "-"}
                    </span>
                  </td>
                  <td class="text-xs">
                    <!-- Empty until this row enters the current run, so an idle
                         table isn't littered with placeholder icons. -->
                    {#if rowState === "running"}
                      <div class="flex items-center gap-2">
                        <span
                          class="loading loading-spinner loading-xs text-primary shrink-0"
                        ></span>
                        <span class="opacity-60">Mengirim…</span>
                      </div>
                    {:else if rowState === "pending"}
                      <span class="opacity-40">Menunggu…</span>
                    {:else if rowState === "ok"}
                      <div
                        class="flex items-start gap-1.5 text-success"
                        title={rowMessage}
                      >
                        <iconify-icon
                          icon="bx:check-circle"
                          class="shrink-0 mt-0.5"
                        ></iconify-icon>
                        <span class="line-clamp-2">{rowMessage}</span>
                      </div>
                    {:else if rowState === "fail"}
                      <div
                        class="flex items-start gap-1.5 text-error"
                        title={rowMessage}
                      >
                        <iconify-icon
                          icon="bx:error-circle"
                          class="shrink-0 mt-0.5"
                        ></iconify-icon>
                        <span class="line-clamp-2">{rowMessage}</span>
                      </div>
                    {:else}
                      <span class="opacity-25">—</span>
                    {/if}
                  </td>
                  <td class="text-center sticky right-0 z-1 bg-base-100">
                    <div class="flex items-center justify-center gap-1">
                      <button
                        class="btn btn-sm btn-circle btn-ghost text-primary hover:bg-primary/10 tooltip tooltip-left"
                        data-tip="Lihat Detail"
                        aria-label="Lihat Detail"
                        onclick={(e) => {
                          e.stopPropagation();
                          selectedUser = user;
                        }}
                      >
                        <iconify-icon icon="bx:show" class="text-base"
                        ></iconify-icon>
                      </button>
                      {#if user?.id}
                        <a
                          href="https://portal-bsre.bssn.go.id/app/users/{user.id}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="btn btn-sm btn-circle btn-ghost text-accent hover:bg-accent/10 tooltip tooltip-left"
                          data-tip="Buka Profil BSrE"
                          aria-label="Buka Profil BSrE"
                          onclick={(e) => e.stopPropagation()}
                        >
                          <iconify-icon
                            icon="bx:link-external"
                            class="text-base"
                          ></iconify-icon>
                        </a>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Bulk reset confirmation -->
  <!--
    Reset passphrase: confirm, then live progress.
    Stays open for the whole run and is closed by hand afterwards. Nothing here
    is on a timer — each row's portal message is often the only record of *why*
    a certificate was refused, so it has to survive until the operator has read
    it.
  -->
  <Modal bind:data={confirmBulkReset} title="Reset Passphrase Massal" size="lg">
    <p class="text-sm">
      {#if bulkResetting}
        Memproses <span class="font-bold">{resetDoneCount}</span> dari
        <span class="font-bold">{resetQueueTotal}</span> sertifikat, satu per satu.
        Portal BSrE mengirim tautan reset ke email/handphone pemilik sertifikat masing-masing.
      {:else if resetDoneCount}
        Selesai.
        <span class="text-success font-bold">{resetOkCount} berhasil</span
        >{#if resetFailCount},
          <span class="text-error font-bold">{resetFailCount} gagal</span>{/if}.
        Tutup jendela ini setelah membaca hasilnya.
      {:else}
        Akan mengirim permintaan reset passphrase ke
        <span class="font-bold">{resetQueueTotal}</span> sertifikat, satu per satu
        secara berurutan. Portal BSrE akan mengirim tautan reset ke email/handphone
        pemilik sertifikat masing-masing.
      {/if}
    </p>

    <div class="max-h-64 overflow-y-auto mt-3 space-y-1">
      {#each resetQueue as t}
        {@const st = resetRows[t.bsreUserId]?.status}
        {@const msg = resetRows[t.bsreUserId]?.message ?? ""}
        <div
          class="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 {st ===
          'fail'
            ? 'bg-error/10'
            : st === 'ok'
              ? 'bg-success/10'
              : st === 'running'
                ? 'bg-primary/10'
                : ''}"
        >
          {#if st === "running"}
            <span
              class="loading loading-spinner loading-xs text-primary shrink-0"
            ></span>
          {:else if st === "ok"}
            <iconify-icon icon="bx:check-circle" class="text-success shrink-0"
            ></iconify-icon>
          {:else if st === "fail"}
            <iconify-icon icon="bx:error-circle" class="text-error shrink-0"
            ></iconify-icon>
          {:else}
            <iconify-icon icon="bx:time" class="opacity-25 shrink-0"
            ></iconify-icon>
          {/if}
          <span class="font-semibold truncate shrink-0 max-w-40">{t.nama}</span>
          <span class="opacity-50 truncate shrink-0 max-w-52 hidden md:inline"
            >{t.emailAddress}</span
          >
          <!-- The portal's own message, or a placeholder while the row is
               still queued. Sits after name and email so the three read left
               to right in the order the operator scans them. -->
          <span
            class="truncate flex-1 {st === 'fail'
              ? 'text-error'
              : st === 'ok'
                ? 'text-success'
                : 'opacity-40'}"
            >{msg ||
              (st === "running"
                ? "Mengirim…"
                : st === "ok"
                  ? "Berhasil"
                  : "Menunggu…")}</span
          >
        </div>
      {/each}
    </div>

    {#snippet action()}
      <button
        class="btn btn-sm btn-error"
        disabled={bulkResetting || resetPendingCount === 0}
        onclick={runBulkReset}
      >
        {#if bulkResetting}
          <span class="loading loading-spinner loading-xs"></span>
          Memproses {resetDoneCount}/{resetQueueTotal}…
        {:else if resetFailCount}
          <iconify-icon icon="bx:reset"></iconify-icon>
          Coba Lagi {resetFailCount}
        {:else}
          <iconify-icon icon="bx:lock-open"></iconify-icon>
          Reset {resetQueueTotal} Passphrase
        {/if}
      </button>
      <button
        class="btn btn-sm btn-ghost"
        disabled={bulkResetting}
        onclick={() => (confirmBulkReset = false)}
      >
        {resetDoneCount ? "Tutup" : "Batal"}
      </button>
    {/snippet}
  </Modal>

  <!-- User Detail Modal -->
  {#if selectedUser}
    <div use:portal>
      <dialog class="modal modal-open">
        <div
          class="modal-box max-w-2xl bg-base-100 border border-base-content/10 shadow-2xl rounded-2xl"
        >
          <div
            class="flex items-center justify-between border-b border-base-content/10 pb-3 mb-4"
          >
            <div class="flex items-center gap-3">
              <div class="avatar placeholder">
                <div class="bg-primary text-primary-content rounded-full w-10">
                  <span class="text-sm font-semibold"
                    >{selectedUser.nama?.charAt(0) || "U"}</span
                  >
                </div>
              </div>
              <div>
                <h3 class="font-bold text-lg">{selectedUser.nama ?? "-"}</h3>
                <p class="text-xs opacity-60 font-mono">
                  {selectedUser.id ?? "-"}
                </p>
              </div>
            </div>
            <button
              class="btn btn-ghost btn-circle btn-sm"
              onclick={() => (selectedUser = null)}>✕</button
            >
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <!-- Personal Info Card -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:user"></iconify-icon> Informasi Personal
              </h4>
              <div class="space-y-2">
                <div>
                  <span class="text-xs opacity-60">NIK</span>
                  <p class="font-semibold font-mono">
                    {maskPii(selectedUser.nik ?? "-", "nik")}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">NIP</span>
                  <p class="font-semibold font-mono">
                    {maskPii(selectedUser.nip ?? "-", "nip")}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Email</span>
                  <p class="font-semibold select-all">
                    {selectedUser.emailAddress ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Nomor HP</span>
                  <p class="font-semibold">
                    {maskPii(
                      selectedUser.phone || selectedUser.no_wa || "-",
                      "phone",
                    )}
                  </p>
                </div>
              </div>
            </div>

            <!-- Job Info Card -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:briefcase"></iconify-icon> Jabatan & Organisasi
              </h4>
              <div class="space-y-2">
                <div>
                  <span class="text-xs opacity-60">Jabatan</span>
                  <p class="font-semibold">
                    {selectedUser.jabatanOrganisasi ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Unit Kerja</span>
                  <p class="font-semibold">
                    {selectedUser.organisasiUnit ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Organisasi</span>
                  <p class="font-semibold">{selectedUser.organisasi ?? "-"}</p>
                </div>
              </div>
            </div>

            <!-- Certificate & Products -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5 md:col-span-2"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:certification"></iconify-icon> Sertifikat
                & Layanan
              </h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <span class="text-xs opacity-60">Status Sertifikat</span>
                  <div>
                    <span
                      class="badge {selectedUser.certificateStatus === 'ISSUE'
                        ? 'badge-success'
                        : 'badge-warning'} font-semibold badge-sm mt-1"
                    >
                      {selectedUser.certificateStatus ?? "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <span class="text-xs opacity-60">Layanan Produk</span>
                  <p class="font-semibold text-xs mt-1">
                    {selectedUser.products ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Tanggal Pendaftaran</span>
                  <p class="font-semibold">{selectedUser.createdDate ?? "-"}</p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Asal Registrasi</span>
                  <p class="font-semibold font-mono">
                    {selectedUser.registeredOrigin ?? "-"}
                  </p>
                </div>
              </div>

              <div class="border-t border-base-content/10 pt-3">
                <div class="flex items-center justify-between mb-2 gap-2">
                  <span class="text-xs opacity-60 uppercase font-bold"
                    >Daftar Sertifikat</span
                  >
                  <div class="flex items-center gap-1">
                    <button
                      class="btn btn-primary btn-xs gap-1"
                      onclick={openNewCertDialog}
                      disabled={!selectedUser?.id || creatingCert}
                    >
                      <iconify-icon icon="bx:plus"></iconify-icon>
                      Sertifikat
                    </button>
                    <button
                      class="btn btn-ghost btn-xs gap-1"
                      onclick={() =>
                        selectedUser?.id && loadUserCerts(selectedUser.id)}
                      disabled={certsLoading}
                    >
                      {#if certsLoading}
                        <span class="loading loading-spinner loading-xs"></span>
                      {:else}
                        <iconify-icon icon="bx:sync"></iconify-icon>
                      {/if}
                      Muat Ulang
                    </button>
                  </div>
                </div>

                {#if certsLoading && !userCerts.length}
                  <div class="flex items-center justify-center gap-2 py-6">
                    <span
                      class="loading loading-spinner loading-sm text-primary"
                    ></span>
                    <span class="text-xs opacity-60">Memuat sertifikat...</span>
                  </div>
                {:else if !userCerts.length}
                  <div
                    class="text-center py-6 text-xs opacity-40 border border-dashed border-base-content/15 rounded-lg"
                  >
                    Tidak ada sertifikat untuk pengguna ini.
                  </div>
                {:else}
                  <div class="space-y-2">
                    {#each userCerts as cert (cert.id || cert.serialNumber)}
                      <div
                        class="bg-base-100 p-3 rounded-lg border border-base-content/5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <span
                              class="badge badge-sm {cert.status === 'ISSUE'
                                ? 'badge-success'
                                : cert.status === 'REVOKE'
                                  ? 'badge-error'
                                  : 'badge-warning'}"
                            >
                              {cert.status ?? "-"}
                            </span>
                            <span class="text-xs font-semibold"
                              >{cert.product ?? "-"}</span
                            >
                          </div>
                          <div
                            class="flex items-center gap-3 text-[11px] opacity-70 mt-1 flex-wrap"
                          >
                            <span
                              >Berlaku: {cert.notBeforeDate ?? "?"} — {cert.notAfterDate ??
                                "?"}</span
                            >
                            <span>SN: {cert.serialNumber ?? "-"}</span>
                            {#if cert.jenisSertifikat}
                              <span class="badge badge-ghost badge-xs"
                                >{cert.jenisSertifikat}</span
                              >
                            {/if}
                          </div>
                        </div>
                        <div class="shrink-0">
                          {#if cert.canReset}
                            <button
                              class="btn btn-xs btn-warning gap-1"
                              onclick={() => doResetPassphrase(cert)}
                              disabled={resettingSerial === cert.serialNumber}
                            >
                              {#if resettingSerial === cert.serialNumber}
                                <span class="loading loading-spinner loading-xs"
                                ></span>
                              {:else}
                                <iconify-icon icon="bx:key"></iconify-icon>
                              {/if}
                              Reset Passphrase
                            </button>
                          {:else}
                            <span class="text-[10px] opacity-40 italic"
                              >Tidak dapat direset</span
                            >
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Status Verifikasi -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5 md:col-span-2"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:check-shield"></iconify-icon> Status Verifikasi
              </h4>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">Dukcapil</span>
                  <span
                    class="badge badge-sm {selectedUser.verifiedDukcapil
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.verifiedDukcapil
                      ? "✓ Terverifikasi"
                      : "✗ Belum"}
                  </span>
                </div>
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">Liveness</span>
                  <span
                    class="badge badge-sm {selectedUser.verfifiedLiveness
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.verfifiedLiveness
                      ? "✓ Terverifikasi"
                      : "✗ Belum"}
                  </span>
                </div>
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">WhatsApp</span>
                  <span
                    class="badge badge-sm {selectedUser.phoneVerified
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.phoneVerified ? "✓ Terverifikasi" : "✗ Belum"}
                  </span>
                </div>
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">Verifikator</span>
                  <span
                    class="badge badge-sm {selectedUser.verifiedVerifikator
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.verifiedVerifikator
                      ? "✓ Terverifikasi"
                      : "✗ Belum"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-action mt-6">
            <button
              class="btn btn-neutral btn-sm"
              onclick={() => (selectedUser = null)}>Tutup</button
            >
          </div>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="modal-backdrop bg-black/40 backdrop-blur-xs"
          role="button"
          tabindex="0"
          onclick={() => (selectedUser = null)}
          onkeydown={(e) => e.key === "Enter" && (selectedUser = null)}
        ></div>
      </dialog>
    </div>
  {/if}

  <!-- New Certificate Dialog -->
  {#if showNewCert}
    <div use:portal>
      <dialog class="modal modal-open">
        <div
          class="modal-box max-w-md bg-base-100 border border-base-content/10 shadow-2xl rounded-2xl"
        >
          <div
            class="flex items-center justify-between border-b border-base-content/10 pb-3 mb-4"
          >
            <h3 class="font-bold text-lg">Buat Sertifikat Baru</h3>
            <button
              class="btn btn-ghost btn-circle btn-sm"
              onclick={() => (showNewCert = false)}>✕</button
            >
          </div>

          <div class="space-y-3 text-sm">
            <div>
              <label class="text-xs opacity-60" for="cert-cn"
                >Common Name (CN)</label
              >
              <input
                id="cert-cn"
                type="text"
                class="input input-bordered input-sm w-full mt-1"
                bind:value={newCertCn}
                placeholder="Nama lengkap pemilik sertifikat"
              />
            </div>

            <div>
              <label class="text-xs opacity-60" for="cert-product">Produk</label
              >
              <select
                id="cert-product"
                class="select select-bordered select-sm w-full mt-1"
                bind:value={newCertProduct}
              >
                {#each certProducts as p (p)}
                  <option value={p}>{p}</option>
                {/each}
              </select>
            </div>

            <div>
              <label class="text-xs opacity-60" for="cert-jenis"
                >Jenis Sertifikat</label
              >
              <select
                id="cert-jenis"
                class="select select-bordered select-sm w-full mt-1"
                bind:value={newCertJenis}
              >
                <option value="INDIVIDU">INDIVIDU</option>
                <option value="INSTANSI">INSTANSI</option>
              </select>
            </div>

            {#if blockingSerial}
              <div class="alert alert-error text-xs">
                <iconify-icon icon="bx:error"></iconify-icon>
                <span>
                  Sudah ada sertifikat aktif dengan SN
                  <span class="font-semibold break-all">{blockingSerial}</span>.
                  Batalkan atau cabut sertifikat tersebut sebelum membuat yang
                  baru.
                </span>
              </div>
            {/if}
          </div>

          <div class="modal-action mt-6">
            <button
              class="btn btn-neutral btn-sm"
              onclick={() => (showNewCert = false)}
              disabled={creatingCert}>Batal</button
            >
            <button
              class="btn btn-primary btn-sm gap-1"
              onclick={doRequestCert}
              disabled={creatingCert || !newCertCn.trim()}
            >
              {#if creatingCert}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <iconify-icon icon="bx:plus"></iconify-icon>
              {/if}
              Buat Sertifikat
            </button>
          </div>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="modal-backdrop bg-black/40 backdrop-blur-xs"
          role="button"
          tabindex="0"
          onclick={() => (showNewCert = false)}
          onkeydown={(e) => e.key === "Enter" && (showNewCert = false)}
        ></div>
      </dialog>
    </div>
  {/if}
</div>
