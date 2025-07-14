import { BaseAIService, AIConfig, AIAgentTask, AIDataContext, AIAgentCapability } from './BaseAIService';
import { CategoriesAIAgent } from './CategoriesAIAgent';
import { TransactionClassificationAIAgent } from './TransactionClassificationAIAgent';
import { TaxDeductionAIService } from './TaxDeductionAIService';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ai-orchestrator' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

export interface AIAgentRegistry {
  id: string;
  type: string;
  agent: BaseAIService;
  capabilities: AIAgentCapability[];
  status: 'active' | 'inactive' | 'maintenance';
  priority: number;
  costPerTask: number;
}

export interface OrchestratorTask {
  id: string;
  userId: string;
  type: 'single' | 'workflow' | 'batch';
  priority: number;
  workflow?: {
    steps: AIAgentTask[];
    dependencies: Record<string, string[]>; // task_id -> [dependency_task_ids]
    parallel: boolean;
  };
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCost?: number;
  actualCost?: number;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: Array<{
    agentType: string;
    taskType: string;
    dependsOn?: string[];
    parallel?: boolean;
    required: boolean;
  }>;
  costOptimization: boolean;
  maxParallel: number;
}

export class AIOrchestrator {
  private agents: Map<string, AIAgentRegistry> = new Map();
  private taskQueue: OrchestratorTask[] = [];
  private activeTasksCount = 0;
  private maxConcurrentTasks = 5;
  private totalCostSpent = 0;
  private dailyCostLimit = 50; // $50 daily limit

  // Predefined workflows
  private workflows: Map<string, WorkflowDefinition> = new Map([
    ['fullTransactionAnalysis', {
      name: 'Full Transaction Analysis',
      description: 'Complete analysis including categorization, classification, and tax assessment',
      steps: [
        { agentType: 'CategoriesAI', taskType: 'categorizeTransaction', required: true },
        { agentType: 'TransactionClassificationAI', taskType: 'classifyTransaction', required: true, parallel: true },
        { agentType: 'TaxDeductionAI', taskType: 'analyzeTaxDeductibility', dependsOn: ['categorizeTransaction', 'classifyTransaction'], required: false }
      ],
      costOptimization: true,
      maxParallel: 3
    }],
    ['bulkProcessing', {
      name: 'Bulk Transaction Processing',
      description: 'Efficiently process large batches of transactions',
      steps: [
        { agentType: 'CategoriesAI', taskType: 'bulkCategorizeTransactions', required: true },
        { agentType: 'TransactionClassificationAI', taskType: 'bulkClassifyTransactions', required: true, parallel: true },
        { agentType: 'TaxDeductionAI', taskType: 'batchAnalyzeTaxDeductibility', dependsOn: ['bulkCategorizeTransactions', 'bulkClassifyTransactions'], required: false }
      ],
      costOptimization: true,
      maxParallel: 2
    }],
    ['smartCategorization', {
      name: 'Smart Categorization Setup',
      description: 'Analyze patterns and create optimal category structure',
      steps: [
        { agentType: 'CategoriesAI', taskType: 'analyzeAndCreateCategories', required: true },
        { agentType: 'TransactionClassificationAI', taskType: 'detectRecurringPatterns', required: true, parallel: true }
      ],
      costOptimization: true,
      maxParallel: 2
    }]
  ]);

  constructor(private config: AIConfig) {
    this.initializeAgents();
  }

  /**
   * Initialize all AI agents
   */
  private initializeAgents(): void {
    try {
      // Register Categories AI Agent
      const categoriesAgent = new CategoriesAIAgent(this.config);
      this.agents.set('CategoriesAI', {
        id: 'CategoriesAI',
        type: 'CategoriesAI',
        agent: categoriesAgent,
        capabilities: categoriesAgent.getCapabilities(),
        status: 'active',
        priority: 8,
        costPerTask: 0.05
      });

      // Register Transaction Classification AI Agent
      const classificationAgent = new TransactionClassificationAIAgent(this.config);
      this.agents.set('TransactionClassificationAI', {
        id: 'TransactionClassificationAI',
        type: 'TransactionClassificationAI', 
        agent: classificationAgent,
        capabilities: classificationAgent.getCapabilities(),
        status: 'active',
        priority: 7,
        costPerTask: 0.03
      });

      // Register Tax Deduction AI Agent
      const taxAgent = new TaxDeductionAIService(this.config);
      this.agents.set('TaxDeductionAI', {
        id: 'TaxDeductionAI',
        type: 'TaxDeductionAI',
        agent: taxAgent,
        capabilities: taxAgent.getCapabilities(),
        status: 'active',
        priority: 9,
        costPerTask: 0.08
      });

      logger.info(`🤖 AI Orchestrator initialized with ${this.agents.size} agents`);

    } catch (error) {
      logger.error('❌ Failed to initialize AI agents:', error);
      throw error;
    }
  }

  /**
   * Execute a predefined workflow
   */
  async executeWorkflow(
    workflowName: string, 
    userId: string, 
    data: any,
    priority: number = 5
  ): Promise<OrchestratorTask> {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    const context = await this.buildAIDataContext(userId);

    // Create workflow tasks
    const workflowTasks: AIAgentTask[] = workflow.steps.map((step, index) => ({
      id: `${workflowName}-${index}-${Date.now()}`,
      agentType: step.agentType,
      taskType: step.taskType,
      priority: step.required ? 10 : 5,
      data,
      status: 'pending',
      createdAt: new Date()
    }));

    // Build dependencies map
    const dependencies: Record<string, string[]> = {};
    workflow.steps.forEach((step, index) => {
      if (step.dependsOn && workflowTasks[index]) {
        const taskId = workflowTasks[index].id;
        dependencies[taskId] = step.dependsOn.map(depName => {
          const depIndex = workflow.steps.findIndex(s => s.taskType === depName);
          return workflowTasks[depIndex]?.id;
        }).filter((id): id is string => id !== undefined);
      }
    });

    // Estimate cost
    const estimatedCost = await this.estimateWorkflowCost(workflowTasks, context);

    // Check cost limits
    if (this.totalCostSpent + estimatedCost > this.dailyCostLimit) {
      throw new Error(`Would exceed daily cost limit. Estimated: $${estimatedCost}, Daily limit: $${this.dailyCostLimit}`);
    }

    // Create orchestrator task
    const orchestratorTask: OrchestratorTask = {
      id: `workflow-${workflowName}-${Date.now()}`,
      userId,
      type: 'workflow',
      priority,
      workflow: {
        steps: workflowTasks,
        dependencies,
        parallel: workflow.maxParallel > 1
      },
      data,
      status: 'pending',
      createdAt: new Date(),
      estimatedCost
    };

    this.taskQueue.push(orchestratorTask);
    
    // Start processing if under concurrent limit
    if (this.activeTasksCount < this.maxConcurrentTasks) {
      setImmediate(() => this.processQueue());
    }

    logger.info(`🚀 Workflow ${workflowName} queued for user ${userId} with estimated cost $${estimatedCost}`);

    return orchestratorTask;
  }

  /**
   * Execute a single AI task
   */
  async executeSingleTask(
    agentType: string,
    taskType: string,
    userId: string,
    data: any,
    priority: number = 5
  ): Promise<OrchestratorTask> {
    const agent = this.agents.get(agentType);
    if (!agent || agent.status !== 'active') {
      throw new Error(`Agent not available: ${agentType}`);
    }

    const context = await this.buildAIDataContext(userId);
    const estimatedCost = await agent.agent.estimateTaskCost(taskType, data);

    if (this.totalCostSpent + estimatedCost > this.dailyCostLimit) {
      throw new Error(`Would exceed daily cost limit. Estimated: $${estimatedCost}`);
    }

    const task: OrchestratorTask = {
      id: `single-${agentType}-${taskType}-${Date.now()}`,
      userId,
      type: 'single',
      priority,
      data: { agentType, taskType, data },
      status: 'pending',
      createdAt: new Date(),
      estimatedCost
    };

    this.taskQueue.push(task);

    if (this.activeTasksCount < this.maxConcurrentTasks) {
      setImmediate(() => this.processQueue());
    }

    return task;
  }

  /**
   * Execute batch processing with cost optimization
   */
  async executeBatchTasks(
    tasks: Array<{
      agentType: string;
      taskType: string;
      data: any;
    }>,
    userId: string,
    priority: number = 5
  ): Promise<OrchestratorTask> {
    const context = await this.buildAIDataContext(userId);

    // Group tasks by agent for optimization
    const agentGroups = new Map<string, any[]>();
    tasks.forEach(task => {
      if (!agentGroups.has(task.agentType)) {
        agentGroups.set(task.agentType, []);
      }
      agentGroups.get(task.agentType)!.push(task);
    });

    // Optimize each group
    const optimizedTasks: AIAgentTask[] = [];
    let totalEstimatedCost = 0;

    for (const [agentType, agentTasks] of agentGroups) {
      const agent = this.agents.get(agentType);
      if (!agent) continue;

      const agentTaskObjects: AIAgentTask[] = agentTasks.map(task => ({
        id: `batch-${agentType}-${Date.now()}-${Math.random()}`,
        agentType: task.agentType,
        taskType: task.taskType,
        priority,
        data: task.data,
        status: 'pending',
        createdAt: new Date()
      }));

      // Let agent optimize for cost
      const optimized = await agent.agent.optimizeForCost(agentTaskObjects);
      optimizedTasks.push(...optimized);

      // Estimate cost for optimized tasks
      for (const optimizedTask of optimized) {
        totalEstimatedCost += await agent.agent.estimateTaskCost(optimizedTask.taskType, optimizedTask.data);
      }
    }

    if (this.totalCostSpent + totalEstimatedCost > this.dailyCostLimit) {
      throw new Error(`Would exceed daily cost limit. Estimated: $${totalEstimatedCost}`);
    }

    const batchTask: OrchestratorTask = {
      id: `batch-${Date.now()}`,
      userId,
      type: 'batch',
      priority,
      workflow: {
        steps: optimizedTasks,
        dependencies: {},
        parallel: true
      },
      data: { originalTasks: tasks },
      status: 'pending',
      createdAt: new Date(),
      estimatedCost: totalEstimatedCost
    };

    this.taskQueue.push(batchTask);

    if (this.activeTasksCount < this.maxConcurrentTasks) {
      setImmediate(() => this.processQueue());
    }

    logger.info(`📦 Batch task queued with ${optimizedTasks.length} optimized tasks (cost: $${totalEstimatedCost})`);

    return batchTask;
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.activeTasksCount >= this.maxConcurrentTasks || this.taskQueue.length === 0) {
      return;
    }

    // Sort queue by priority
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    const task = this.taskQueue.shift();
    if (!task) return;

    this.activeTasksCount++;
    task.status = 'processing';
    task.startedAt = new Date();

    try {
      const context = await this.buildAIDataContext(task.userId);
      let result;

      switch (task.type) {
        case 'single':
          result = await this.executeSingleAgentTask(task, context);
          break;
        case 'workflow':
          result = await this.executeWorkflowTasks(task, context);
          break;
        case 'batch':
          result = await this.executeBatchAgentTasks(task, context);
          break;
      }

      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
      task.actualCost = task.estimatedCost || 0; // Update with actual cost if available

      this.totalCostSpent += task.actualCost || 0;

      logger.info(`✅ Task ${task.id} completed successfully (cost: $${task.actualCost})`);

    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();

      logger.error(`❌ Task ${task.id} failed:`, error);

    } finally {
      this.activeTasksCount--;
      
      // Continue processing queue
      if (this.taskQueue.length > 0 && this.activeTasksCount < this.maxConcurrentTasks) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Execute a single agent task
   */
  private async executeSingleAgentTask(task: OrchestratorTask, context: AIDataContext): Promise<any> {
    const { agentType, taskType, data } = task.data;
    const agent = this.agents.get(agentType);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentType}`);
    }

    const agentTask: AIAgentTask = {
      id: task.id,
      agentType,
      taskType,
      priority: task.priority,
      data,
      status: 'processing',
      createdAt: task.createdAt
    };

    return await agent.agent.executeTask(agentTask, context);
  }

  /**
   * Execute workflow tasks with dependency management
   */
  private async executeWorkflowTasks(task: OrchestratorTask, context: AIDataContext): Promise<any> {
    try {
      if (!task.workflow) {
        throw new Error('Workflow definition missing');
      }

      const { steps, dependencies, parallel } = task.workflow;
      const results = new Map<string, any>();
      const completed = new Set<string>();
      const executing = new Set<string>();

      const executeStep = async (step: AIAgentTask): Promise<void> => {
        try {
          logger.info(`📝 Executing step: ${step.taskType} on agent: ${step.agentType}`);
          
          const agent = this.agents.get(step.agentType);
          if (!agent) {
            throw new Error(`Agent not found: ${step.agentType}`);
          }

          executing.add(step.id);
          
          const result = await agent.agent.executeTask(step, context);
          results.set(step.id, result);
          completed.add(step.id);
          
          logger.info(`✅ Step completed: ${step.taskType}`);
        } catch (error: any) {
          logger.error(`❌ Step failed: ${step.taskType}`, error);
          throw error;
        } finally {
          executing.delete(step.id);
        }
      };

      const canExecute = (step: AIAgentTask): boolean => {
        const deps = dependencies[step.id] || [];
        return deps.every(dep => completed.has(dep));
      };

      // Execute steps respecting dependencies
      let maxIterations = steps.length * 2; // Prevent infinite loops
      let iterations = 0;
      
      while (completed.size < steps.length && iterations < maxIterations) {
        const readySteps = steps.filter(step => 
          !completed.has(step.id) && 
          !executing.has(step.id) && 
          canExecute(step)
        );

        if (readySteps.length === 0) {
          // No ready steps, wait for executing steps to complete
          await new Promise(resolve => setTimeout(resolve, 100));
          iterations++;
          continue;
        }

        // Execute ready steps (potentially in parallel)
        const stepPromises = readySteps.slice(0, parallel ? 5 : 1).map(executeStep);
        
        await Promise.all(stepPromises);
        iterations++;
      }

      if (completed.size < steps.length) {
        throw new Error(`Workflow execution timed out or deadlocked`);
      }

      // Return combined results
      const combinedResults = Array.from(results.entries()).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as any);

      return combinedResults;
    } catch (error: any) {
      logger.error(`❌ executeWorkflowTasks failed:`, error);
      throw error;
    }
  }

  /**
   * Execute batch tasks
   */
  private async executeBatchAgentTasks(task: OrchestratorTask, context: AIDataContext): Promise<any> {
    if (!task.workflow) {
      throw new Error('Batch workflow missing');
    }

    const { steps } = task.workflow;
    const agentGroups = new Map<string, AIAgentTask[]>();

    // Group by agent type
    steps.forEach(step => {
      if (!agentGroups.has(step.agentType)) {
        agentGroups.set(step.agentType, []);
      }
      agentGroups.get(step.agentType)!.push(step);
    });

    const results = new Map<string, any>();

    // Execute each agent's tasks
    for (const [agentType, agentTasks] of agentGroups) {
      const agent = this.agents.get(agentType);
      if (!agent) continue;

      const agentResults = await agent.agent.batchExecuteTasks(agentTasks, context);
      
      for (const [taskId, result] of agentResults) {
        results.set(taskId, result);
      }
    }

    return Object.fromEntries(results);
  }

  /**
   * Build AI data context for a user
   */
  private async buildAIDataContext(userId: string): Promise<AIDataContext> {
    // Since no database schema is defined, use mock data
    // In a real implementation, this would fetch from database
    const user = {
      id: userId,
      businessType: 'Individual',
      industry: 'General'
    };

    const transactions: any[] = []; // Mock empty transactions
    const learningFeedback: any[] = []; // Mock empty feedback

    return {
      userId,
      userProfile: {
        businessType: user.businessType || 'Individual',
        industry: user.industry || 'General',
        commonExpenses: [],
        incomeSources: [],
        taxPreferences: [],
        learningPreferences: []
      },
      historicalData: transactions,
      learningFeedback,
      preferences: {}
    };
  }

  /**
   * Estimate cost for workflow
   */
  private async estimateWorkflowCost(tasks: AIAgentTask[], context: AIDataContext): Promise<number> {
    let totalCost = 0;
    
    for (const task of tasks) {
      const agent = this.agents.get(task.agentType);
      if (agent) {
        totalCost += await agent.agent.estimateTaskCost(task.taskType, task.data);
      }
    }

    return totalCost;
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    agents: any[];
    queueLength: number;
    activeTasks: number;
    totalCostSpent: number;
    dailyLimit: number;
  } {
    return {
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        type: agent.type,
        status: agent.status,
        capabilities: agent.capabilities.length,
        metrics: agent.agent.getMetrics()
      })),
      queueLength: this.taskQueue.length,
      activeTasks: this.activeTasksCount,
      totalCostSpent: this.totalCostSpent,
      dailyLimit: this.dailyCostLimit
    };
  }

  /**
   * Get available workflows
   */
  getAvailableWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): OrchestratorTask | undefined {
    return this.taskQueue.find(task => task.id === taskId);
  }

  /**
   * Execute workflow synchronously (for immediate results)
   */
  async executeWorkflowSync(workflowName: string, userId: string, data: any): Promise<any> {
    try {
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowName}`);
      }

      // ✅ VALIDATION: Validate transaction data for transaction analysis workflows
      if (workflowName === 'fullTransactionAnalysis' && data?.transactions) {
        const validatedTransactions = this.validateTransactionData(data.transactions);
        if (validatedTransactions.length === 0) {
          throw new Error('No valid transactions found in the data');
        }
        data.transactions = validatedTransactions;
      }

      const context = await this.buildAIDataContext(userId);
      const workflowTasks = workflow.steps.map((step, index) => ({
        id: `${workflowName}-${index}-${Date.now()}`,
        agentType: step.agentType,
        taskType: step.taskType,
        priority: step.required ? 10 : 5,
        data,
        status: 'pending' as const,
        createdAt: new Date()
      }));

      const results = await this.executeWorkflowTasksSync(workflowTasks, context);
      
      // Aggregate results from all tasks
      const aggregatedResults = this.aggregateWorkflowResults(results);
      
      return aggregatedResults;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
      
      console.error('❌ executeWorkflowSync failed for ' + workflowName, {
        error: errorMessage,
        stack: errorStack
      });
      throw error;
    }
  }

  /**
   * Execute workflow tasks synchronously for immediate results
   */
  private async executeWorkflowTasksSync(workflowTasks: AIAgentTask[], context: AIDataContext): Promise<any> {
    const results: any = {};
    
    for (const task of workflowTasks) {
      const agent = this.agents.get(task.agentType);
      if (!agent) {
        console.warn(`Agent not found: ${task.agentType}`);
        continue;
      }

      try {
        const result = await agent.agent.executeTask(task, context);
        results[task.taskType] = result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Task ${task.taskType} failed: ${errorMessage}`);
        results[task.taskType] = { error: errorMessage };
      }
    }
    
    return results;
  }

  /**
   * Validate transaction data to prevent processing errors
   */
  private validateTransactionData(transactions: any[]): any[] {
    if (!Array.isArray(transactions)) {
      console.warn('⚠️ AIOrchestrator: transactions is not an array:', transactions);
      return [];
    }

    const validTransactions = transactions.filter((transaction, index) => {
      // Check if transaction is an object
      if (!transaction || typeof transaction !== 'object') {
        console.warn(`⚠️ AIOrchestrator: Invalid transaction at index ${index}:`, transaction);
        return false;
      }

      // Check required fields
      const { description, amount, merchant, id } = transaction;
      
      // At least one of description or merchant must be present
      if (!description && !merchant) {
        console.warn(`⚠️ AIOrchestrator: Transaction ${id || index} missing both description and merchant:`, transaction);
        return false;
      }

      // Amount should be a number
      if (amount !== undefined && typeof amount !== 'number') {
        console.warn(`⚠️ AIOrchestrator: Transaction ${id || index} has invalid amount:`, transaction);
        return false;
      }

      return true;
    });

    console.log(`✅ AIOrchestrator: Validated ${validTransactions.length}/${transactions.length} transactions`);
    return validTransactions;
  }

  /**
   * Aggregate results from multiple workflow tasks.
   * This is a placeholder and needs to be implemented based on how results are structured.
   * For now, it just returns the results as is.
   */
  private aggregateWorkflowResults(results: any): any {
    // This method needs to be implemented based on how the workflow results are structured.
    // For example, if the workflow is 'fullTransactionAnalysis', you might want to combine
    // categorized transactions, classified transactions, and tax deductions.
    // For now, it just returns the raw results.
    return results;
  }
} 