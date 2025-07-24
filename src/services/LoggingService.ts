/**
 * 📝 LOGGING SERVICE FOR AI MODULES
 * 
 * Comprehensive logging for all API requests, responses, and system events.
 * Logs are saved to files in the /logs directory for debugging and monitoring.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'API_REQUEST' | 'API_RESPONSE';
  service: string;
  message: string;
  data?: any;
  userId?: string;
  requestId?: string;
  duration?: number;
  cost?: number;
}

export class LoggingService {
  private logsDir: string;
  private logQueue: LogEntry[] = [];
  private isProcessing = false;

  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFileName(type: string): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `${type}-${date}.log`);
  }

  private async writeLog(entry: LogEntry): Promise<void> {
    const logLine = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString()
    }) + '\n';

    try {
      // Write to combined log
      await fs.promises.appendFile(
        path.join(this.logsDir, 'ai-modules-combined.log'),
        logLine
      );

      // Write to specific log files based on level
      if (entry.level === 'API_REQUEST' || entry.level === 'API_RESPONSE') {
        await fs.promises.appendFile(
          path.join(this.logsDir, 'api-requests.log'),
          logLine
        );
      }

      if (entry.level === 'ERROR') {
        await fs.promises.appendFile(
          path.join(this.logsDir, 'ai-modules-error.log'),
          logLine
        );
      }

      // Write to daily log file
      const dailyLogFile = this.getLogFileName('ai-modules');
      await fs.promises.appendFile(dailyLogFile, logLine);

    } catch (error) {
      console.error('Failed to write log entry:', error);
    }
  }

  private async processLogQueue(): Promise<void> {
    if (this.isProcessing || this.logQueue.length === 0) return;

    this.isProcessing = true;
    const entries = [...this.logQueue];
    this.logQueue = [];

    for (const entry of entries) {
      await this.writeLog(entry);
    }

    this.isProcessing = false;

    // Process any new entries that came in while processing
    if (this.logQueue.length > 0) {
      setTimeout(() => this.processLogQueue(), 0);
    }
  }

  private queueLog(entry: LogEntry): void {
    this.logQueue.push(entry);
    this.processLogQueue();
  }

  // Public logging methods
  info(service: string, message: string, data?: any, userId?: string): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service,
      message,
      data,
      userId
    });
  }

  warn(service: string, message: string, data?: any, userId?: string): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      service,
      message,
      data,
      userId
    });
  }

  error(service: string, message: string, error?: any, userId?: string): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service,
      message,
      data: error ? { 
        name: error.name, 
        message: error.message, 
        stack: error.stack 
      } : undefined,
      userId
    });
  }

  debug(service: string, message: string, data?: any, userId?: string): void {
    if (process.env.NODE_ENV === 'development') {
      this.queueLog({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        service,
        message,
        data,
        userId
      });
    }
  }

  // API request/response logging
  logApiRequest(
    service: string,
    endpoint: string,
    method: string,
    requestData: any,
    userId?: string,
    requestId?: string
  ): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'API_REQUEST',
      service,
      message: `${method} ${endpoint}`,
      data: {
        endpoint,
        method,
        requestData: this.sanitizeData(requestData),
        requestId
      },
      userId,
      requestId
    });
  }

  logApiResponse(
    service: string,
    endpoint: string,
    method: string,
    responseData: any,
    statusCode: number,
    duration: number,
    cost?: number,
    userId?: string,
    requestId?: string
  ): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'API_RESPONSE',
      service,
      message: `${method} ${endpoint} - ${statusCode} (${duration}ms)`,
      data: {
        endpoint,
        method,
        statusCode,
        responseData: this.sanitizeData(responseData),
        duration,
        cost,
        requestId
      },
      userId,
      requestId,
      duration,
      cost
    });
  }

  // Performance logging
  logPerformance(
    service: string,
    operation: string,
    duration: number,
    data?: any,
    userId?: string
  ): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service,
      message: `Performance: ${operation} - ${duration}ms`,
      data: { operation, duration, ...data },
      userId
    });
  }

  // Cost tracking
  logCost(
    service: string,
    operation: string,
    cost: number,
    tokensUsed?: number,
    userId?: string
  ): void {
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service,
      message: `Cost: ${operation} - $${cost.toFixed(4)}`,
      data: { operation, cost, tokensUsed },
      userId
    });
  }

  // Sanitize sensitive data
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remove sensitive fields
    const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'key'];
    
    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitizeObject(value);
        }
      }
      return result;
    };

    return sanitizeObject(sanitized);
  }

  // Get log statistics
  async getLogStats(): Promise<any> {
    try {
      const combinedLogPath = path.join(this.logsDir, 'ai-modules-combined.log');
      if (!fs.existsSync(combinedLogPath)) {
        return { totalEntries: 0, errors: 0, apiRequests: 0 };
      }

      const logContent = await fs.promises.readFile(combinedLogPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      const stats = {
        totalEntries: lines.length,
        errors: 0,
        apiRequests: 0,
        today: 0
      };

      const today = new Date().toISOString().split('T')[0];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.level === 'ERROR') stats.errors++;
          if (entry.level === 'API_REQUEST') stats.apiRequests++;
          if (entry.timestamp?.startsWith(today)) stats.today++;
        } catch (e) {
          // Skip malformed log entries
        }
      }

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return { totalEntries: 0, errors: 0, apiRequests: 0 };
    }
  }

  // Clear old log files (keep last 7 days)
  async cleanupOldLogs(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.logsDir);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logsDir, file);
          const stats = await fs.promises.stat(filePath);
          
          if (stats.mtime < sevenDaysAgo) {
            await fs.promises.unlink(filePath);
            console.log(`Cleaned up old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }
}

// Export singleton instance
export const logger = new LoggingService(); 