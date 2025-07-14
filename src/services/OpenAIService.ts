import OpenAI from 'openai';
import { BaseAIService, AIConfig, TransactionAnalysis, CSVFormatAnalysis, AIQueryResult, UserProfile, AILearningFeedback, AIAgentTask, AIDataContext } from './BaseAIService';
import { TaxLawFactory } from '../tax/TaxLawFactory';

export class OpenAIService extends BaseAIService {
  private openai: OpenAI;

  constructor(config: AIConfig) {
    super(config);
    this.validateConfig();
    this.openai = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  /**
   * Execute a single AI agent task
   */
  async executeTask(task: AIAgentTask, context: AIDataContext): Promise<any> {
    const startTime = Date.now();
    let success = false;
    let cost = 0;

    try {
      let result: any;

      switch (task.taskType) {
        case 'analyze_transaction':
          result = await this.analyzeTransaction(
            task.data.description,
            task.data.amount,
            new Date(task.data.date),
            task.data.context
          );
          break;

        case 'analyze_csv':
          result = await this.analyzeCSVFormat(
            task.data.csvContent,
            task.data.sampleRows || 5
          );
          break;

        case 'query_transactions':
          result = await this.queryTransactions(
            task.data.query,
            task.data.transactions,
            task.data.context
          );
          break;

        case 'generate_profile':
          result = await this.generateUserProfile(
            task.data.transactions,
            task.data.userPreferences
          );
          break;

        case 'get_insights':
          result = await this.getInsights(
            task.data.transactions,
            task.data.timeframe
          );
          break;

        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      success = true;
      cost = await this.estimateTaskCost(task.taskType, task.data);
      
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, success, cost);
    }
  }

  /**
   * Execute multiple AI agent tasks in batch
   */
  async batchExecuteTasks(tasks: AIAgentTask[], context: AIDataContext): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Process tasks in parallel with concurrency limit
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(tasks, concurrencyLimit);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (task) => {
        try {
          const result = await this.executeTask(task, context);
          return { taskId: task.id, result, error: null };
        } catch (error) {
          return { taskId: task.id, result: null, error: (error as Error).message };
        }
      });
      
      const chunkResults = await Promise.all(promises);
      
      chunkResults.forEach(({ taskId, result, error }) => {
        if (error) {
          results.set(taskId, { error });
        } else {
          results.set(taskId, result);
        }
      });
    }
    
    return results;
  }

  /**
   * Estimate the cost of executing a specific task type
   */
  async estimateTaskCost(taskType: string, data: any): Promise<number> {
    // Cost estimation based on task complexity and token usage
    const baseCosts = {
      'analyze_transaction': 0.005, // ~$0.005 per transaction
      'analyze_csv': 0.02,         // ~$0.02 per CSV analysis
      'query_transactions': 0.01,   // ~$0.01 per query
      'generate_profile': 0.03,     // ~$0.03 per profile generation
      'get_insights': 0.025,        // ~$0.025 per insights generation
    };

    const baseCost = baseCosts[taskType as keyof typeof baseCosts] || 0.01;
    
    // Adjust cost based on data complexity
    let complexity = 1;
    
    if (data.transactions && Array.isArray(data.transactions)) {
      complexity = Math.max(1, Math.log10(data.transactions.length + 1));
    }
    
    if (data.csvContent && typeof data.csvContent === 'string') {
      complexity = Math.max(1, Math.log10(data.csvContent.length / 1000 + 1));
    }
    
    return baseCost * complexity;
  }

  /**
   * Optimize tasks for cost efficiency
   */
  async optimizeForCost(tasks: AIAgentTask[]): Promise<AIAgentTask[]> {
    // Sort tasks by priority (higher priority first)
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);
    
    // Group similar tasks together for batch processing efficiency
    const groupedTasks = this.groupSimilarTasks(sortedTasks);
    
    // Flatten back to array while maintaining optimized order
    return groupedTasks.flat();
  }

  async analyzeTransaction(
    description: string,
    amount: number,
    date: Date,
    context?: string
  ): Promise<TransactionAnalysis> {
    const taxLaw = TaxLawFactory.getTaxLaw(this.config.countryCode);
    const businessTypes = taxLaw.getBusinessTypes();
    
    const prompt = this.formatPrompt(`
You are a financial AI assistant specializing in {{countryCode}} tax law and transaction categorization.

Transaction Details:
- Description: {{description}}
- Amount: {{amount}}
- Date: {{date}}
- Context: {{context}}

Available Business Types:
{{businessTypes}}

Please analyze this transaction and provide:
1. Category classification with confidence (0-1)
2. Reasoning for categorization
3. Suggestions for better categorization
4. Tax deductibility assessment (true/false)
5. Tax deductibility reasoning
6. Business use percentage (0-100)
7. Income classification (Income/Expense/Transfer)
8. Income reasoning

Respond in JSON format:
{
  "category": "string",
  "confidence": number,
  "reasoning": "string",
  "suggestions": ["string"],
  "isTaxDeductible": boolean,
  "taxDeductibilityReasoning": "string",
  "businessUsePercentage": number,
  "incomeClassification": "string",
  "incomeReasoning": "string"
}
`, {
      countryCode: this.config.countryCode,
      description,
      amount,
      date: date instanceof Date ? date.toISOString() : date,
      context: context || 'No additional context',
      businessTypes: JSON.stringify(businessTypes, null, 2)
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response as TransactionAnalysis;
  }

  async analyzeCSVFormat(
    csvContent: string,
    sampleRows: number = 5
  ): Promise<CSVFormatAnalysis> {
    const prompt = this.formatPrompt(`
You are a CSV format analysis expert. Analyze the following CSV content and determine the format structure.

CSV Content (first {{sampleRows}} rows):
{{csvContent}}

Please identify:
1. The format/type of CSV
2. Column mappings (date, description, amount, type, category)
3. Confidence level (0-1)
4. Sample data structure
5. Suggestions for processing

Respond in JSON format:
{
  "format": "string",
  "confidence": number,
  "columns": {
    "date": "string",
    "description": "string", 
    "amount": "string",
    "type": "string",
    "category": "string"
  },
  "sampleData": [object],
  "suggestions": ["string"]
}
`, {
      sampleRows,
      csvContent: csvContent.split('\n').slice(0, sampleRows).join('\n')
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response as CSVFormatAnalysis;
  }

  async queryTransactions(
    query: string,
    transactions: any[],
    context?: string
  ): Promise<AIQueryResult> {
    const prompt = this.formatPrompt(`
You are a financial AI assistant. Answer the user's question about their transactions.

User Question: {{query}}
Context: {{context}}

Transaction Data ({{transactionCount}} transactions):
{{transactions}}

Please provide:
1. Direct answer to the question
2. Confidence level (0-1)
3. Sources/references used
4. Suggestions for further analysis
5. Related transaction IDs

Respond in JSON format:
{
  "answer": "string",
  "confidence": number,
  "sources": ["string"],
  "suggestions": ["string"],
  "relatedTransactions": ["string"]
}
`, {
      query,
      context: context || 'No additional context',
      transactionCount: transactions.length,
      transactions: JSON.stringify(transactions.slice(0, 50), null, 2) // Limit to first 50 for token efficiency
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response as AIQueryResult;
  }

  async generateUserProfile(
    transactions: any[],
    userPreferences?: any
  ): Promise<UserProfile> {
    const prompt = this.formatPrompt(`
You are a financial AI assistant. Analyze the user's transaction history and generate a comprehensive user profile.

Transaction History ({{transactionCount}} transactions):
{{transactions}}

User Preferences: {{userPreferences}}

Please generate a user profile including:
1. Business type (Individual/Sole Trader/Company)
2. Industry/sector
3. Common expense categories
4. Income sources
5. Tax preferences
6. Learning preferences

Respond in JSON format:
{
  "businessType": "string",
  "industry": "string",
  "commonExpenses": ["string"],
  "incomeSources": ["string"],
  "taxPreferences": ["string"],
  "learningPreferences": ["string"]
}
`, {
      transactionCount: transactions.length,
      transactions: JSON.stringify(transactions.slice(0, 100), null, 2),
      userPreferences: JSON.stringify(userPreferences || {}, null, 2)
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response as UserProfile;
  }

  async learnFromFeedback(feedback: AILearningFeedback): Promise<void> {
    // Store feedback for future learning - in a real implementation,
    // this would be saved to a database and used to improve the model
    console.log('Learning from feedback:', feedback);
    
    // For now, we'll just log the feedback
    // In a production system, this would:
    // 1. Store feedback in a database
    // 2. Use it to fine-tune the model
    // 3. Update categorization rules
    // 4. Improve confidence scoring
  }

  async getInsights(
    transactions: any[],
    timeframe: string
  ): Promise<{
    spendingPatterns: string[];
    taxOpportunities: string[];
    recommendations: string[];
    anomalies: string[];
  }> {
    const prompt = this.formatPrompt(`
You are a financial AI assistant. Analyze the user's transaction history and provide insights.

Transaction History ({{transactionCount}} transactions):
{{transactions}}

Timeframe: {{timeframe}}

Please provide insights in these categories:
1. Spending patterns
2. Tax deduction opportunities
3. Financial recommendations
4. Anomalies or unusual transactions

Respond in JSON format:
{
  "spendingPatterns": ["string"],
  "taxOpportunities": ["string"],
  "recommendations": ["string"],
  "anomalies": ["string"]
}
`, {
      transactionCount: transactions.length,
      transactions: JSON.stringify(transactions.slice(0, 100), null, 2),
      timeframe
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response;
  }

  async exportAIData(): Promise<{
    userProfile: UserProfile;
    learningData: AILearningFeedback[];
    insights: any[];
  }> {
    // This would typically fetch data from a database
    // For now, return empty data
    return {
      userProfile: {
        businessType: '',
        industry: '',
        commonExpenses: [],
        incomeSources: [],
        taxPreferences: [],
        learningPreferences: []
      },
      learningData: [],
      insights: []
    };
  }

  /**
   * General text analysis method for custom prompts (for batch processing)
   */
  async analyzeText(prompt: string): Promise<string> {
    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return content;
    });

    return response;
  }

  // Helper methods

  /**
   * Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Group similar tasks together for batch processing efficiency
   */
  private groupSimilarTasks(tasks: AIAgentTask[]): AIAgentTask[][] {
    const groups = new Map<string, AIAgentTask[]>();
    
    tasks.forEach(task => {
      const key = `${task.agentType}_${task.taskType}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(task);
    });
    
    return Array.from(groups.values());
  }
} 