import { BaseAIService, AIConfig, AIAgentTask, AIDataContext, AIAgentCapability } from './BaseAIService';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

export interface CategoryAnalysis {
  suggestedCategory: string;
  confidence: number;
  reasoning: string;
  alternativeCategories: string[];
  isNewCategory: boolean;
  categoryDescription?: string;
  categoryType: 'expense' | 'income' | 'transfer' | 'deductible';
}

export interface BulkCategorizationResult {
  categorized: Array<{
    transactionId: string;
    category: string;
    confidence: number;
  }>;
  newCategories: Array<{
    name: string;
    type: string;
    description: string;
    color: string;
  }>;
  uncategorized: string[];
  summary: {
    totalProcessed: number;
    successfullycategorized: number;
    newCategoriesCreated: number;
    averageConfidence: number;
  };
}

export class CategoriesAIAgent extends BaseAIService {
  private openai: OpenAI;

  constructor(config: AIConfig) {
    super(config);
    this.validateConfig();
    this.openai = new OpenAI({ apiKey: config.apiKey });
    
    this.capabilities = [
      {
        name: 'categorizeTransaction',
        description: 'Analyze a single transaction and suggest appropriate category',
        inputSchema: {
          description: 'string',
          amount: 'number',
          merchant: 'string?',
          date: 'Date'
        },
        outputSchema: {
          suggestedCategory: 'string',
          confidence: 'number',
          reasoning: 'string'
        },
        costEstimate: 0.01
      },
      {
        name: 'bulkCategorizeTransactions',
        description: 'Categorize multiple transactions in batch',
        inputSchema: {
          transactions: 'Array<Transaction>',
          existingCategories: 'Array<Category>'
        },
        outputSchema: {
          categorized: 'Array<CategoryAnalysis>',
          newCategories: 'Array<Category>'
        },
        costEstimate: 0.05
      },
      {
        name: 'analyzeAndCreateCategories',
        description: 'Analyze transaction patterns and suggest new category structure',
        inputSchema: {
          transactions: 'Array<Transaction>',
          userPreferences: 'object'
        },
        outputSchema: {
          suggestedCategories: 'Array<Category>',
          migrationPlan: 'object'
        },
        costEstimate: 0.10
      }
    ];
  }

  async executeTask(task: AIAgentTask, context: AIDataContext): Promise<any> {
    const startTime = Date.now();
    let success = false;
    let cost = 0;

    try {
      let result;
      
      switch (task.taskType) {
        case 'categorizeTransaction':
          result = await this.categorizeTransaction(task.data, context);
          break;
        case 'bulkCategorizeTransactions':
          result = await this.bulkCategorizeTransactions(task.data.transactions, task.data.existingCategories, context);
          break;
        case 'analyzeAndCreateCategories':
          result = await this.analyzeAndCreateCategories(task.data.transactions, context);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      success = true;
      cost = await this.estimateTaskCost(task.taskType, task.data);
      return result;

    } catch (error) {
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, success, cost);
    }
  }

  async batchExecuteTasks(tasks: AIAgentTask[], context: AIDataContext): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Group tasks by type for batch optimization
    const taskGroups = new Map<string, AIAgentTask[]>();
    tasks.forEach(task => {
      if (!taskGroups.has(task.taskType)) {
        taskGroups.set(task.taskType, []);
      }
      taskGroups.get(task.taskType)!.push(task);
    });

    // Execute each group
    for (const [taskType, taskGroup] of taskGroups) {
      for (const task of taskGroup) {
        try {
          const result = await this.executeTask(task, context);
          results.set(task.id, result);
        } catch (error) {
          results.set(task.id, { error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    return results;
  }

  async estimateTaskCost(taskType: string, data: any): Promise<number> {
    const capability = this.capabilities.find(c => c.name === taskType);
    if (!capability) return 0;

    switch (taskType) {
      case 'categorizeTransaction':
        return capability.costEstimate;
      case 'bulkCategorizeTransactions':
        return capability.costEstimate * (data.transactions?.length || 1);
      case 'analyzeAndCreateCategories':
        return capability.costEstimate * Math.min(data.transactions?.length || 1, 100); // Cap at 100 for cost analysis
      default:
        return 0;
    }
  }

  async optimizeForCost(tasks: AIAgentTask[]): Promise<AIAgentTask[]> {
    // Combine similar tasks, prioritize by business value
    const optimized = [...tasks];
    
    // Group bulk categorization tasks
    const bulkTasks = optimized.filter(t => t.taskType === 'bulkCategorizeTransactions');
    if (bulkTasks.length > 1) {
      const combinedData = {
        transactions: bulkTasks.flatMap(t => t.data.transactions),
        existingCategories: bulkTasks[0]?.data?.existingCategories || []
      };
      
      // Remove individual tasks and add combined one
      bulkTasks.forEach(task => {
        const index = optimized.indexOf(task);
        if (index > -1) optimized.splice(index, 1);
      });

      optimized.push({
        id: `combined-bulk-${Date.now()}`,
        agentType: 'CategoriesAI',
        taskType: 'bulkCategorizeTransactions',
        priority: Math.max(...bulkTasks.map(t => t.priority)),
        data: combinedData,
        status: 'pending',
        createdAt: new Date()
      });
    }

    return optimized.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Categorize a single transaction
   */
  async categorizeTransaction(
    transaction: {
      description: string;
      amount: number;
      merchant?: string;
      date: Date;
    },
    context: AIDataContext
  ): Promise<CategoryAnalysis> {
    // Get existing categories
    const existingCategories = await prisma.category.findMany({
      where: { userId: context.userId }
    });

    const prompt = this.formatPrompt(`
You are an expert financial categorization system. Analyze this transaction and suggest the most appropriate category.

User Profile:
- Business Type: {{businessType}}
- Industry: {{industry}}
- Common Expenses: {{commonExpenses}}

Existing Categories:
{{existingCategories}}

Transaction Details:
- Description: {{description}}
- Amount: {{amount}}
- Merchant: {{merchant}}
- Date: {{date}}

Historical Learning:
{{learningFeedback}}

Please provide categorization analysis:

1. **Primary Category Suggestion**:
   - Category name (from existing or new)
   - Confidence level (0-1)
   - Detailed reasoning

2. **Alternative Categories**:
   - 2-3 alternative categories
   - Brief reasoning for each

3. **Category Assessment**:
   - Is this a new category needed?
   - Category type (expense/income/transfer/deductible)
   - If new, provide description and suggested color

4. **Learning Insights**:
   - Patterns detected
   - Suggestions for user

Respond in JSON format:
{
  "suggestedCategory": "category name",
  "confidence": number,
  "reasoning": "detailed explanation",
  "alternativeCategories": ["category1", "category2"],
  "isNewCategory": boolean,
  "categoryDescription": "description if new",
  "categoryType": "expense|income|transfer|deductible"
}
`, {
      businessType: context.userProfile.businessType,
      industry: context.userProfile.industry,
      commonExpenses: context.userProfile.commonExpenses.join(', '),
      existingCategories: JSON.stringify(existingCategories.map((c: any) => ({ name: c.name, type: c.type })), null, 2),
      description: transaction.description,
      amount: transaction.amount,
      merchant: transaction.merchant || 'Unknown',
      date: transaction.date.toISOString(),
      learningFeedback: JSON.stringify(context.learningFeedback.slice(-10), null, 2) // Last 10 feedback items
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional financial advisor with expertise in transaction categorization. Provide accurate, consistent categorization based on user patterns and business context.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: 0.2, // Low temperature for consistent categorization
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

    return response as CategoryAnalysis;
  }

  /**
   * Bulk categorize multiple transactions
   */
  async bulkCategorizeTransactions(
    transactions: any[],
    existingCategories: any[],
    context: AIDataContext
  ): Promise<BulkCategorizationResult> {
    const results: BulkCategorizationResult = {
      categorized: [],
      newCategories: [],
      uncategorized: [],
      summary: {
        totalProcessed: transactions.length,
        successfullycategorized: 0,
        newCategoriesCreated: 0,
        averageConfidence: 0
      }
    };

    // Process in batches to manage costs and rate limits
    const batchSize = 10;
    let totalConfidence = 0;
    const suggestedNewCategories = new Map<string, any>();

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (transaction) => {
        try {
          const analysis = await this.categorizeTransaction(transaction, context);
          
          if (analysis.confidence >= 0.7) {
            results.categorized.push({
              transactionId: transaction.id,
              category: analysis.suggestedCategory,
              confidence: analysis.confidence
            });
            
            totalConfidence += analysis.confidence;
            
            // Track new categories
            if (analysis.isNewCategory && analysis.categoryDescription) {
              suggestedNewCategories.set(analysis.suggestedCategory, {
                name: analysis.suggestedCategory,
                type: analysis.categoryType,
                description: analysis.categoryDescription,
                color: this.generateCategoryColor(analysis.categoryType)
              });
            }
          } else {
            results.uncategorized.push(transaction.id);
          }
        } catch (error) {
          console.error(`Error categorizing transaction ${transaction.id}:`, error);
          results.uncategorized.push(transaction.id);
        }
      });

      await Promise.all(batchPromises);
      
      // Rate limiting delay
      if (i + batchSize < transactions.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Finalize results
    results.newCategories = Array.from(suggestedNewCategories.values());
    results.summary.successfullycategorized = results.categorized.length;
    results.summary.newCategoriesCreated = results.newCategories.length;
    results.summary.averageConfidence = results.categorized.length > 0 
      ? totalConfidence / results.categorized.length 
      : 0;

    return results;
  }

  /**
   * Analyze transaction patterns and suggest category structure
   */
  async analyzeAndCreateCategories(
    transactions: any[],
    context: AIDataContext
  ): Promise<{
    suggestedCategories: any[];
    migrationPlan: any;
    insights: string[];
  }> {
    const prompt = this.formatPrompt(`
You are a financial organization expert. Analyze these transaction patterns and create an optimal category structure.

User Profile:
{{userProfile}}

Transaction Sample ({{transactionCount}} total):
{{transactionSample}}

Current Categories:
{{currentCategories}}

Create a comprehensive category structure that:
1. Covers all transaction types efficiently
2. Follows best practices for {{countryCode}} tax/business needs
3. Is intuitive for user's industry ({{industry}})
4. Optimizes for tax deduction tracking

Provide:
1. **Suggested Category Structure** (15-25 categories max)
2. **Migration Plan** for existing transactions
3. **Categorization Insights** and recommendations

Respond in JSON format:
{
  "suggestedCategories": [
    {
      "name": "category name",
      "type": "expense|income|transfer|deductible",
      "description": "description",
      "color": "#hexcode",
      "taxRelevant": boolean,
      "examples": ["example1", "example2"]
    }
  ],
  "migrationPlan": {
    "strategy": "merge|split|rename",
    "mappings": [
      {
        "from": "old category",
        "to": "new category",
        "confidence": number
      }
    ]
  },
  "insights": ["insight1", "insight2"]
}
`, {
      userProfile: JSON.stringify(context.userProfile, null, 2),
      transactionCount: transactions.length,
      transactionSample: JSON.stringify(transactions.slice(0, 50), null, 2),
      currentCategories: JSON.stringify(await prisma.category.findMany({
        where: { userId: context.userId }
      }), null, 2),
      countryCode: this.config.countryCode,
      industry: context.userProfile.industry
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: 0.3,
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

  private generateCategoryColor(type: string): string {
    const colorMap: Record<string, string[]> = {
      expense: ['#f44336', '#e91e63', '#9c27b0', '#673ab7'],
      income: ['#4caf50', '#8bc34a', '#cddc39', '#009688'],
      transfer: ['#2196f3', '#03a9f4', '#00bcd4', '#009688'],
      deductible: ['#ff9800', '#ff5722', '#795548', '#607d8b']
    };
    
    const colors = colorMap[type] || colorMap.expense;
    return colors?.[Math.floor(Math.random() * (colors?.length || 1))] || '#f44336';
  }

  // Required implementations from BaseAIService
  async analyzeTransaction(): Promise<any> {
    throw new Error('Use categorizeTransaction instead');
  }

  async analyzeCSVFormat(): Promise<any> {
    throw new Error('Not implemented in CategoriesAIAgent');
  }

  async queryTransactions(): Promise<any> {
    throw new Error('Not implemented in CategoriesAIAgent');
  }

  async generateUserProfile(): Promise<any> {
    throw new Error('Not implemented in CategoriesAIAgent');
  }

  async learnFromFeedback(): Promise<void> {
    // Implementation for learning from user corrections
  }

  async getInsights(): Promise<any> {
    throw new Error('Use analyzeAndCreateCategories instead');
  }

  async exportAIData(): Promise<any> {
    return {
      userProfile: {},
      learningData: [],
      insights: [],
      capabilities: this.capabilities,
      metrics: this.metrics
    };
  }
} 