import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { featureFlags } from '@ai2/shared';

const app = express();
const PORT = process.env.AI_PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ai-modules',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: {
      aiEnabled: featureFlags.isFeatureEnabled('enableAI'),
      categorization: featureFlags.isFeatureEnabled('enableAICategories'),
      taxDeduction: featureFlags.isFeatureEnabled('enableAITaxDeduction'),
      insights: featureFlags.isFeatureEnabled('enableAIInsights')
    }
  });
});

// Basic AI endpoints
app.post('/api/ai/analyze-transaction', async (req, res) => {
  try {
    const { description, amount, date } = req.body;
    
    // Simple mock analysis for now
    const analysis = {
      category: 'Uncategorized',
      confidence: 0.8,
      reasoning: 'AI analysis placeholder',
      suggestions: ['Consider categorizing this transaction'],
      isTaxDeductible: false,
      taxDeductibilityReasoning: 'Insufficient information',
      businessUsePercentage: 0,
      incomeClassification: 'expense',
      incomeReasoning: 'Negative amount indicates expense'
    };

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'AI analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/ai/batch-analyze', async (req, res) => {
  try {
    const { transactions } = req.body;
    
    const results = transactions.map((t: any) => ({
      id: t.id,
      analysis: {
        category: 'Uncategorized',
        confidence: 0.8,
        reasoning: 'Batch AI analysis placeholder'
      }
    }));

    res.json({
      success: true,
      data: { results, processed: transactions.length },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Batch AI analysis failed',
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
    console.log(`📊 AI Features enabled: ${featureFlags.isAIEnabled()}`);
  });
}

export default app; 