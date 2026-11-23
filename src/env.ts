import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	AI_KEY: {
		schema: (value) => value ?? ''
	},
	AI_MODEL: {
		schema: (value) => value ?? ''
	},
	AI_URL: {
		schema: (value) => value ?? ''
	},
	APP_SECRET: {
		schema: (value) => value ?? ''
	},
	BKPSDM_PASSWORD: {
		schema: (value) => value ?? ''
	},
	BKPSDM_USERNAME: {
		schema: (value) => value ?? ''
	},
	BLOB_READ_WRITE_TOKEN: {
		schema: (value) => value ?? ''
	},
	BROWSER_EXECUTABLE_PATH: {
		schema: (value) => value ?? ''
	},
	BROWSER_REMOTE_DEBUG_URL: {
		schema: (value) => value ?? ''
	},
	DATABASE_URL: {
		schema: (value) => value ?? ''
	},
	DEV: {
		schema: (value) => value ?? ''
	},
	ESIGN_API_KEY: {
		schema: (value) => value ?? ''
	},
	ESIGN_DEV_URL: {
		schema: (value) => value ?? ''
	},
	ESIGN_URL: {
		schema: (value) => value ?? ''
	},
	GITHUB_CLIENT_ID: {
		schema: (value) => value ?? ''
	},
	GITHUB_CLIENT_SECRET: {
		schema: (value) => value ?? ''
	},
	GITHUB_REDIRECT_URI: {
		schema: (value) => value ?? ''
	},
	OPENID_AUTH_ENDPOINT: {
		schema: (value) => value ?? ''
	},
	OPENID_BASE_URL: {
		schema: (value) => value ?? ''
	},
	OPENID_CLIENT_ID: {
		schema: (value) => value ?? ''
	},
	OPENID_CLIENT_SECRET: {
		schema: (value) => value ?? ''
	},
	OPENID_REALM: {
		schema: (value) => value ?? ''
	},
	OPENID_REDIRECT_URI: {
		schema: (value) => value ?? ''
	},
	OPENID_SCOPE: {
		schema: (value) => value ?? ''
	},
	OPENID_TOKEN_ENDPOINT: {
		schema: (value) => value ?? ''
	},
	OPENID_USERINFO_ENDPOINT: {
		schema: (value) => value ?? ''
	},
	ORIGIN: {
		schema: (value) => value ?? ''
	},
	PORTAL_BSRE_PASSWORD: {
		schema: (value) => value ?? ''
	},
	PORTAL_BSRE_USERNAME: {
		schema: (value) => value ?? ''
	},
	PORTAL_BSRE_USER_IP: {
		schema: (value) => value ?? ''
	},
	PORTAL_OTP_AUTH: {
		schema: (value) => value ?? ''
	},
	PUBLIC_MAX_CONCURRENT_REQUESTS: {
		public: true,
		schema: (value) => value ?? ''
	},
	PUBLIC_MAX_FILES: {
		public: true,
		schema: (value) => value ?? ''
	},
	PUBLIC_MAX_FILE_SIZE_MB: {
		public: true,
		schema: (value) => value ?? ''
	},
	PUBLIC_MAX_RETRIES: {
		public: true,
		schema: (value) => value ?? ''
	},
	PUBLIC_TURNSTILE_KEY: {
		public: true,
		schema: (value) => value ?? ''
	},
	S3_ACCESS_KEY_ID: {
		schema: (value) => value ?? ''
	},
	S3_BUCKET: {
		schema: (value) => value ?? ''
	},
	S3_ENDPOINT: {
		schema: (value) => value ?? ''
	},
	S3_QUOTA: {
		schema: (value) => value ?? ''
	},
	S3_REGION: {
		schema: (value) => value ?? ''
	},
	S3_SECRET_ACCESS_KEY: {
		schema: (value) => value ?? ''
	},
	STORAGE_BASE_DIR: {
		schema: (value) => value ?? ''
	},
	STORAGE_PROVIDER: {
		schema: (value) => value ?? ''
	},
	TURNSTILE_SECRET_KEY: {
		schema: (value) => value ?? ''
	},
	WHATSAPP_ADMIN: {
		schema: (value) => value ?? ''
	},
	WHATSAPP_AUTH: {
		schema: (value) => value ?? ''
	},
	WHATSAPP_HOST: {
		schema: (value) => value ?? ''
	},
	WHATSAPP_NOTIFY_DOCUMENT: {
		schema: (value) => value ?? ''
	}
});
