/**
 * 🔧 AI CONFIGURATION
 * 
 * Configuration settings for AI modules including:
 * - OpenAI API settings
 * - Model configurations
 * - Rate limiting
 * - Performance settings
 */

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  countryCode: string;
  language: string;
}

export const getAIConfig = (): AIConfig => {
  return {
    provider: 'openai',
    model: process.env.AI_MODEL || 'gpt-4-turbo',
    apiKey: process.env.OPENAI_API_KEY || '',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '300'),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1'),
    countryCode: process.env.COUNTRY_CODE || 'AU',
    language: process.env.LANGUAGE || 'en'
  };
};

export const validateConfig = (config: AIConfig): boolean => {
  if (!config.apiKey) {
    console.warn('⚠️  OpenAI API key not configured');
    return false;
  }
  
  if (!config.model || !config.provider) {
    console.warn('⚠️  AI model or provider not properly configured');
    return false;
  }
  
  return true;
};

export default { getAIConfig, validateConfig }; 