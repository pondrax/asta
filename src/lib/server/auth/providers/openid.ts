import { OAuthProvider } from "./base";

interface OpenIDProviderConfig {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  baseUrl?: string;
  realm?: string;
  scope?: string;
}

export default class OpenIDOAuth extends OAuthProvider {
  private providerConfig: OpenIDProviderConfig;

  constructor(config: any) {
    super(config);
    this.providerConfig = {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      userInfoEndpoint: config.userInfoEndpoint,
      baseUrl: config.baseUrl,
      realm: config.realm,
      scope: config.scope || "openid email profile",
    };
  }

  getAuthUrl() {
    const { baseUrl, realm, scope } = this.providerConfig;

    // Build endpoint URL
    let authEndpoint = this.providerConfig.authorizationEndpoint;
    if (!authEndpoint && baseUrl && realm) {
      authEndpoint = `${baseUrl}/realms/${realm}/protocol/openid-connect/auth`;
    }

    if (!authEndpoint) {
      throw new Error(
        "Missing authorization endpoint. Provide either authorizationEndpoint or baseUrl+realm",
      );
    }

    const params = new URLSearchParams();
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("response_type", "code");

    if (scope) {
      params.set("scope", scope);
    }

    return `${authEndpoint}?${params.toString()}`;
  }

  async getAccessToken(code: string) {
    const { baseUrl, realm } = this.providerConfig;

    // Build token endpoint URL
    let tokenEndpoint = this.providerConfig.tokenEndpoint;
    if (!tokenEndpoint && baseUrl && realm) {
      tokenEndpoint = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;
    }

    if (!tokenEndpoint) {
      throw new Error(
        "Missing token endpoint. Provide either tokenEndpoint or baseUrl+realm",
      );
    }

    const body = new URLSearchParams();
    body.append("client_id", this.config.clientId);
    body.append("client_secret", this.config.clientSecret);
    body.append("redirect_uri", this.config.redirectUri);
    body.append("grant_type", "authorization_code");
    body.append("code", code);

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    const data = await response.json();
    // console.log('Token response:', data);
    if (!data.access_token) throw new Error(JSON.stringify(data));
    return data.access_token;
  }

  async getUser(accessToken: string) {
    const { baseUrl, realm } = this.providerConfig;

    // Build userinfo endpoint URL
    let userInfoEndpoint = this.providerConfig.userInfoEndpoint;
    if (!userInfoEndpoint && baseUrl && realm) {
      userInfoEndpoint = `${baseUrl}/realms/${realm}/protocol/openid-connect/userinfo`;
    }

    if (!userInfoEndpoint) {
      throw new Error(
        "Missing userinfo endpoint. Provide either userInfoEndpoint or baseUrl+realm",
      );
    }

    const response = await fetch(userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    const user = await response.json();

    // Map OpenID user data to our UserInfo interface
    return {
      username: user.preferred_username || user.email || user.sub,
      email: user.email || null,
      avatarUrl: user.picture || "",
    };
  }

  // Optional: Refresh token method
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const { baseUrl, realm } = this.providerConfig;

    let tokenEndpoint = this.providerConfig.tokenEndpoint;
    if (!tokenEndpoint && baseUrl && realm) {
      tokenEndpoint = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;
    }

    if (!tokenEndpoint) {
      throw new Error("Missing token endpoint");
    }

    const body = new URLSearchParams();
    body.append("client_id", this.config.clientId);
    body.append("client_secret", this.config.clientSecret);
    body.append("grant_type", "refresh_token");
    body.append("refresh_token", refreshToken);

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    const data = await response.json();
    if (!data.access_token) throw new Error("No access token");
    return data.access_token;
  }
}
