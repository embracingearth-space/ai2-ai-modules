export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  countryCode: string;
  language: string;
}

export interface AIDataContext {
  userId: string;
  transactionId?: string;
  sessionId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AIAgentTask {
  id: string;
  taskType: string;
  data: any;
  priority?: number;
  timeout?: number;
  retry?: number;
}

export interface AIAgentCapability {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  costEstimate: number;
}

export interface TransactionData {
  id: string;
  description: string;
  amount: number;
  date: Date | string; // 🔧 FIXED: Accept both Date objects and ISO strings
  merchant?: string;
  category?: string;
  subcategory?: string;
  type?: string;
  accountId?: string;
  userId?: string;
}

export interface UserProfile {
  userId: string;
  businessType: string;
  countryCode: string;
  taxYear: number;
  preferences: {
    defaultBusinessUsePercentage: number;
    autoCategorizationEnabled: boolean;
    taxOptimizationEnabled: boolean;
  };
}

export interface BatchProcessingOptions {
  maxBatchSize: number;
  useCache: boolean;
  enableLearning: boolean;
  costOptimization: boolean;
}

export interface ProcessingStats {
  totalTransactions: number;
  processedByReference: number;
  processedByAI: number;
  averageProcessingTime: number;
  totalCost: number;
  cacheHitRate: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  cacheSize: number;
}

export interface CostOptimizationRecommendation {
  type: 'batch_size' | 'cache_optimization' | 'reference_data' | 'ai_model';
  description: string;
  potentialSavings: number;
  implementation: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AnalysisInsights {
  categoriesFound: string[];
  topMerchants: string[];
  recurringBills: number;
  taxDeductibleAmount: number;
  businessExpensePercentage: number;
  recommendations: string[];
  patterns: {
    monthlySpending: number;
    averageTransactionAmount: number;
    mostCommonCategory: string;
    businessVsPersonal: number;
  };
}

export interface BillPattern {
  id: string;
  name: string;
  merchant: string;
  category: string;
  subcategory: string;
  averageAmount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDueDate: Date;
  confidence: number;
  isTaxDeductible: boolean;
  businessUsePercentage: number;
  lastSeen: Date;
  occurrences: number;
}

export interface OptimizationResult {
  originalCost: number;
  optimizedCost: number;
  savings: number;
  savingsPercentage: number;
  processingTime: number;
  recommendations: CostOptimizationRecommendation[];
  stats: ProcessingStats;
  cacheStats: CacheStats;
  insights: AnalysisInsights;
}

export interface AIResponse {
  success: boolean;
  data?: any;
  error?: string;
  cost?: number;
  processingTime?: number;
  source?: 'ai' | 'cache' | 'reference';
  confidence?: number;
  reasoning?: string;
}

export interface LearningFeedback {
  transactionId: string;
  originalPrediction: any;
  userCorrection: any;
  feedbackType: 'category' | 'tax_deductible' | 'business_use' | 'recurring';
  timestamp: Date;
  userId: string;
}

export interface ReferenceDataEntry {
  id: string;
  pattern: string;
  category: string;
  subcategory: string;
  confidence: number;
  isTaxDeductible: boolean;
  businessUsePercentage: number;
  source: 'system' | 'learned' | 'user';
  lastUpdated: Date;
  usage: number;
} 