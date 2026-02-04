import { defineRelations } from 'drizzle-orm';
import * as schema from './schema'


export const relations = defineRelations(schema, (r) => ({
  roles: {
    users: r.many.users({
      from: r.roles.id,
      to: r.users.role_id
    })
  },
  users: {
    role: r.one.roles({
      from: r.users.role_id,
      to: r.roles.id
    }),
    posts: r.many.posts({
      from: r.users.id,
      to: r.posts.user_id
    }),
  },
  documents: {
    user: r.one.users({
      from: r.documents.owner,
      to: r.users.email
    })
  }
}))