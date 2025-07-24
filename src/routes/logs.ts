/**
 * 📝 LOGS ROUTE FOR AI MODULES
 * 
 * Provides endpoints to view and manage log files
 */

import { Router } from 'express';
import { logger } from '../services/LoggingService';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// 🔐 SECURITY: Admin authentication middleware
const requireAdminAuth = (req: any, res: any, next: any) => {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const providedToken = req.headers['x-admin-token'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!adminToken) {
    logger.warn('LogsAPI', 'Admin token not configured - allowing all access', { ip: req.ip });
    return next(); // Allow access if no admin token configured
  }
  
  if (!providedToken || providedToken !== adminToken) {
    logger.warn('LogsAPI', 'Unauthorized access attempt', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      providedToken: providedToken ? '[REDACTED]' : 'none'
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized access to logs API',
      message: 'Admin authentication required'
    });
  }
  
  logger.info('LogsAPI', 'Admin access granted', { ip: req.ip });
  next();
};

// Apply admin auth to all routes
router.use(requireAdminAuth);

/**
 * GET /logs/stats
 * Get log statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await logger.getLogStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get log stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /logs/recent
 * Get recent log entries
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 50, level } = req.query;
    const logPath = path.join(process.cwd(), 'logs', 'ai-modules-combined.log');
    
    if (!fs.existsSync(logPath)) {
      return res.json({
        success: true,
        logs: [],
        total: 0
      });
    }

    const logContent = await fs.promises.readFile(logPath, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    let logs = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // Most recent first

    // Filter by level if specified
    if (level && level !== 'all') {
      logs = logs.filter(log => log.level === level);
    }

    // Limit results
    logs = logs.slice(0, parseInt(limit as string) || 50);

    res.json({
      success: true,
      logs,
      total: logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get recent logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /logs/api-requests
 * Get API request logs
 */
router.get('/api-requests', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logPath = path.join(process.cwd(), 'logs', 'api-requests.log');
    
    if (!fs.existsSync(logPath)) {
      return res.json({
        success: true,
        requests: [],
        total: 0
      });
    }

    const logContent = await fs.promises.readFile(logPath, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    const requests = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse() // Most recent first
      .slice(0, parseInt(limit as string) || 100);

    res.json({
      success: true,
      requests,
      total: requests.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get API request logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /logs/cleanup
 * Clean up old log files
 */
router.post('/cleanup', async (req, res) => {
  try {
    await logger.cleanupOldLogs();
    res.json({
      success: true,
      message: 'Log cleanup completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /logs/files
 * List available log files
 */
router.get('/files', async (req, res) => {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(logsDir)) {
      return res.json({
        success: true,
        files: []
      });
    }

    const files = await fs.promises.readdir(logsDir);
    const fileStats = await Promise.all(
      files
        .filter(file => file.endsWith('.log'))
        .map(async file => {
          const filePath = path.join(logsDir, file);
          const stats = await fs.promises.stat(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            sizeFormatted: formatFileSize(stats.size)
          };
        })
    );

    res.json({
      success: true,
      files: fileStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list log files',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router; 