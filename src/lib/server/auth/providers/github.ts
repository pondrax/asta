// github.ts
import { OAuthProvider } from './base';

export default class GithubOauth extends OAuthProvider {
  getAuthUrl() {
    return `https://github.com/login/oauth/authorize?${new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: "user:email"
    })}`;
  }

  async getAccessToken(code: string) {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code
      })
    });
    const data = await response.json();
    if (!data.access_token) throw new Error("No access token");
    return data.access_token;
  }

  async getUser(accessToken: string) {
    const [user, emails] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).then(res => res.json()),
      fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).then(res => res.json())
    ]);
    return {
      username: user.login,
      email: emails.find((e: any) => e.primary && e.verified)?.email || null,
      avatarUrl: user.avatar_url
    };
  }
}