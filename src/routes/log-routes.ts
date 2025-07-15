import express from 'express';
import { apiLogger } from '../services/APILogger';
import { LogViewer } from '../utils/LogViewer';

const router = express.Router();

/**
 * 📊 GET /api/logs/dashboard
 * 
 * Returns performance dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const timeRange = req.query.timeRange as 'hour' | 'day' | 'week' || 'day';
    const report = apiLogger.generatePerformanceReport(timeRange);
    
    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate dashboard',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🔍 GET /api/logs/search
 * 
 * Search logs with filters
 */
router.get('/search', async (req, res) => {
  try {
    const { service, method, userId, success, startTime, endTime, limit = 50 } = req.query;
    
    const criteria: any = {};
    if (service) criteria.service = service;
    if (method) criteria.method = method;
    if (userId) criteria.userId = userId;
    if (success !== undefined) criteria.success = success === 'true';
    if (startTime && endTime) {
      criteria.timeRange = { start: startTime, end: endTime };
    }
    
    const logs = apiLogger.searchLogs(criteria);
    const limitedLogs = logs.slice(0, parseInt(limit as string));
    
    res.json({
      success: true,
      data: {
        logs: limitedLogs,
        total: logs.length,
        limit: parseInt(limit as string),
        criteria
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to search logs',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 📝 GET /api/logs/detail/:requestId
 * 
 * Get detailed log entry
 */
router.get('/detail/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const logs = apiLogger.searchLogs({});
    const log = logs.find(l => l.requestId === requestId);
    
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log entry not found',
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: log,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get log detail',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 📈 GET /api/logs/analytics
 * 
 * Get analytics data
 */
router.get('/analytics', async (req, res) => {
  try {
    const timeRange = req.query.timeRange as 'hour' | 'day' | 'week' || 'day';
    const analytics = LogViewer.generateAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate analytics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 📊 GET /api/logs/export
 * 
 * Export logs as CSV
 */
router.get('/export', async (req, res) => {
  try {
    const { service, method, userId, success, startTime, endTime } = req.query;
    
    const criteria: any = {};
    if (service) criteria.service = service;
    if (method) criteria.method = method;
    if (userId) criteria.userId = userId;
    if (success !== undefined) criteria.success = success === 'true';
    if (startTime && endTime) {
      criteria.timeRange = { start: startTime, end: endTime };
    }
    
    const logs = apiLogger.searchLogs(criteria);
    
    // Create CSV content
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
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="api-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to export logs',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🧹 POST /api/logs/clean
 * 
 * Clean old logs
 */
router.post('/clean', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    
    const beforeCount = apiLogger.searchLogs({}).length;
    apiLogger.cleanOldLogs(days);
    const afterCount = apiLogger.searchLogs({}).length;
    
    res.json({
      success: true,
      data: {
        daysToKeep: days,
        beforeCount,
        afterCount,
        removedCount: beforeCount - afterCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to clean logs',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🔄 GET /api/logs/live
 * 
 * Get live log stream (last 10 entries)
 */
router.get('/live', async (req, res) => {
  try {
    const logs = apiLogger.searchLogs({});
    const latestLogs = logs.slice(0, 10);
    
    res.json({
      success: true,
      data: {
        logs: latestLogs,
        total: logs.length,
        sessionId: (apiLogger as any).sessionId
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get live logs',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 