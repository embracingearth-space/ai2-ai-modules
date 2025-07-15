import { apiLogger, APILogEntry } from '../services/APILogger';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

export interface LogAnalytics {
  totalRequests: number;
  successRate: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  estimatedCost: number;
  topErrors: Array<{ error: string; count: number }>;
  serviceUsage: Array<{ service: string; count: number; avgTime: number }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

export class LogViewer {
  
  /**
   * 📊 Display Performance Dashboard
   */
  static displayDashboard(timeRange: 'hour' | 'day' | 'week' = 'day'): void {
    console.log(chalk.cyan('\n🚀 AI2 API Performance Dashboard'));
    console.log(chalk.gray('=' .repeat(50)));
    
    const report = apiLogger.generatePerformanceReport(timeRange);
    
    console.log(chalk.green(`📈 ${timeRange.toUpperCase()} OVERVIEW`));
    console.log(`  Total Requests: ${chalk.yellow(report.totalRequests)}`);
    console.log(`  Success Rate: ${chalk.green(((report.successfulRequests / report.totalRequests) * 100).toFixed(1))}%`);
    console.log(`  Failed Requests: ${chalk.red(report.failedRequests)}`);
    console.log(`  Avg Response Time: ${chalk.blue(report.averageProcessingTime)}ms`);
    console.log(`  Total Tokens Used: ${chalk.magenta(report.totalTokensUsed.toLocaleString())}`);
    console.log(`  Estimated Cost: ${chalk.yellow('$' + report.estimatedCost.toFixed(2))}`);
    
    if (Object.keys(report.serviceBreakdown).length > 0) {
      console.log(chalk.green('\n📊 SERVICE BREAKDOWN'));
      Object.entries(report.serviceBreakdown).forEach(([service, data]: [string, any]) => {
        console.log(`  ${service}: ${chalk.yellow(data.count)} requests`);
      });
    }
    
    if (Object.keys(report.errorBreakdown).length > 0) {
      console.log(chalk.red('\n❌ ERROR BREAKDOWN'));
      Object.entries(report.errorBreakdown).forEach(([error, data]: [string, any]) => {
        console.log(`  ${error}: ${chalk.red(data.count)} occurrences`);
        data.messages.slice(0, 2).forEach((msg: string) => {
          console.log(`    - ${chalk.gray(msg.substring(0, 60))}...`);
        });
      });
    }
    
    console.log(chalk.gray('\n' + '=' .repeat(50)));
  }
  
  /**
   * 🔍 Search and Display Logs
   */
  static searchLogs(criteria: {
    service?: string;
    method?: string;
    userId?: string;
    success?: boolean;
    timeRange?: { start: string; end: string };
  }, limit: number = 10): void {
    console.log(chalk.cyan('\n🔍 Search Results'));
    console.log(chalk.gray('=' .repeat(50)));
    
    const logs = apiLogger.searchLogs(criteria).slice(0, limit);
    
    if (logs.length === 0) {
      console.log(chalk.yellow('No logs found matching criteria.'));
      return;
    }
    
    logs.forEach((log, index) => {
      const status = log.response?.success ? chalk.green('✅ SUCCESS') : chalk.red('❌ FAILED');
      const time = new Date(log.timestamp).toLocaleString();
      const duration = log.response?.processingTimeMs || 0;
      
      console.log(chalk.blue(`\n[${index + 1}] ${log.service}.${log.method} ${status}`));
      console.log(`    Time: ${chalk.gray(time)}`);
      console.log(`    Duration: ${chalk.yellow(duration)}ms`);
      console.log(`    Request ID: ${chalk.magenta(log.requestId)}`);
      
      if (log.metadata.userId) {
        console.log(`    User: ${chalk.cyan(log.metadata.userId)}`);
      }
      
      if (log.metadata.transactionCount) {
        console.log(`    Transactions: ${chalk.yellow(log.metadata.transactionCount)}`);
      }
      
      if (log.response?.tokensUsed) {
        console.log(`    Tokens Used: ${chalk.magenta(log.response.tokensUsed)}`);
      }
      
      if (log.error) {
        console.log(`    Error: ${chalk.red(log.error.message)}`);
      }
    });
    
    console.log(chalk.gray('\n' + '=' .repeat(50)));
  }
  
  /**
   * 📝 Display Detailed Log Entry
   */
  static displayLogDetail(requestId: string): void {
    const logs = apiLogger.searchLogs({});
    const log = logs.find(l => l.requestId === requestId);
    
    if (!log) {
      console.log(chalk.red(`❌ Log entry not found: ${requestId}`));
      return;
    }
    
    console.log(chalk.cyan(`\n📝 Log Entry Detail: ${requestId}`));
    console.log(chalk.gray('=' .repeat(60)));
    
    console.log(chalk.blue('🔍 REQUEST DETAILS'));
    console.log(`  Service: ${chalk.yellow(log.service)}`);
    console.log(`  Method: ${chalk.yellow(log.method)}`);
    console.log(`  Timestamp: ${chalk.gray(new Date(log.timestamp).toLocaleString())}`);
    console.log(`  Session: ${chalk.magenta(log.sessionId)}`);
    
    console.log(chalk.blue('\n📊 CONFIGURATION'));
    console.log(`  Model: ${chalk.yellow(log.request.model)}`);
    console.log(`  Max Tokens: ${chalk.yellow(log.request.maxTokens)}`);
    console.log(`  Temperature: ${chalk.yellow(log.request.temperature)}`);
    
    console.log(chalk.blue('\n💬 PROMPT'));
    console.log(chalk.gray(this.formatPrompt(log.request.prompt)));
    
    if (log.response?.success) {
      console.log(chalk.green('\n✅ RESPONSE'));
      console.log(`  Processing Time: ${chalk.yellow(log.response.processingTimeMs)}ms`);
      console.log(`  Tokens Used: ${chalk.magenta(log.response.tokensUsed || 'N/A')}`);
      console.log(`  Finish Reason: ${chalk.blue(log.response.finishReason)}`);
      console.log('\n  Content:');
      console.log(chalk.gray(this.formatResponse(log.response.content)));
    }
    
    if (log.error) {
      console.log(chalk.red('\n❌ ERROR'));
      console.log(`  Message: ${chalk.red(log.error.message)}`);
      console.log(`  Code: ${chalk.yellow(log.error.code)}`);
      if (log.error.stack) {
        console.log(`  Stack: ${chalk.gray(log.error.stack.split('\n').slice(0, 3).join('\n'))}`);
      }
    }
    
    if (log.metadata.userId) {
      console.log(chalk.blue('\n👤 METADATA'));
      console.log(`  User ID: ${chalk.cyan(log.metadata.userId)}`);
      console.log(`  Transaction Count: ${chalk.yellow(log.metadata.transactionCount || 'N/A')}`);
      console.log(`  Cost Estimate: ${chalk.yellow('$' + (log.metadata.costEstimate || 0).toFixed(3))}`);
    }
    
    console.log(chalk.gray('\n' + '=' .repeat(60)));
  }
  
  /**
   * 📈 Generate Analytics Report
   */
  static generateAnalytics(timeRange: 'hour' | 'day' | 'week' = 'day'): LogAnalytics {
    const logs = apiLogger.searchLogs({});
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
    
    const filteredLogs = logs.filter(log => new Date(log.timestamp) > cutoffTime);
    
    const analytics: LogAnalytics = {
      totalRequests: filteredLogs.length,
      successRate: filteredLogs.filter(l => l.response?.success).length / filteredLogs.length,
      averageResponseTime: this.calculateAverageResponseTime(filteredLogs),
      totalTokensUsed: filteredLogs.reduce((sum, l) => sum + (l.response?.tokensUsed || 0), 0),
      estimatedCost: filteredLogs.reduce((sum, l) => sum + (l.metadata.costEstimate || 0), 0),
      topErrors: this.calculateTopErrors(filteredLogs),
      serviceUsage: this.calculateServiceUsage(filteredLogs),
      hourlyDistribution: this.calculateHourlyDistribution(filteredLogs)
    };
    
    return analytics;
  }
  
  /**
   * 📊 Export Logs to CSV
   */
  static exportToCSV(filename: string, criteria: any = {}): void {
    const logs = apiLogger.searchLogs(criteria);
    const csvHeader = 'Timestamp,Service,Method,Success,Duration(ms),Tokens,Cost,Error\n';
    
    const csvRows = logs.map(log => {
      const timestamp = log.timestamp;
      const service = log.service;
      const method = log.method;
      const success = log.response?.success ? 'TRUE' : 'FALSE';
      const duration = log.response?.processingTimeMs || 0;
      const tokens = log.response?.tokensUsed || 0;
      const cost = log.metadata.costEstimate || 0;
      const error = log.error?.message || '';
      
      return `${timestamp},${service},${method},${success},${duration},${tokens},${cost},"${error}"`;
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    const exportPath = path.join(process.cwd(), 'logs', filename);
    
    fs.writeFileSync(exportPath, csvContent);
    console.log(chalk.green(`📊 Exported ${logs.length} log entries to: ${exportPath}`));
  }
  
  /**
   * 🧹 Clean Old Logs
   */
  static cleanOldLogs(daysToKeep: number = 30): void {
    console.log(chalk.cyan(`\n🧹 Cleaning logs older than ${daysToKeep} days...`));
    apiLogger.cleanOldLogs(daysToKeep);
  }
  
  // Private helper methods
  private static formatPrompt(prompt: string): string {
    return prompt.length > 500 ? prompt.substring(0, 500) + '...' : prompt;
  }
  
  private static formatResponse(response: string): string {
    try {
      const parsed = JSON.parse(response);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return response.length > 500 ? response.substring(0, 500) + '...' : response;
    }
  }
  
  private static calculateAverageResponseTime(logs: APILogEntry[]): number {
    const successfulLogs = logs.filter(l => l.response?.success && l.response.processingTimeMs);
    if (successfulLogs.length === 0) return 0;
    
    const totalTime = successfulLogs.reduce((sum, l) => sum + l.response!.processingTimeMs, 0);
    return Math.round(totalTime / successfulLogs.length);
  }
  
  private static calculateTopErrors(logs: APILogEntry[]): Array<{ error: string; count: number }> {
    const errorCounts: { [key: string]: number } = {};
    
    logs.filter(l => l.error).forEach(log => {
      const errorMsg = log.error!.message;
      errorCounts[errorMsg] = (errorCounts[errorMsg] || 0) + 1;
    });
    
    return Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
  
  private static calculateServiceUsage(logs: APILogEntry[]): Array<{ service: string; count: number; avgTime: number }> {
    const serviceStats: { [key: string]: { count: number; totalTime: number } } = {};
    
    logs.forEach(log => {
      const service = `${log.service}.${log.method}`;
      if (!serviceStats[service]) {
        serviceStats[service] = { count: 0, totalTime: 0 };
      }
      serviceStats[service].count++;
      serviceStats[service].totalTime += log.response?.processingTimeMs || 0;
    });
    
    return Object.entries(serviceStats)
      .map(([service, stats]) => ({
        service,
        count: stats.count,
        avgTime: Math.round(stats.totalTime / stats.count)
      }))
      .sort((a, b) => b.count - a.count);
  }
  
  private static calculateHourlyDistribution(logs: APILogEntry[]): Array<{ hour: number; count: number }> {
    const hourCounts: { [key: number]: number } = {};
    
    logs.forEach(log => {
      const hour = new Date(log.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    return Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);
  }
}

// Export CLI commands
export const LogViewerCLI = {
  /**
   * 📊 Show Dashboard
   */
  dashboard: (timeRange: 'hour' | 'day' | 'week' = 'day') => {
    LogViewer.displayDashboard(timeRange);
  },
  
  /**
   * 🔍 Search Logs
   */
  search: (criteria: any, limit: number = 10) => {
    LogViewer.searchLogs(criteria, limit);
  },
  
  /**
   * 📝 Show Log Detail
   */
  detail: (requestId: string) => {
    LogViewer.displayLogDetail(requestId);
  },
  
  /**
   * 📊 Export to CSV
   */
  export: (filename: string, criteria: any = {}) => {
    LogViewer.exportToCSV(filename, criteria);
  },
  
  /**
   * 🧹 Clean Old Logs
   */
  clean: (days: number = 30) => {
    LogViewer.cleanOldLogs(days);
  }
}; 