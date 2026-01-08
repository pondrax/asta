// oauth.ts
import { createId } from "$lib/utils";
import {
  type OAuthConfig,
  type UserInfo,
  OAuthProvider,
} from "./providers/base";
import providersConfig from "./providers/config";
import github from "./providers/github";
import google from "./providers/google";
import microsoft from "./providers/microsoft";
import openid from "./providers/openid";

const providers = {
  openid,
  github,
  google,
  microsoft,
};

export type Providers = typeof providers;

export class OAuth {
  private provider: OAuthProvider;
  private state: string;

  constructor(
    provider: keyof Providers,
    config?: OAuthConfig,
    params: Record<string, string> = {},
  ) {
    this.state = createId(32);
    const query = new URLSearchParams(params);
    if (!config) {
      //@ts-expect-error
      config = providersConfig[provider];
    }
    //@ts-expect-error
    this.provider = new providers[provider](config);
  }

  getAuthUrl(state?: Record<string, any>) {
    return {
      state: this.state,
      url: this.provider.getAuthUrl(state),
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
