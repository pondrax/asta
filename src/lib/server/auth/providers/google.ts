// google.ts
import { OAuthProvider } from './base';

export default class GoogleAuth extends OAuthProvider {
  getAuthUrl() {
    return `https://accounts.google.com/o/oauth2/auth?${new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent"
    })}`;
  }

  async getAccessToken(code: string) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
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
        grant_type: "authorization_code"
      })
    });
    const data = await response.json();
    if (!data.access_token) throw new Error("No access token");
    return data.access_token;
  }

  async getUser(accessToken: string) {
    const user = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then(res => res.json());
    return {
      username: user.name,
      email: user.email,
      avatarUrl: user.picture
    };
  }
}