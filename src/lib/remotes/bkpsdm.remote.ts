import { query } from "$app/server";
import { type } from "arktype";
import { fetchAsnByNip } from "./bkpsdm";

export type { BkpsdmAsn } from "./bkpsdm";

/** Public remote wrapper — returns the ASN record or null. */
export const checkNip = query(
  type({ nip: "string" }),
  async ({ nip }) => fetchAsnByNip(nip),
);
