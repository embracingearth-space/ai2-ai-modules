// Mock for @ai2/shared package
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date;
  category?: string;
  userId?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  businessType?: string;
  industry?: string;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export const featureFlags = {
  isFeatureEnabled: (feature: string): boolean => {
    // Check environment variables first, then fall back to default enabled features
    const envKey = feature.toUpperCase();
    const envValue = process.env[envKey];
    
    if (envValue !== undefined) {
      return envValue.toLowerCase() === 'true';
    }
    
    // Default enabled features for testing
    const defaultEnabledFeatures = [
      'enableAI',
      'enableAICategories', 
      'enableAITaxDeduction',
      'enableAIInsights',
      'enableAILearning'
    ];
    
    return defaultEnabledFeatures.includes(feature);
  },

  isAIEnabled: (): boolean => {
    return process.env.ENABLE_AI?.toLowerCase() === 'true' || 
           process.env.ENABLE_AI === undefined; // Default to enabled
  }
};