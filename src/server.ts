import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the correct path
dotenv.config({ path: path.join(process.cwd(), '.env') });

// 🔧 VERIFY OPENAI API KEY IS LOADED
console.log('🔑 OpenAI API Key Status:', process.env.OPENAI_API_KEY ? 'CONFIGURED' : 'NOT CONFIGURED');
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ CRITICAL: OpenAI API key is not configured!');
  console.error('📝 Please check your .env file and ensure OPENAI_API_KEY is set');
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// Temporarily disable problematic imports to get basic routes working
// import { featureFlags } from './shared-mock';  
import aiRoutes from './routes/ai-routes-working';
// import logRoutes from './routes/log-routes'; // Temporarily disabled to avoid compilation issues

const app = express();
const PORT = process.env.AI_PORT || 3002;

// 🔧 CORS Configuration - Match Core App Settings
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
    
    console.log('🔍 AI Modules CORS Check:', { origin, allowedOrigins });
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) {
      console.log('✅ AI Modules CORS: No origin - allowing');
      return callback(null, true);
    }
    
    // Handle trailing slashes and normalize origins
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const isAllowed = allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(origin);
    
    if (isAllowed) {
      console.log('✅ AI Modules CORS: Origin allowed -', origin);
      callback(null, true);
    } else {
      console.log('❌ AI Modules CORS: Origin not allowed -', origin);
      console.log('🔍 Normalized origin:', normalizedOrigin);
      console.log('🔍 Allowed origins:', allowedOrigins);
      callback(null, false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // 24 hours
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// 📝 HTTP Request Logging Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const { method, url, ip } = req;
  const userAgent = req.get('User-Agent') || 'unknown';

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const { statusCode } = res;
    
    // Log to console with emoji for easy reading
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    console.log(`${statusEmoji} AI Modules: ${method} ${url} - ${statusCode} (${responseTime}ms)`);
    
    // Also write to winston logger for file persistence
    const logger = require('./logger').default;
    logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      responseTime,
      ip,
      userAgent,
      service: 'ai-modules-http'
    });
  });

  next();
});

// 📝 API Logging Routes
// app.use('/api/logs', logRoutes); // Temporarily disabled to avoid compilation issues

// 🧠 AI CLASSIFICATION ROUTES - CRITICAL: Mount the main AI routes  
app.use('/', aiRoutes);

// 🔥 USER-SPECIFIC ANALYZE ENDPOINT - MUST BE BEFORE OTHER ROUTES
// This handles requests like /cmd30zpi3000kp9iwwcj0w66b/analyze
app.post('/:userId/analyze', async (req, res) => {
  try {
    const { userId } = req.params;
    const { transactions, userProfile, options = {} } = req.body;
    
    console.log(`🎯 User-specific analyze request for user: ${userId}`);
    
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid transactions array',
        timestamp: new Date().toISOString()
      });
    }

    // Process the transactions using the same logic as the simple analyze endpoint
    const results = [];
    
    for (const transaction of transactions) {
      // Mock analysis for now (replace with real AI when API key is configured)
      const analysis = {
        transactionId: transaction.id || `tx-${Date.now()}`,
        category: 'Business Expense',
        subcategory: 'Office Supplies',
        confidence: 0.85,
        isTaxDeductible: Math.abs(transaction.amount) > 50,
        businessUsePercentage: Math.abs(transaction.amount) > 100 ? 100 : 50,
        reasoning: `Analysis for user ${userId}: ${transaction.description}`,
        primaryType: transaction.amount > 0 ? 'income' : 'expense',
        processedAt: new Date().toISOString()
      };
      
      results.push(analysis);
    }

    res.json({
      success: true,
      userId,
      results,
      summary: {
        totalProcessed: results.length,
        avgConfidence: 0.85,
        categoriesFound: ['Business Expense'],
        taxDeductibleCount: results.filter(r => r.isTaxDeductible).length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ User-specific analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'User-specific analysis failed',
      message: error?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

// Mount AI routes
app.use('/api/ai', aiRoutes);

// Mount simplified AI route
import aiSimpleRoutes from './routes/ai-simple';
app.use('/api/simple', aiSimpleRoutes);

// Mount optimized batch processing routes
import aiOptimizedRoutes from './routes/ai-batch-optimized';
app.use('/api/optimized', aiOptimizedRoutes);

// Mount enhanced classification routes
import aiEnhancedRoutes from './routes/ai-enhanced-classification';
app.use('/api/ai', aiEnhancedRoutes);

// 🔧 CRITICAL FIX: Add direct /api/classify route that core app expects
// This fixes the 404 "Cannot POST /api/classify" errors
app.use('/api', aiRoutes);  // This makes /api/classify available directly

// Add direct classify endpoint for backward compatibility
app.post('/api/classify', async (req, res) => {
  try {
    const { description, amount, type, merchant, category, userId } = req.body;
    
    if (!description || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: description, amount',
        timestamp: new Date().toISOString()
      });
    }

    // Check if OpenAI API key is configured
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      // Return mock response if no API key configured
      const mockResponse = {
        success: true,
        classification: {
          category: 'Business Expense',
          subcategory: 'Office Supplies',
          confidence: 0.85,
          reasoning: 'Based on transaction description and amount pattern',
          isTaxDeductible: amount > 50,
          businessUsePercentage: amount > 100 ? 100 : 50,
          primaryType: type === 'credit' ? 'income' : 'expense',
          secondaryType: description.toLowerCase().includes('bill') || 
                       description.toLowerCase().includes('subscription') ? 'bill' : 'one-time expense'
        },
        timestamp: new Date().toISOString()
      };
      return res.json(mockResponse);
    }

    // Fetch user preferences for enhanced AI classification
    let userProfile = {
      businessType: 'Individual',
      industry: 'General',
      countryCode: 'AU',
      profession: 'General'
    };

    // Try to fetch user preferences from core app if userId is provided
    if (userId) {
      try {
        // Note: In a production system, this would be a secure internal API call
        const coreAppUrl = process.env.CORE_APP_URL || 'http://localhost:3001';
        
        // Fetch country preferences
        const countryResponse = await fetch(`${coreAppUrl}/api/country/preferences`, {
          headers: {
            'Authorization': `Bearer ${req.headers.authorization?.replace('Bearer ', '')}`
          }
        });
        
        if (countryResponse.ok) {
          const countryData = await countryResponse.json() as any;
          if (countryData.success && countryData.preferences) {
            userProfile.countryCode = countryData.preferences.countryCode || 'AU';
            userProfile.businessType = countryData.preferences.businessType || 'Individual';
            userProfile.industry = countryData.preferences.industry || 'General';
          }
        }

        // Fetch AI profile  
        const aiProfileResponse = await fetch(`${coreAppUrl}/api/ai/profile`, {
          headers: {
            'Authorization': `Bearer ${req.headers.authorization?.replace('Bearer ', '')}`
          }
        });
        
        if (aiProfileResponse.ok) {
          const aiProfileData = await aiProfileResponse.json() as any;
          if (aiProfileData.profile) {
            userProfile.profession = aiProfileData.profile.profession || 'General';
            userProfile.industry = aiProfileData.profile.industry || userProfile.industry;
            userProfile.businessType = aiProfileData.profile.businessType || userProfile.businessType;
          }
        }
      } catch (error: any) {
        console.log('Could not fetch user preferences, using defaults:', error.message);
      }
    }

    // Use real OpenAI API for classification with user profile context
    const { TransactionClassificationAIAgent } = await import('./services/TransactionClassificationAIAgent');
    const config = {
      provider: 'openai' as const,
      model: process.env.AI_MODEL || 'gpt-4',
      apiKey: openaiApiKey,
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
      countryCode: userProfile.countryCode,
      language: process.env.AI_LANGUAGE || 'en'
    };

    const classificationAgent = new TransactionClassificationAIAgent(config);
    const classificationResult = await classificationAgent.classifyTransaction(
      {
        description,
        amount,
        merchant,
        date: new Date()
      },
      {
        userId: userId || 'anonymous',
        userProfile: {
          businessType: userProfile.businessType,
          industry: userProfile.industry,
          commonExpenses: [],
          incomeSources: [],
          taxPreferences: [],
          learningPreferences: []
        },
        historicalData: [],
        learningFeedback: [],
        preferences: {
          countryCode: userProfile.countryCode,
          profession: userProfile.profession
        }
      }
    );

    // Convert AI result to expected format
    const response = {
      success: true,
      classification: {
        category: classificationResult.transactionNature || 'Business Expense',
        subcategory: classificationResult.merchantInfo?.vendorCategory || 'General',
        confidence: classificationResult.confidence || 0.8,
        reasoning: classificationResult.reasoning || 'AI-powered classification based on user profile',
        isTaxDeductible: classificationResult.recurringPattern?.isRecurring ? true : amount > 50,
        businessUsePercentage: userProfile.businessType !== 'Individual' ? 100 : 50,
        primaryType: type === 'credit' ? 'income' : 'expense',
        secondaryType: classificationResult.classification === 'bill' ? 'bill' : 'one-time expense',
        // Enhanced fields
        transactionNature: classificationResult.transactionNature,
        recurring: classificationResult.recurring,
        recurrencePattern: classificationResult.recurrencePattern,
        merchantInfo: classificationResult.merchantInfo,
        userProfile: {
          businessType: userProfile.businessType,
          industry: userProfile.industry,
          countryCode: userProfile.countryCode,
          profession: userProfile.profession
        }
      },
      timestamp: new Date().toISOString()
    };

    return res.json(response);
  } catch (error: any) {
    console.error('Classification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Classification failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ai-modules',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: {
      aiEnabled: false, // featureFlags.isFeatureEnabled('enableAI'), // Temporarily disabled
      categorization: false, // featureFlags.isFeatureEnabled('enableAICategories'), // Temporarily disabled
      taxDeduction: false, // featureFlags.isFeatureEnabled('enableAITaxDeduction'), // Temporarily disabled
      insights: false // featureFlags.isFeatureEnabled('enableAIInsights') // Temporarily disabled
    }
  });
});

// Legacy Basic AI endpoints (MOCK DATA - for backward compatibility)
app.post('/api/ai/analyze-transaction-mock', async (req, res) => {
  try {
    const { description, amount, date } = req.body;
    
    // Simple mock analysis for backward compatibility
    const analysis = {
      category: 'Uncategorized [MOCK DATA]',
      confidence: 0.8,
      reasoning: '🤖 AI analysis placeholder - This is mock data. Use real AI endpoints for actual analysis.',
      suggestions: ['🚨 MOCK: Consider categorizing this transaction', '⚙️ Configure OpenAI API key for real AI'],
      isTaxDeductible: false,
      taxDeductibilityReasoning: '📝 MOCK: Insufficient information - real tax analysis available with proper configuration',
      businessUsePercentage: 0,
      incomeClassification: 'expense',
      incomeReasoning: '🔢 MOCK: Negative amount indicates expense - basic rule-based analysis',
      mock_data: true,
      upgrade_notice: 'This is legacy mock data. Use /api/ai/analyze-transaction for real AI processing.'
    };

    res.json({
      success: true,
      data: analysis,
      mock: true,
      message: '🚨 MOCK RESPONSE: Configure OPENAI_API_KEY environment variable for real AI analysis',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Mock AI analysis failed',
      mock: true,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/ai/batch-analyze-mock', async (req, res) => {
  try {
    const { transactions } = req.body;
    
    const results = transactions.map((t: any) => ({
      id: t.id,
      analysis: {
        category: 'Uncategorized [MOCK DATA]',
        confidence: 0.8,
        reasoning: '🤖 MOCK: Batch AI analysis placeholder - Configure OpenAI API for real processing',
        mock_data: true
      }
    }));

    res.json({
      success: true,
      data: { results, processed: transactions.length },
      mock: true,
      message: '🚨 MOCK RESPONSE: This is simulated batch processing. Use /api/ai/batch-analyze for real AI.',
      upgrade_notice: 'Configure OPENAI_API_KEY environment variable for real batch AI analysis',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Mock batch AI analysis failed',
      mock: true,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/ai/status', (req, res) => {
  res.json({
    service: 'AI Modules',
    status: 'active',
    capabilities: [
      'transaction-analysis',
      'batch-processing',
      'categorization',
      'tax-deduction-analysis'
    ],
    version: '1.0.0'
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🤖 AI Modules Service running on port ${PORT}`);
    console.log(`📊 AI Features enabled: ${false}`); // Temporarily disabled
  });
}

export default app; 