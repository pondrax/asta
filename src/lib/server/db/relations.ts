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
    organization: r.one.organizations({
      from: r.users.organization_id,
      to: r.organizations.id
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
  },
  helpdesk: {
    organization: r.one.organizations({
      from: r.helpdesk.organizationId,
      to: r.organizations.id
    }),
    parent: r.one.helpdesk({
      from: r.helpdesk.parentId,
      to: r.helpdesk.id
    }),
    children: r.many.helpdesk({
      from: r.helpdesk.id,
      to: r.helpdesk.parentId
    }),
    comments: r.many.helpdeskComments({
      from: r.helpdesk.id,
      to: r.helpdeskComments.helpdeskId
    }),
    events: r.many.helpdeskEvents({
      from: r.helpdesk.id,
      to: r.helpdeskEvents.helpdeskId
    }),
    notifications: r.many.helpdeskNotifications({
      from: r.helpdesk.id,
      to: r.helpdeskNotifications.helpdeskId
    }),
    survey: r.one.helpdeskSurveys({
      from: r.helpdesk.id,
      to: r.helpdeskSurveys.helpdeskId
    }),
  },
  helpdeskComments: {
    ticket: r.one.helpdesk({
      from: r.helpdeskComments.helpdeskId,
      to: r.helpdesk.id
    }),
  },
  helpdeskEvents: {
    ticket: r.one.helpdesk({
      from: r.helpdeskEvents.helpdeskId,
      to: r.helpdesk.id
    }),
  },
  helpdeskNotifications: {
    ticket: r.one.helpdesk({
      from: r.helpdeskNotifications.helpdeskId,
      to: r.helpdesk.id
    }),
  },
  helpdeskSurveys: {
    ticket: r.one.helpdesk({
      from: r.helpdeskSurveys.helpdeskId,
      to: r.helpdesk.id
    }),
  },
}))