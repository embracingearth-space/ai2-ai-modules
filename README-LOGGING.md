# 📝 AI2 API Logging System

A comprehensive logging system that records all OpenAI API requests and responses for debugging, monitoring, and cost analysis.

## 🚀 Features

- **Complete Request/Response Logging**: Captures prompts, responses, tokens, and timing
- **Performance Analytics**: Success rates, average response times, cost tracking
- **Error Tracking**: Detailed error logging with stack traces
- **Search & Filter**: Find specific logs by service, method, user, or time range
- **Export Capabilities**: Export logs to CSV for analysis
- **CLI Tools**: Command-line interface for log management
- **HTTP API**: REST endpoints for frontend integration
- **Automatic Cleanup**: Configurable log retention policies

## 📁 Log Files

Logs are stored in `ai2-ai-modules/logs/`:

- `api-requests.log` - All API requests and responses
- `api-errors.log` - Error-only logs for quick debugging
- `performance-report-*.json` - Generated performance reports

## 🔧 Usage

### CLI Commands

```bash
# Show performance dashboard
node log-viewer.js dashboard day

# Search logs
node log-viewer.js search OpenAIService analyzeTransaction

# View detailed log entry
node log-viewer.js detail req_1234567890_abcdef

# Export logs to CSV
node log-viewer.js export my-analysis.csv

# Clean old logs
node log-viewer.js clean 7
```

### HTTP API Endpoints

```
GET /api/logs/dashboard?timeRange=day     # Performance dashboard
GET /api/logs/search?service=OpenAIService&limit=50  # Search logs
GET /api/logs/detail/:requestId           # Detailed log entry
GET /api/logs/analytics?timeRange=week    # Analytics data
GET /api/logs/export                      # Export CSV
POST /api/logs/clean                      # Clean old logs
GET /api/logs/live                        # Live log stream
```

### Programmatic Usage

```typescript
import { apiLogger, LogViewer } from './services/APILogger';

// Log a request
const requestId = apiLogger.logRequest(
  'OpenAIService', 
  'analyzeTransaction', 
  prompt, 
  config, 
  metadata
);

// Log response
apiLogger.logResponse(requestId, response, processingTime, tokensUsed);

// Log error
apiLogger.logError(requestId, error, processingTime);

// Generate analytics
const analytics = LogViewer.generateAnalytics('day');

// Search logs
const logs = apiLogger.searchLogs({ service: 'OpenAIService' });
```

## 📊 Log Entry Structure

Each log entry contains:

```typescript
interface APILogEntry {
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
```

## 📈 Analytics & Monitoring

### Performance Metrics

- **Success Rate**: Percentage of successful API calls
- **Average Response Time**: Mean processing time in milliseconds
- **Token Usage**: Total tokens consumed and cost estimates
- **Error Breakdown**: Common errors and their frequencies
- **Service Usage**: Which services are called most frequently
- **Hourly Distribution**: Usage patterns throughout the day

### Cost Tracking

The system tracks estimated costs for each API call:

```typescript
// Cost estimates per operation
const costEstimates = {
  'analyzeTransaction': 0.025,
  'queryTransactions': 0.03,
  'generateUserProfile': 0.05,
  'analyzeTaxDeductibility': 0.04
};
```

## 🔍 Debugging Examples

### Find Failed Requests

```bash
# CLI
node log-viewer.js search "" "" 20

# HTTP API
GET /api/logs/search?success=false&limit=20
```

### Analyze Performance Issues

```bash
# Show dashboard with performance metrics
node log-viewer.js dashboard day

# Find slow requests (>2000ms)
# Use search and filter by processing time
```

### Export for Analysis

```bash
# Export last 7 days of logs
node log-viewer.js export analysis-week.csv

# Export specific service logs
GET /api/logs/export?service=OpenAIService&method=analyzeTransaction
```

## 🛠️ Configuration

### Environment Variables

```bash
# Log retention (days)
LOG_RETENTION_DAYS=30

# Maximum log file size (MB)
MAX_LOG_FILE_SIZE=100

# Enable/disable logging
ENABLE_API_LOGGING=true
```

### Automatic Cleanup

Logs are automatically cleaned based on retention policy:

```typescript
// Clean logs older than 30 days
apiLogger.cleanOldLogs(30);

// Runs daily via cron job
setInterval(() => {
  apiLogger.cleanOldLogs(30);
}, 24 * 60 * 60 * 1000); // Daily
```

## 📚 Log Analysis Examples

### Example 1: Transaction Analysis Performance

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "OpenAIService",
  "method": "analyzeTransaction",
  "request": {
    "prompt": "You are a financial AI assistant...",
    "model": "gpt-3.5-turbo",
    "maxTokens": 1000,
    "temperature": 0.7
  },
  "response": {
    "content": "{\"category\":\"Software\",\"confidence\":0.95...}",
    "tokensUsed": 245,
    "processingTimeMs": 1247,
    "success": true
  },
  "metadata": {
    "userId": "transaction-analysis",
    "transactionCount": 1,
    "costEstimate": 0.025
  }
}
```

### Example 2: Batch Processing Performance

```json
{
  "timestamp": "2024-01-15T10:35:00.000Z",
  "service": "OpenAIService",
  "method": "executeTask.analyze_csv",
  "request": {
    "prompt": "You are a CSV format analysis expert...",
    "model": "gpt-3.5-turbo"
  },
  "response": {
    "content": "{\"format\":\"Bank Statement\",\"confidence\":0.98...}",
    "tokensUsed": 189,
    "processingTimeMs": 892,
    "success": true
  },
  "metadata": {
    "userId": "batch-processing",
    "transactionCount": 500,
    "costEstimate": 0.15
  }
}
```

## 🚨 Error Handling

### Common Error Patterns

1. **Rate Limiting**: `429 Too Many Requests`
2. **Token Limit**: `400 Token limit exceeded`
3. **API Key Issues**: `401 Unauthorized`
4. **Parse Errors**: `Failed to parse AI response`

### Error Log Example

```json
{
  "timestamp": "2024-01-15T10:40:00.000Z",
  "service": "OpenAIService",
  "method": "analyzeTransaction",
  "error": {
    "message": "Request failed with status code 429",
    "code": "rate_limit_exceeded",
    "stack": "Error: Request failed..."
  },
  "response": {
    "processingTimeMs": 1500,
    "success": false
  }
}
```

## 🔄 Integration Points

### Frontend Integration

```typescript
// Fetch dashboard data
const response = await fetch('/api/logs/dashboard?timeRange=day');
const dashboard = await response.json();

// Search logs
const logs = await fetch('/api/logs/search?service=OpenAIService');
const logData = await logs.json();

// Get live updates
const live = await fetch('/api/logs/live');
const liveData = await live.json();
```

### Monitoring Integration

```typescript
// Set up alerts for high error rates
const analytics = LogViewer.generateAnalytics('hour');
if (analytics.successRate < 0.95) {
  sendAlert('High error rate detected');
}

// Monitor token usage
if (analytics.totalTokensUsed > 100000) {
  sendAlert('High token usage detected');
}
```

## 📋 Best Practices

1. **Regular Monitoring**: Check dashboard daily for performance trends
2. **Error Analysis**: Review error logs weekly to identify patterns
3. **Cost Tracking**: Monitor token usage and estimated costs
4. **Log Retention**: Keep logs for at least 30 days for analysis
5. **Performance Tuning**: Use analytics to optimize API usage
6. **Security**: Logs contain sensitive data - secure access appropriately

## 🎯 Future Enhancements

- Real-time log streaming via WebSocket
- Advanced analytics with machine learning insights
- Integration with external monitoring systems
- Custom alert rules and notifications
- Log compression and archival
- Distributed logging for multiple services

---

**Note**: This logging system is designed for development and debugging. In production, consider using enterprise logging solutions like ELK Stack or Splunk for large-scale deployment. 