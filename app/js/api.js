/**
 * API client for the Expense Manager local server.
 */
class ExpenseAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  /**
   * Parse a connection URL like http://192.168.1.5:8080?token=abc123
   */
  static parseConnectionUrl(url) {
    const parsed = new URL(url.trim());
    const token = parsed.searchParams.get('token');
    if (!token) throw new Error('Missing token in URL');
    return { baseUrl: `${parsed.protocol}//${parsed.host}`, token };
  }

  async _fetch(path) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 403) throw new Error('Invalid or expired session token');
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  async handshake() { return this._fetch('/handshake'); }
  async getExpenses(limit = 20, offset = 0) { return this._fetch(`/expenses?limit=${limit}&offset=${offset}`); }
  async getCategories() { return this._fetch('/categories'); }
  async getAccounts() { return this._fetch('/accounts'); }
}
