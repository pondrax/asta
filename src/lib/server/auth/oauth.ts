// oauth.ts
import { createId } from "$lib/utils";
import { type OAuthConfig, type UserInfo, OAuthProvider } from "./providers/base";
import providersConfig from "./providers/config";
import github from "./providers/github";
import google from "./providers/google";
import microsoft from "./providers/microsoft";
import openid from "./providers/openid";

const providers = {
  openid,
  github,
  google,
  microsoft
};

export type Providers = typeof providers;

export class OAuth {
  private provider: OAuthProvider;
  private state: string;

  constructor(provider: keyof Providers, config?: OAuthConfig) {
    this.state = createId(32);
    if (!config) {
      //@ts-ignore - dynamic key access on providersConfig
      config = providersConfig[provider];
    }
    //@ts-ignore - dynamic provider constructor from providers map
    this.provider = new providers[provider](config);
  }

  getAuthUrl(state?: Record<string, any>) {
    return {
      state: this.state,
      url: this.provider.getAuthUrl(state)
    };
  }

  getAccessToken(code: string) {
    return this.provider.getAccessToken(code);
  }

  getUser(accessToken: string) {
    return this.provider.getUser(accessToken);
  }
}

export { type OAuthConfig, type UserInfo, OAuthProvider };