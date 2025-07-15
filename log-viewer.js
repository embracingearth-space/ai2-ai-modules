#!/usr/bin/env node

// Simple CLI script to view API logs
const { LogViewerCLI } = require('./dist/utils/LogViewer');

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

console.log('🚀 AI2 Log Viewer CLI');
console.log('=====================');

switch (command) {
  case 'dashboard':
  case 'dash':
    const timeRange = arg1 || 'day';
    LogViewerCLI.dashboard(timeRange);
    break;
    
  case 'search':
    const criteria = {};
    if (arg1) criteria.service = arg1;
    if (arg2) criteria.method = arg2;
    const limit = parseInt(process.argv[5]) || 10;
    LogViewerCLI.search(criteria, limit);
    break;
    
  case 'detail':
    if (!arg1) {
      console.log('❌ Please provide a request ID');
      process.exit(1);
    }
    LogViewerCLI.detail(arg1);
    break;
    
  case 'export':
    const filename = arg1 || `api-logs-${new Date().toISOString().split('T')[0]}.csv`;
    LogViewerCLI.export(filename);
    break;
    
  case 'clean':
    const days = parseInt(arg1) || 30;
    LogViewerCLI.clean(days);
    break;
    
  case 'help':
  default:
    console.log(`
📖 Usage:
  node log-viewer.js <command> [args]

🔧 Commands:
  dashboard [timeRange]     Show performance dashboard (hour|day|week)
  search [service] [method] Search logs by service and method
  detail <requestId>        Show detailed log entry
  export [filename]         Export logs to CSV
  clean [days]              Clean logs older than X days (default: 30)
  help                      Show this help message

📊 Examples:
  node log-viewer.js dashboard day
  node log-viewer.js search OpenAIService analyzeTransaction
  node log-viewer.js detail req_1234567890_abcdef
  node log-viewer.js export my-logs.csv
  node log-viewer.js clean 7
`);
    break;
} 