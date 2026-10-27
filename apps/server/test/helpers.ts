import { io as ioc, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config';
import { buildApp, type BuiltApp } from '../src/app';

export interface TestEnv {
  built: BuiltApp;
  base: string;
  close: () => Promise<void>;
}

export async function startApp(): Promise<TestEnv> {
  // Each worker inherits env from global-setup via process.env (vitest passes it through).
  const cfg = loadConfig({ ...process.env, API_PUBLIC_URL: 'http://localhost:0' });
  const built = await buildApp(cfg, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (built.app.server.address() as AddressInfo).port;
  return { built, base: `http://127.0.0.1:${port}`, close: () => built.close() };
}

export class Client {
  token = '';
  user: { id: string; username: string } = { id: '', username: '' };
  socket?: Socket;
  events: Array<{ event: string; data: any }> = [];
  constructor(private base: string) {}

  async req(method: string, path: string, body?: unknown, expect?: number) {
    const res = await fetch(this.base + '/api' + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (expect !== undefined && res.status !== expect) throw new Error(`${method} ${path} → ${res.status} (esperado ${expect}): ${text}`);
    return { status: res.status, data };
  }

  async register(username: string, password = 'senha-forte-123') {
    const r = await this.req('POST', '/auth/register', { email: `${username}@teste.dev`, username, password }, 201);
    this.token = r.data.token;
    this.user = r.data.user;
    return r.data;
  }

  connect(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.socket = ioc(this.base, { auth: { token: this.token }, transports: ['websocket'], reconnection: false });
      this.socket.onAny((event, data) => this.events.push({ event, data }));
      this.socket.once('ready', resolve);
      this.socket.once('connect_error', reject);
    });
  }

  waitFor(event: string, pred: (d: any) => boolean = () => true, timeout = 5000): Promise<any> {
    const found = this.events.find((e) => e.event === event && pred(e.data));
    if (found) return Promise.resolve(found.data);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.socket?.off(event, h);
        reject(new Error(`timeout esperando ${event}`));
      }, timeout);
      const h = (d: any) => {
        if (pred(d)) {
          clearTimeout(t);
          this.socket?.off(event, h);
          resolve(d);
        }
      };
      this.socket!.on(event, h);
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
