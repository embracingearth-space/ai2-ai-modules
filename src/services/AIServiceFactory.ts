import { BaseAIService, AIConfig } from './BaseAIService';
import { OpenAIService } from './OpenAIService';

export interface AIServiceProvider {
  provider: string;
  implementation: new (config: AIConfig) => BaseAIService;
}

export class AIServiceFactory {
  private static aiServices: Map<string, BaseAIService> = new Map();
  private static availableProviders: AIServiceProvider[] = [
    {
      provider: 'openai',
      implementation: OpenAIService
    }
    // Future providers can be added here:
    // {
    //   provider: 'anthropic',
    //   implementation: AnthropicService
    // },
    // {
    //   provider: 'google',
    //   implementation: GoogleAIService
    // }
  ];

  static getAvailableProviders(): AIServiceProvider[] {
    return this.availableProviders;
  }

  static getAIService(
    provider: string,
    countryCode: string = 'AU'
  ): BaseAIService {
    const key = `${provider}-${countryCode}`;
    
    if (this.aiServices.has(key)) {
      return this.aiServices.get(key)!;
    }

    const providerConfig = this.availableProviders.find(
      p => p.provider === provider
    );

    if (!providerConfig) {
      throw new Error(`AI service provider not found: ${provider}`);
    }

    const config: AIConfig = {
      provider,
      model: this.getDefaultModel(provider),
      apiKey: this.getAPIKey(provider),
      maxTokens: 2000,
      temperature: 0.3,
      countryCode,
      language: 'en'
    };

    const aiService = new providerConfig.implementation(config);
    this.aiServices.set(key, aiService);
    return aiService;
  }

  static getDefaultAIService(countryCode: string = 'AU'): BaseAIService {
    return this.getAIService('openai', countryCode);
  }

  static isProviderSupported(provider: string): boolean {
    return this.availableProviders.some(p => p.provider === provider);
  }

  private static getDefaultModel(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4';
      case 'anthropic':
        return 'claude-3-sonnet-20240229';
      case 'google':
        return 'gemini-pro';
      default:
        return 'gpt-4';
    }
  }

  private static getAPIKey(provider: string): string {
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY || '';
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || '';
      case 'google':
        return process.env.GOOGLE_AI_API_KEY || '';
      default:
        return process.env.OPENAI_API_KEY || '';
    }
  }

  static updateCountryCode(provider: string, countryCode: string): void {
    const key = `${provider}-${countryCode}`;
    if (this.aiServices.has(key)) {
      const service = this.aiServices.get(key)!;
      const config = service.getConfig();
      config.countryCode = countryCode;
    }
  }
} 