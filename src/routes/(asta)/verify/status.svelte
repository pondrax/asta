<script lang="ts">
  import type { SignatureVerificationResponse } from "./types";

  let {
    verifyStatus,
  }: {
    verifyStatus: SignatureVerificationResponse;
  } = $props();

  // Helper function to format dates
  function formatDate(dateString: string) {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString();
  }
</script>

<div class="space-y-2">
  <div class="-mb-1">
    <div
      class="btn btn-sm w-full pointer-events-none {verifyStatus.conclusion ===
      'VALID'
        ? 'btn-success'
        : 'btn-error'}"
    >
      {verifyStatus.conclusion}
    </div>
    <div class="inline-flex">
      <iconify-icon
        icon={verifyStatus.conclusion === "VALID" ? "bx:check" : "bx:error"}
      ></iconify-icon>
      <div class="text-xs">
        {verifyStatus.description}
      </div>
    </div>
  </div>

  <!-- Signature Details Collapse -->
  {#each verifyStatus.signatureInformations as signature, i}
    <div class="collapse collapse-arrow bg-base-200 text-xs">
      <input type="checkbox" />
      <div class="collapse-title text-xs font-medium">
        <div class="">
          <div class="text-sm">#{i + 1} {signature.signerName}</div>
          <div class="flex gap-1">
            {#if signature.integrityValid}
              <div class="badge badge-xs badge-info">Valid</div>
            {:else}
              <div class="badge badge-xs badge-warning">Invalid</div>
            {/if}
            {#if signature.certificateTrusted}
              <div class="badge badge-xs badge-success">Trusted</div>
            {:else}
              <div class="badge badge-xs badge-error">Not Trusted</div>
            {/if}
            <div>{signature.fieldName}</div>
          </div>
        </div>
      </div>
      <div class="collapse-content">
        <div class="space-y-2">
          <div>
            <span class="font-medium">Signature Date:</span>
            {formatDate(signature.signatureDate)}
          </div>
          <div>
            <span class="font-medium">Reason:</span>
            {signature.reason || "-"}
          </div>
          <div>
            <span class="font-medium">Location:</span>
            {signature.location || "-"}
          </div>

          {#if signature.timestampInfomation}
            <div>
              <span class="font-medium">Timestamp Date:</span>
              {formatDate(signature.timestampInfomation.timestampDate)}
            </div>
          {/if}
        </div>

        <div class="space-y-2 mt-5">
          <h3 class="font-semibold">Certificate Chain</h3>
          {#each signature.certificateDetails as cert, j}
            <div class="collapse bg-base-300">
              <input type="checkbox" />
              <div class="collapse-title font-medium text-sm py-1.5">
                {cert.commonName}
              </div>
              <div class="collapse-content space-y-2">
                <div>
                  <span class="font-medium">Issuer:</span>
                  {cert.issuerName}
                </div>
                <div>
                  <span class="font-medium">Serial Number:</span>
                  {cert.serialNumber}
                </div>
                <div>
                  <span class="font-medium">Valid From:</span>
                  {formatDate(cert.notBeforeDate)}
                </div>
                <div>
                  <span class="font-medium">Valid Until:</span>
                  {formatDate(cert.notAfterDate)}
                </div>
                <div>
                  <span class="font-medium">Algorithm:</span>
                  {cert.signatureAlgoritm}
                </div>
                <div>
                  <span class="font-medium">Key Usages:</span>
                  <div class="flex flex-wrap gap-1 mt-1">
                    {#each cert.keyUsages as usage}
                      <span class="badge badge-outline">{usage}</span>
                    {/each}
                  </div>
                </div>
                <!-- <div
                  class="text-xs font-mono break-all mt-2 p-2 bg-base-100 rounded"
                >
                  ID: {cert.id}
                </div> -->
              </div>
            </div>
          {/each}
        </div>

        <!-- <div class="text-sm">
          <span class="font-medium">Signature ID:</span>
          <div class="font-mono break-all mt-1 p-2 bg-base-300 rounded">
            {signature.id}
          </div>
        </div> -->
      </div>
    </div>
  {/each}
</div>
