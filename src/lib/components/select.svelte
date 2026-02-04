<script
  lang="ts"
  generics="Table extends TableName | 'local' = 'local', T extends Record<string, any> = any"
>
  import { onMount, untrack } from "svelte";
  import { fly } from "svelte/transition";
  import {
    getData,
    type TableName,
    type TableRow,
  } from "$lib/remotes/api.remote";

  // Strict inference for the item structure
  type Item = Table extends TableName ? NonNullable<TableRow<Table>> : T;
  type Key = Extract<keyof Item, string>;
  type ValueType = any; // Often string or number from valueKey

  type Props = {
    options?: Item[];
    table?: Table;
    params?: any;
    value?: ValueType | ValueType[] | null;
    object?: Item | Item[] | null;
    labelKey?: Key;
    valueKey?: Key;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    multiple?: boolean;
    class?: string;
    inputClass?: string;
    collapse?: boolean;
    onSelect?: (option: Item) => void;
  };

  let {
    options = [],
    table,
    params = {},
    value = $bindable(),
    object = $bindable(),
    labelKey = "label" as Key,
    valueKey = "value" as Key,
    label = "",
    placeholder = "Select an option",
    disabled = false,
    multiple = false,
    class: className = "",
    inputClass = "",
    collapse = false,
    onSelect,
  }: Props = $props();

  let isOpen = $state(false);
  let searchQuery = $state("");
  let activeIndex = $state(-1);
  let containerRef = $state<HTMLDivElement>();
  let isLoading = $state(false);
  let remoteOptions = $state<Item[]>([]);
  let focusOpenedTime = 0;

  const dropdownId = `select-dropdown-${Math.random().toString(36).slice(2, 9)}`;

  function getLabel(opt: Item | null | undefined): string {
    if (!opt) return "";
    if (typeof opt === "string") return opt;
    return (opt as any)[labelKey] ?? "";
  }

  function getValue(opt: Item | null | undefined): any {
    if (!opt) return null;
    if (typeof opt === "string") return opt;
    return (opt as any)[valueKey] ?? opt;
  }

  let displayOptions = $derived(
    table && table !== "local"
      ? remoteOptions
      : options.filter((opt) =>
          getLabel(opt).toLowerCase().includes(searchQuery.toLowerCase()),
        ),
  );

  function isSelected(opt: Item): boolean {
    const optValue = getValue(opt);
    if (multiple) {
      if (Array.isArray(value)) {
        return value.some((v) => v === optValue);
      }
      return false;
    }
    return value === optValue;
  }

  function handleSelect(opt: Item) {
    const optValue = getValue(opt);

    if (multiple) {
      let currentValues = Array.isArray(value) ? [...value] : [];
      let currentObjects = Array.isArray(object) ? [...object] : [];

      const index = currentValues.indexOf(optValue);
      if (index >= 0) {
        currentValues.splice(index, 1);
        currentObjects.splice(index, 1);
      } else {
        currentValues.push(optValue);
        currentObjects.push(opt);
      }

      value = currentValues;
      object = currentObjects;
      searchQuery = "";
    } else {
      value = optValue;
      object = opt;
      isOpen = false;
      searchQuery = "";
    }

    activeIndex = -1;
    onSelect?.(opt);
  }

  function removeItem(opt: Item, e: MouseEvent) {
    e.stopPropagation();
    const optValue = getValue(opt);

    if (multiple) {
      if (Array.isArray(value) && Array.isArray(object)) {
        const index = value.indexOf(optValue);
        if (index >= 0) {
          const newValues = [...value];
          const newObjects = [...object];
          newValues.splice(index, 1);
          newObjects.splice(index, 1);
          value = newValues;
          object = newObjects;
        }
      }
    } else {
      value = null;
      object = null;
    }
  }

  // Effect to sync object if value changes externally (experimental/basic)
  $effect(() => {
    if (!table || table === "local") {
      untrack(() => {
        if (multiple && Array.isArray(value)) {
          // If objects aren't in sync, try to find them in options
          const found = value
            .map((v) => options.find((o) => getValue(o) === v))
            .filter(Boolean) as Item[];
          if (found.length === value.length) object = found;
        } else if (!multiple && value != null) {
          const found = options.find((o) => getValue(o) === value);
          if (found) object = found;
        }
      });
    }
  });

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        isOpen = false;
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });

  function focus(node: HTMLElement) {
    node.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        isOpen = true;
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        activeIndex = (activeIndex + 1) % displayOptions.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        activeIndex =
          (activeIndex - 1 + displayOptions.length) % displayOptions.length;
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < displayOptions.length) {
          handleSelect(displayOptions[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        isOpen = false;
        break;
      case "Tab":
        isOpen = false;
        break;
    }
  }

  // Fetch logic for table mode
  let debounceTimer: any;
  let lastFetchedQuery = "";

  async function fetchRemoteData(search: string, force = false) {
    if (!table || table === "local") return;
    if (!force && search === lastFetchedQuery && remoteOptions.length > 0)
      return;

    isLoading = true;
    try {
      const result = await getData({
        table: table as TableName,
        search,
        limit: 10,
        offset: 0,
        ...params,
      });
      remoteOptions = result.data as Item[];
      lastFetchedQuery = search;
    } catch (error) {
      console.error("Failed to fetch remote data:", error);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (table && table !== "local" && isOpen) {
      const query = searchQuery;
      clearTimeout(debounceTimer);
      const delay = query === "" ? 0 : 300;
      debounceTimer = setTimeout(() => {
        untrack(() => fetchRemoteData(query));
      }, delay);
    }
  });

  $effect(() => {
    if (!isOpen) {
      untrack(() => {
        activeIndex = -1;
      });
    }
  });

  const hasValue = $derived(
    multiple ? Array.isArray(value) && value.length > 0 : value != null,
  );

  function handleFocus(e: FocusEvent) {
    if (disabled) return;
    const relatedTarget = e.relatedTarget as Node;
    if (!containerRef?.contains(relatedTarget)) {
      if (!isOpen) {
        isOpen = true;
        focusOpenedTime = Date.now();
      }
    }
  }

  function handleClick(e: MouseEvent) {
    if (disabled) return;
    if ((e.target as HTMLElement).closest("button")) return;

    const timeSinceFocus = Date.now() - focusOpenedTime;
    if (timeSinceFocus < 300 && isOpen) {
      return;
    }

    isOpen = !isOpen;
  }
</script>

<div
  class="relative w-full block {className}"
  class:z-[100]={isOpen}
  bind:this={containerRef}
>
  <!-- Trigger -->
  <div
    class="input input-bordered peer flex items-center gap-2 cursor-pointer w-full bg-base-100 transition-all duration-200 h-auto {inputClass.includes(
      'input-sm',
    )
      ? 'min-h-8 py-1 px-2'
      : inputClass.includes('input-lg')
        ? 'min-h-14 py-3 px-4'
        : 'min-h-10 py-1.5'} {inputClass}"
    class:input-disabled={disabled}
    class:z-10={isOpen}
    role="button"
    tabindex="0"
    aria-expanded={isOpen}
    aria-haspopup="listbox"
    aria-controls={dropdownId}
    onclick={handleClick}
    onfocusin={handleFocus}
    onkeydown={handleKeydown}
  >
    <div class="flex-1 flex flex-wrap gap-1.5 min-w-0">
      {#if multiple && Array.isArray(object) && object.length > 0}
        {#if collapse}
          <div class="flex items-center gap-2 px-1">
            <div class="badge badge-primary font-bold">
              {object.length}
            </div>
            <span class="text-sm font-medium text-base-content/70">
              {object.length === 1 ? "item" : "items"} selected
            </span>
          </div>
        {:else}
          {#each object as item (getValue(item))}
            <div
              class="badge badge-primary gap-1 pl-2 pr-1 h-7 animate-in fade-in zoom-in duration-200"
              role="presentation"
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => e.stopPropagation()}
            >
              <span class="text-xs font-semibold truncate max-w-[120px]"
                >{getLabel(item)}</span
              >
              <button
                type="button"
                class="hover:bg-primary-focus rounded-full p-0.5 transition-colors"
                aria-label="Remove {getLabel(item)}"
                onclick={(e) => removeItem(item, e)}
              >
                <iconify-icon icon="bx:x" class="text-sm"></iconify-icon>
              </button>
            </div>
          {/each}
        {/if}
      {:else if !multiple && object}
        <span class="text-base-content font-medium px-1 truncate"
          >{getLabel(object as Item)}</span
        >
      {:else}
        <span class="text-base-content/40 px-1 truncate"
          >{label ? "" : placeholder}</span
        >
      {/if}
    </div>
    <div class="flex items-center gap-1.5 px-1 bg-base-100">
      {#if isLoading}
        <span class="loading loading-spinner loading-xs text-primary"></span>
      {/if}
      {#if hasValue}
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-circle text-base-content/20 hover:text-error h-8 w-8 min-h-0"
          aria-label="Clear selection"
          onclick={(e) => {
            e.stopPropagation();
            value = multiple ? [] : null;
            object = multiple ? [] : null;
          }}
        >
          <iconify-icon icon="bx:x-circle" class="text-lg"></iconify-icon>
        </button>
      {/if}
      <iconify-icon
        icon="bx:chevron-down"
        class="transition-transform duration-300 text-base-content/40"
        style:transform={isOpen ? "rotate(180deg)" : "none"}
      ></iconify-icon>
    </div>
  </div>

  <!-- Floating Label Label (After Trigger for Stacking) -->
  {#if label}
    <span
      class="absolute left-3 transition-all duration-200 pointer-events-none z-20 bg-base-100 px-1 rounded"
      class:top-1.5={!hasValue && !isOpen}
      class:text-sm={!hasValue && !isOpen}
      class:opacity-50={!hasValue && !isOpen}
      class:-top-2.5={hasValue || isOpen}
      class:text-xs={hasValue || isOpen}
      class:text-primary={isOpen}
      class:font-bold={hasValue || isOpen}
    >
      {label}
    </span>
  {/if}

  <!-- Dropdown -->
  {#if isOpen}
    <div
      id={dropdownId}
      class="absolute z-50 w-full mt-2 rounded-xl shadow-2xl border border-base-content/10 overflow-hidden backdrop-blur-md bg-base-100/95"
      role="listbox"
      transition:fly={{ y: -10, duration: 250 }}
    >
      <div class="p-2 border-b border-base-content/5">
        <div
          class="input input-sm input-ghost flex items-center gap-2 bg-base-200/50 hover:bg-base-200 transition-colors"
        >
          <iconify-icon icon="bx:search" class="text-base-content/40"
          ></iconify-icon>
          <input
            type="text"
            placeholder="Filter options..."
            class="grow bg-transparent focus:ring-0 focus:outline-none text-sm"
            bind:value={searchQuery}
            use:focus
            onkeydown={handleKeydown}
          />
        </div>
      </div>

      <div class="max-h-60 overflow-y-auto p-1 custom-scrollbar">
        {#if displayOptions.length === 0}
          <div class="px-3 py-8 text-center">
            <iconify-icon
              icon="bx:search-alt"
              class="text-3xl text-base-content/20 mb-2"
            ></iconify-icon>
            <p class="text-sm text-base-content/40">
              {isLoading
                ? "Searching..."
                : `No results found for "${searchQuery}"`}
            </p>
          </div>
        {:else}
          {#each displayOptions as opt, i (getValue(opt))}
            <button
              type="button"
              class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center justify-between group mb-0.5 last:mb-0"
              class:bg-primary={i === activeIndex}
              class:text-primary-content={i === activeIndex}
              class:bg-base-200={isSelected(opt) && i !== activeIndex}
              role="option"
              aria-selected={isSelected(opt)}
              onclick={() => handleSelect(opt)}
            >
              <div class="flex items-center gap-2 min-w-0">
                {#if multiple}
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs pointer-events-none"
                    class:checkbox-primary={i !== activeIndex}
                    checked={isSelected(opt)}
                    tabindex="-1"
                  />
                {/if}
                <span class="truncate">{getLabel(opt)}</span>
              </div>
              {#if isSelected(opt)}
                <iconify-icon icon="bx:check" class="text-lg"></iconify-icon>
              {:else if i === activeIndex}
                <iconify-icon icon="bx:chevron-right" class="text-lg opacity-50"
                ></iconify-icon>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
