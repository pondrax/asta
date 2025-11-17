import { pgTable, integer, text, timestamp, json } from 'drizzle-orm/pg-core';
import { init } from '@paralleldrive/cuid2';

const createId = init({ length: 15 });

const id = text('id').primaryKey().$default(() => createId());
const created = timestamp('created', { mode: 'string', withTimezone: true })
	.defaultNow()
const updated = timestamp('updated', { mode: 'string', withTimezone: true })
	.defaultNow()
	.$onUpdate(() => new Date().toISOString())

export const users = pgTable('users', {
	id,
	email: text('email').unique(),
	password: text('password'),
	created,
	updated,
});


export const posts = pgTable('posts', {
	id,
	created,
	updated,
	title: text('title'),
	content: text('content'),
	user_id: text('user_id').references(() => users.id)
});


export const signers = pgTable('signers', {
	id,
	email: text('email').unique(),
	name: text('name'),
	position: text('position'),
	rank: text('rank'),
	organizations: text('organizations'),
	created,
	updated,
})

export const documents = pgTable('documents', {
	id,
	email: text('email'),
	title: text('title'),
	files: text('files').array(),
	signatures: text('signatures').array(),
	created,
	updated,
})

export const templates = pgTable('templates', {
	id,
	name: text('name').unique(),
	file: text('file'),
	properties: json('properties'),
	created,
	updated,
})
export const organizations = pgTable('organizations', {
	id,
	name: text('name').unique(),
	short_name: text('short_name').unique(),
	created,
	updated,
})

export const ranks = pgTable('ranks', {
	id,
	rank: text('rank').unique(),
	grade: text('grade').unique(),
	created,
	updated,
})