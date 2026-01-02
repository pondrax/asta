<script lang="ts">
  import { getTemplates } from "$lib/remotes/sign.remote";

  let { onSelect } = $props();
  let records = await getTemplates({});
</script>

<div class="p-5">
  <table class="table table-sm">
    <thead>
      <tr>
        <!-- <th>ID</th> -->
        <th>Name</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      {#each records as item}
        <tr>
          <!-- <td>{item.id}</td> -->
          <td>{item.name}</td>
          <td>{item.file}</td>
          <td>{JSON.stringify(item.properties)}</td>
          <td>
            <button
              class="btn btn-sm btn-primary"
              onclick={() => onSelect(item)}>Pilih</button
            >
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
