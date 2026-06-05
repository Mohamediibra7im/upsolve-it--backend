import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async check(): Promise<{ status: string; timestamp: string; checks: Record<string, unknown> }> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkMemory(),
    ]);

    const results = checks.map((check, index) => {
      const names = ['database', 'memory'];
      return { name: names[index], ...(check.status === 'fulfilled' ? { status: 'up', ...check.value } : { status: 'down', error: check.reason?.message }) };
    });

    const allUp = results.every((r) => r.status === 'up');

    return {
      status: allUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: Object.fromEntries(results.map((r) => [r.name, r])),
    };
  }

  async ready(): Promise<{ status: string; timestamp: string }> {
    const health = await this.check();
    if (health.status === 'healthy') {
      return { status: 'ready', timestamp: new Date().toISOString() };
    }
    throw new Error('Service not ready');
  }

  live(): { status: string; timestamp: string } {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  private async checkDatabase(): Promise<{ latency: number }> {
    const start = Date.now();
    if (!this.connection.db) {
      throw new Error('Database connection not established');
    }
    await this.connection.db.admin().ping();
    return { latency: Date.now() - start };
  }

  private checkMemory(): { used: number; total: number; percentage: number } {
    const used = process.memoryUsage().heapUsed;
    const total = process.memoryUsage().heapTotal;
    return { used, total, percentage: Math.round((used / total) * 100) };
  }
}