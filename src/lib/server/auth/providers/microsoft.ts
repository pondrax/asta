// microsoft.ts
import { OAuthProvider } from './base';

export default class MicrosoftOauth extends OAuthProvider {
  getAuthUrl(state?: Record<string, any>) {
    return `https://login.microsoftonline.com/${this.config.tenantId || 'common'}/oauth2/v2.0/authorize?${new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      scope: "openid email profile User.Read",
      response_mode: "query",
      state: JSON.stringify(state)
    })}`;
  }

  async getAccessToken(code: string) {
    const response = await fetch(`https://login.microsoftonline.com/${this.config.tenantId || 'common'}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
        grant_type: "authorization_code",
        scope: "openid email profile User.Read"
      })
    });
    const data = await response.json();
    // console.log(data)
    if (!data.access_token) throw new Error("No access token");
    return data.access_token;
  }

  async getUser(accessToken: string) {
    const user = await fetch("https://graph.microsoft.com/beta/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then(res => res.json());
    // console.log(user)
    return {
      username: user.displayName,
      email: user.mail || user.userPrincipalName,
      avatarUrl: `https://graph.microsoft.com/v1.0/me/photo/$value`,
      data: user
    };
  }
}