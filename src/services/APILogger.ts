import fs from 'fs';
import path from 'path';

export interface APILogEntry {
  timestamp: string;
  sessionId: string;
  requestId: string;
  service: string;
  method: string;
  request: {
    prompt: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
    context?: any;
  };
  response?: {
    content: string;
    tokensUsed?: number;
    finishReason?: string;
    processingTimeMs: number;
    success: boolean;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata: {
    userId?: string;
    userProfile?: any;
    transactionCount?: number;
    costEstimate?: number;
  };
}

export class APILogger {
  private logDir: string;
  private logFile: string;
  private errorLogFile: string;
  private sessionId: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'api-requests.log');
    this.errorLogFile = path.join(this.logDir, 'api-errors.log');
    this.sessionId = this.generateSessionId();
    
    // Create logs directory if it doesn't exist
    this.ensureLogDirectory();
  }

  /**
   * 🔍 Log API Request Start
   */
  logRequest(
    service: string,
    method: string,
    prompt: string,
    config: any,
    metadata: any = {}
  ): string {
    const requestId = this.generateRequestId();
    const timestamp = new Date().toISOString();
    
    const logEntry: Partial<APILogEntry> = {
      timestamp,
      sessionId: this.sessionId,
      requestId,
      service,
      method,
      request: {
        prompt: this.sanitizePrompt(prompt),
        model: config.model || 'gpt-3.5-turbo',
        maxTokens: config.maxTokens || 1000,
        temperature: config.temperature || 0.7,
        context: metadata.context
      },
      metadata: {
        userId: metadata.userId,
        userProfile: metadata.userProfile,
        transactionCount: metadata.transactionCount,
        costEstimate: metadata.costEstimate
      }
    };

    this.writeToLog(logEntry);
    
    console.log(`📝 API Request logged: ${service}.${method} [${requestId}]`);
    return requestId;
  }

  /**
   * ✅ Log API Response Success
   */
  logResponse(
    requestId: string,
    response: any,
    processingTimeMs: number,
    tokensUsed?: number
  ): void {
    const timestamp = new Date().toISOString();
    
    const logEntry: Partial<APILogEntry> = {
      timestamp,
      sessionId: this.sessionId,
      requestId,
      response: {
        content: this.sanitizeResponse(response),
        tokensUsed,
        processingTimeMs,
        success: true,
        finishReason: 'completed'
      }
    };

    this.writeToLog(logEntry);
    
    console.log(`✅ API Response logged: [${requestId}] ${processingTimeMs}ms`);
  }

  /**
   * ❌ Log API Error
   */
  logError(
    requestId: string,
    error: Error,
    processingTimeMs: number
  ): void {
    const timestamp = new Date().toISOString();
    
    const logEntry: Partial<APILogEntry> = {
      timestamp,
      sessionId: this.sessionId,
      requestId,
      response: {
        content: '',
        processingTimeMs,
        success: false
      },
      error: {
        message: error.message,
        code: (error as any).code || 'unknown',
        stack: error.stack
      }
    };

    this.writeToLog(logEntry);
    this.writeToErrorLog(logEntry);
    
    console.error(`❌ API Error logged: [${requestId}] ${error.message}`);
  }

  /**
   * 📊 Generate Performance Report
   */
  generatePerformanceReport(timeRange: 'hour' | 'day' | 'week' = 'day'): any {
    const logs = this.readLogs(timeRange);
    
    const report = {
      timeRange,
      totalRequests: logs.length,
      successfulRequests: logs.filter(l => l.response?.success).length,
      failedRequests: logs.filter(l => l.error).length,
      averageProcessingTime: this.calculateAverageProcessingTime(logs),
      totalTokensUsed: logs.reduce((sum, l) => sum + (l.response?.tokensUsed || 0), 0),
      estimatedCost: logs.reduce((sum, l) => sum + (l.metadata.costEstimate || 0), 0),
      serviceBreakdown: this.calculateServiceBreakdown(logs),
      errorBreakdown: this.calculateErrorBreakdown(logs),
      timestamp: new Date().toISOString()
    };

    // Save report to file
    const reportFile = path.join(this.logDir, `performance-report-${timeRange}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    return report;
  }

  /**
   * 🔍 Search Logs by Criteria
   */
  searchLogs(criteria: {
    service?: string;
    method?: string;
    userId?: string;
    success?: boolean;
    timeRange?: { start: string; end: string };
  }): APILogEntry[] {
    const logs = this.readAllLogs();
    
    return logs.filter(log => {
      if (criteria.service && log.service !== criteria.service) return false;
      if (criteria.method && log.method !== criteria.method) return false;
      if (criteria.userId && log.metadata.userId !== criteria.userId) return false;
      if (criteria.success !== undefined && log.response?.success !== criteria.success) return false;
      
      if (criteria.timeRange) {
        const logTime = new Date(log.timestamp).getTime();
        const startTime = new Date(criteria.timeRange.start).getTime();
        const endTime = new Date(criteria.timeRange.end).getTime();
        if (logTime < startTime || logTime > endTime) return false;
      }
      
      return true;
    });
  }

  /**
   * 🧹 Clean Old Logs
   */
  cleanOldLogs(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const logs = this.readAllLogs();
    const filteredLogs = logs.filter(log => 
      new Date(log.timestamp) > cutoffDate
    );
    
    // Rewrite log file with filtered logs
    const logData = filteredLogs.map(log => JSON.stringify(log)).join('\n');
    fs.writeFileSync(this.logFile, logData);
    
    console.log(`🧹 Cleaned logs older than ${daysToKeep} days. Kept ${filteredLogs.length} entries.`);
  }

  // Private helper methods
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizePrompt(prompt: string): string {
    // Truncate very long prompts for logging
    if (prompt.length > 2000) {
      return prompt.substring(0, 2000) + '... [truncated]';
    }
    return prompt;
  }

  private sanitizeResponse(response: any): string {
    try {
      const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
      if (responseStr.length > 2000) {
        return responseStr.substring(0, 2000) + '... [truncated]';
      }
      return responseStr;
    } catch (error) {
      return '[Unable to serialize response]';
    }
  }

  private writeToLog(logEntry: Partial<APILogEntry>): void {
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.logFile, logLine);
  }

  private writeToErrorLog(logEntry: Partial<APILogEntry>): void {
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.errorLogFile, logLine);
  }

  private readLogs(timeRange: string): APILogEntry[] {
    const logs = this.readAllLogs();
    const now = new Date();
    const cutoffTime = new Date();
    
    switch (timeRange) {
      case 'hour':
        cutoffTime.setHours(now.getHours() - 1);
        break;
      case 'day':
        cutoffTime.setDate(now.getDate() - 1);
        break;
      case 'week':
        cutoffTime.setDate(now.getDate() - 7);
        break;
    }
    
    return logs.filter(log => new Date(log.timestamp) > cutoffTime);
  }

  private readAllLogs(): APILogEntry[] {
    if (!fs.existsSync(this.logFile)) {
      return [];
    }
    
    const logData = fs.readFileSync(this.logFile, 'utf8');
    const lines = logData.split('\n').filter(line => line.trim());
    
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.warn('Failed to parse log line:', line);
        return null;
      }
    }).filter(log => log !== null);
  }

  private calculateAverageProcessingTime(logs: APILogEntry[]): number {
    const successfulLogs = logs.filter(l => l.response?.success && l.response.processingTimeMs);
    if (successfulLogs.length === 0) return 0;
    
    const totalTime = successfulLogs.reduce((sum, l) => sum + l.response!.processingTimeMs, 0);
    return Math.round(totalTime / successfulLogs.length);
  }

  private calculateServiceBreakdown(logs: APILogEntry[]): any {
    const breakdown: any = {};
    
    logs.forEach(log => {
      const key = `${log.service}.${log.method}`;
      if (!breakdown[key]) {
        breakdown[key] = { count: 0, successRate: 0, avgProcessingTime: 0 };
      }
      breakdown[key].count++;
    });
    
    return breakdown;
  }

  private calculateErrorBreakdown(logs: APILogEntry[]): any {
    const errors = logs.filter(l => l.error);
    const breakdown: any = {};
    
    errors.forEach(log => {
      const errorCode = log.error!.code || 'unknown';
      if (!breakdown[errorCode]) {
        breakdown[errorCode] = { count: 0, messages: [] };
      }
      breakdown[errorCode].count++;
      if (!breakdown[errorCode].messages.includes(log.error!.message)) {
        breakdown[errorCode].messages.push(log.error!.message);
      }
    });
    
    return breakdown;
  }
}

// Export singleton instance
export const apiLogger = new APILogger(); 