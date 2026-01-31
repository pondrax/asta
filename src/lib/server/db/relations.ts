import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  users: {
    posts: r.many.posts({
      from: r.users.id,
      to: r.posts.user_id,
    }),
  },
  documents: {
    user: r.one.users({
      from: r.documents.owner,
      to: r.users.email,
    }),
  },
}));
