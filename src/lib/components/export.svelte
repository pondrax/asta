<script
  lang="ts"
  generics="T extends {
    current?: { data: any[]; count: number; time: string };
    refresh: () => void;
    loading: boolean
  }"
>
  import { d } from "$lib/utils";
  import { getData } from "$lib/remotes/api.remote";

  type Item = NonNullable<T["current"]>["data"][number];
  type Props = {
    delimiter?: string;
    data: Item[];
    query: {
      table: string;
      limit: number;
      offset: number;
      search?: string;
      where?: Record<string, any>;
    };
    exportAll: boolean;
    exportLoading: boolean;
    mapper?: {
      export?: (item: Item, index: number, data: Item[]) => any;
    };
  };
  let {
    data,
    query,
    exportAll,
    mapper,
    delimiter = ";",
    exportLoading = $bindable(),
  }: Props = $props();

  async function exportData(type: "csv" | "json" | "xlsx", event: Event) {
    if (!["csv", "json", "xlsx"].includes(type)) return;
    const el = event.currentTarget as HTMLButtonElement;
    el.classList.add("bg-base-300");
    exportLoading = true;

    if (exportAll) {
      const { limit, offset, ...allQuery } = query;
      // @ts-expect-error getData dynamic table
      const allData = await getData(allQuery);
      data = allData?.data ?? [];
    }

    if (mapper?.export) {
      data = data.map(mapper.export);
    }

    const a = document.createElement("a");
    a.download = `${query.table}-${d().format("YYYYMMDD")}.${type}`;
    const MAP = {
      csv: exportCSV,
      xlsx: exportXLSX,
      json: exportJSON,
    };
    if (!data.length) return;
    const obj = await MAP[type](data);
    if (obj) {
      a.href = URL.createObjectURL(obj);
      a.click();
    }
    exportLoading = false;
    el.classList.remove("bg-base-300");
  }

  let XLSXPromise: Promise<any> | null = null;

  function loadXLSX() {
    if (!XLSXPromise) {
      XLSXPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src =
          "https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";

        script.onload = () => {
          resolve((window as any).XLSX);
        };

        script.onerror = reject;

        document.head.appendChild(script);
      });
    }

    return XLSXPromise;
  }

  async function exportXLSX(data: any[]) {
    const XLSX = await loadXLSX();

    const worksheet = XLSX.utils.json_to_sheet(data);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    return new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function exportCSV(data: any[]) {
    const headers = Object.keys(data[0]);

    const rows = [
      headers.join(delimiter),
      ...data.map((row) =>
        headers
          .map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`)
          .join(delimiter),
      ),
    ];

    return new Blob([rows.join("\n")], { type: "text/csv" });
  }

  async function exportJSON(data: any[]) {
    return new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
  }
</script>

<li>
  <button
    onclick={(e: Event) => exportData("xlsx", e)}
    class:pointer-events-none={exportLoading}
  >
    <iconify-icon icon="bx:download"></iconify-icon>
    Export XLSX
  </button>
</li>
<li>
  <button
    onclick={(e) => exportData("csv", e)}
    class:pointer-events-none={exportLoading}
  >
    <iconify-icon icon="bx:download"></iconify-icon>
    Export CSV
  </button>
</li>
<li>
  <button
    onclick={(e) => exportData("json", e)}
    class:pointer-events-none={exportLoading}
  >
    <iconify-icon icon="bx:download"></iconify-icon>
    Export JSON
  </button>
</li>
