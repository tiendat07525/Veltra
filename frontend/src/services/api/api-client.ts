/**
 * Base API Client configured for future NestJS REST backend connection.
 * Currently proxies into the local mock layer.
 */
export interface ApiResponse<T> {
  data: T;
  statusCode: number;
  message?: string;
}

class ApiClient {
  private baseUrl: string = '/api';
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  async get<T>(endpoint: string): Promise<T> {
    // Prepared for real fetch: fetch(`${this.baseUrl}${endpoint}`, { headers: ... })
    return {} as T;
  }

  async post<T>(endpoint: string, payload: any): Promise<T> {
    return {} as T;
  }

  async patch<T>(endpoint: string, payload: any): Promise<T> {
    return {} as T;
  }

  async delete<T>(endpoint: string): Promise<T> {
    return {} as T;
  }
}

export const apiClient = new ApiClient();
