import { env } from "$env/dynamic/private";

export default {
  openid: {
    clientId: env.OPENID_CLIENT_ID,
    clientSecret: env.OPENID_CLIENT_SECRET,
    redirectUri: env.OPENID_REDIRECT_URI,
    // Choose either these for Keycloak:
    baseUrl: env.OPENID_BASE_URL,     // e.g., https://auth.example.com
    realm: env.OPENID_REALM,          // e.g., "myrealm"
    scope: env.OPENID_SCOPE || 'openid email profile'

    // OR these for generic OpenID:
    // authorizationEndpoint: env.OPENID_AUTH_ENDPOINT,
    // tokenEndpoint: env.OPENID_TOKEN_ENDPOINT,
    // userInfoEndpoint: env.OPENID_USERINFO_ENDPOINT,
  },

  // Other providers...
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri: env.GITHUB_REDIRECT_URI
  }
} as const;