import { createId } from "$lib/utils";
import { db } from "..";

export default async () => {
  console.log("Upserting roles...");
  await db.query.roles.upsert({
    data: [
      {
        id: "ajhdbsajkdbkas",
        name: "admin",
        description: "Administrator pengelola sistem",
      },
      {
        id: "bsajkdbkas",
        name: "infra",
        description: "Administrator infrastruktur",
      },
      {
        id: "member",
        name: "member",
        description: "Pengguna umum",
      },
    ],
  });
  console.log("Roles upserted successfully!");
};
