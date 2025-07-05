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
    // Mock feature flags - enable all AI features for testing
    const enabledFeatures = [
      'enableAI',
      'enableAICategories', 
      'enableAITaxDeduction',
      'enableAIInsights',
      'enableAILearning'
    ];
    return enabledFeatures.indexOf(feature) !== -1;
  },

  isAIEnabled: (): boolean => {
    return true; // Always enabled for testing
  }
};