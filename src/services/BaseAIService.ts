import { 
  Transaction, 
  User, 
  APIResponse, 
  featureFlags 
} from '../shared-mock';

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  countryCode: string;
  language: string;
}

export interface TransactionAnalysis {
  category: string;
  confidence: number;
  reasoning: string;
  suggestions: string[];
  isTaxDeductible: boolean;
  taxDeductibilityReasoning: string;
  businessUsePercentage: number;
  incomeClassification: string;
  incomeReasoning: string;
}

export interface CSVFormatAnalysis {
  format: string;
  confidence: number;
  columns: {
    date: string;
    description: string;
    amount: string;
    type?: string;
    category?: string;
  };
  sampleData: any[];
  suggestions: string[];
}

export interface AIQueryResult {
  answer: string;
  confidence: number;
  sources: string[];
  suggestions: string[];
  relatedTransactions: string[];
}

export interface UserProfile {
  businessType: string;
  industry: string;
  commonExpenses: string[];
  incomeSources: string[];
  taxPreferences: string[];
  learningPreferences: string[];
}

export interface AILearningFeedback {
  transactionId: string;
  userCorrection: string;
  originalAnalysis: TransactionAnalysis;
  feedbackType: 'category' | 'tax_deductibility' | 'income_classification';
  timestamp: Date;
}

// New interfaces for multi-agent system
export interface AIAgentTask {
  id: string;
  agentType: string;
  taskType: string;
  priority: number;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface AIAgentCapability {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  costEstimate: number; // Cost per execution in API credits
}

export interface AIAgentMetrics {
  totalExecutions: number;
  averageExecutionTime: number;
  successRate: number;
  totalCost: number;
  lastExecution: Date;
}

export interface AIDataContext {
  userId: string;
  userProfile: UserProfile;
  historicalData: Transaction[];
  learningFeedback: AILearningFeedback[];
  preferences: any;
}

export abstract class BaseAIService {
  protected config: AIConfig;
  protected capabilities: AIAgentCapability[] = [];
  protected metrics: AIAgentMetrics = {
    totalExecutions: 0,
    averageExecutionTime: 0,
    successRate: 0,
    totalCost: 0,
    lastExecution: new Date()
  };

  constructor(config: AIConfig) {
    this.config = config;
  }

  abstract analyzeTransaction(
    description: string,
    amount: number,
    date: Date,
    context?: string
  ): Promise<TransactionAnalysis>;

  abstract analyzeCSVFormat(
    csvContent: string,
    sampleRows: number
  ): Promise<CSVFormatAnalysis>;

  abstract queryTransactions(
    query: string,
    transactions: any[],
    context?: string
  ): Promise<AIQueryResult>;

  abstract generateUserProfile(
    transactions: any[],
    userPreferences?: any
  ): Promise<UserProfile>;

  abstract learnFromFeedback(
    feedback: AILearningFeedback
  ): Promise<void>;

  abstract getInsights(
    transactions: any[],
    timeframe: string
  ): Promise<{
    spendingPatterns: string[];
    taxOpportunities: string[];
    recommendations: string[];
    anomalies: string[];
  }>;

  abstract exportAIData(): Promise<{
    userProfile: UserProfile;
    learningData: AILearningFeedback[];
    insights: any[];
  }>;

  // New multi-agent methods
  abstract executeTask(task: AIAgentTask, context: AIDataContext): Promise<any>;
  
  abstract batchExecuteTasks(tasks: AIAgentTask[], context: AIDataContext): Promise<Map<string, any>>;

  abstract estimateTaskCost(taskType: string, data: any): Promise<number>;

  abstract optimizeForCost(tasks: AIAgentTask[]): Promise<AIAgentTask[]>;

  // Agent capabilities management
  getCapabilities(): AIAgentCapability[] {
    return this.capabilities;
  }

  getMetrics(): AIAgentMetrics {
    return this.metrics;
  }

  updateMetrics(executionTime: number, success: boolean, cost: number): void {
    this.metrics.totalExecutions++;
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime) / this.metrics.totalExecutions;
    this.metrics.successRate = 
      (this.metrics.successRate * (this.metrics.totalExecutions - 1) + (success ? 1 : 0)) / this.metrics.totalExecutions;
    this.metrics.totalCost += cost;
    this.metrics.lastExecution = new Date();
  }

  // Data persistence methods (vendor-agnostic)
  async persistLearningData(data: AILearningFeedback): Promise<void> {
    // Override in specific implementations to persist to chosen storage
    throw new Error('persistLearningData must be implemented by specific AI service');
  }

  async retrieveLearningData(userId: string, limit?: number): Promise<AILearningFeedback[]> {
    // Override in specific implementations to retrieve from chosen storage
    throw new Error('retrieveLearningData must be implemented by specific AI service');
  }

  async persistUserInteraction(userId: string, interaction: any): Promise<void> {
    // Override in specific implementations
    throw new Error('persistUserInteraction must be implemented by specific AI service');
  }

  async getAggregatedInsights(userId: string): Promise<any> {
    // Override in specific implementations
    throw new Error('getAggregatedInsights must be implemented by specific AI service');
  }

  getConfig(): AIConfig {
    return this.config;
  }

  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('API key is required for AI service');
    }
    if (!this.config.model) {
      throw new Error('AI model is required');
    }
  }

  protected formatPrompt(template: string, variables: Record<string, any>): string {
    let prompt = template;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
    return prompt;
  }

  protected async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  // Cost optimization utilities
  protected estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Override in specific implementations with actual pricing
    return 0;
  }
} 