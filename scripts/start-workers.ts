#!/usr/bin/env ts-node

/**
 * start-workers.ts
 * 
 * This script starts the worker system for background job processing.
 * It initializes the database, registers all job processors, 
 * and starts the job scheduler.
 * 
 * Run with: 
 *   npx ts-node scripts/start-workers.ts
 * 
 * NOTE: This script is intended to be run as a separate process
 * alongside the Next.js server.
 */

import { setupDatabase } from '../lib/db';
import { jobScheduler } from '../lib/jobs/job-scheduler';

// Import processor registry to ensure all processors are registered
// This registers all processors in the /lib/jobs/processors directory
import '../lib/jobs/processors';

// Configuration with defaults
const CONCURRENCY_LIMIT = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const POLLING_INTERVAL_MS = parseInt(process.env.WORKER_POLLING_INTERVAL || '200', 10);
const JOB_TIMEOUT_MS = parseInt(process.env.WORKER_JOB_TIMEOUT || (10 * 60 * 1000).toString(), 10); // 10 minutes

/**
 * Main function to initialize and start the worker system
 */
async function main() {
  try {
    console.log('⏳ Setting up database connection...');
    await setupDatabase();
    console.log('✅ Database connection established');
    
    console.log(`🚀 Starting worker system with configuration:
- Concurrency limit: ${CONCURRENCY_LIMIT} workers
- Polling interval: ${POLLING_INTERVAL_MS}ms
- Job timeout: ${JOB_TIMEOUT_MS}ms (${JOB_TIMEOUT_MS / 60000} minutes)`);
    
    // Configure the scheduler with our settings
    // We're using the singleton instance but configuring it here
    const scheduler = jobScheduler;
    
    // Log the registered job types
    const { jobRegistry } = await import('../lib/jobs/job-registry');
    const registeredTypes = jobRegistry.getRegisteredJobTypes();
    console.log(`🔌 Registered job processors (${registeredTypes.length}): ${registeredTypes.join(', ')}`);
    
    // Start the scheduler
    scheduler.start();
    console.log('✅ Job scheduler started');
    
    // Handle graceful shutdown
    setupShutdownHandlers(scheduler);
    
    // Keep the process alive
    console.log('🔄 Worker system is now running and processing jobs');
    
    // Log status every minute
    setInterval(() => {
      const status = scheduler.getStatus();
      const activeJobs = status.activeWorkers > 0 ? `⚙️ Processing ${status.activeWorkers} jobs` : '💤 Idle';
      const queueSize = status.queueStats.total > 0 ? `📋 ${status.queueStats.total} jobs in queue` : '📋 Queue empty';
      
      console.log(`[${new Date().toISOString()}] Status: ${activeJobs}, ${queueSize}`);
      
      // Log job type distribution if there are jobs in the queue
      if (status.queueStats.total > 0) {
        const jobTypes = Object.entries(status.queueStats.byType)
          .filter(([_, count]) => (count as number) > 0)
          .map(([type, count]) => `${type}: ${count as number}`)
          .join(', ');
        
        console.log(`   Jobs by type: ${jobTypes}`);
      }
    }, 60000);
    
  } catch (error) {
    console.error('❌ Failed to start worker system:', error);
    process.exit(1);
  }
}

/**
 * Set up handlers for graceful shutdown
 */
function setupShutdownHandlers(scheduler: typeof jobScheduler) {
  // Handle graceful shutdown signals
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`\n🛑 Received ${signal}. Shutting down workers gracefully...`);
      
      // Stop accepting new jobs
      scheduler.stop();
      
      // Wait a bit for active jobs to complete
      setTimeout(() => {
        const activeWorkers = scheduler.getActiveWorkerCount();
        
        if (activeWorkers > 0) {
          console.log(`⚠️ Exiting with ${activeWorkers} active workers. Some jobs might be interrupted.`);
        } else {
          console.log('✅ All workers completed their jobs.');
        }
        
        console.log('👋 Worker system shutdown complete.');
        process.exit(0);
      }, 5000); // Give workers 5 seconds to complete
    });
  });
}

// Run the main function
main().catch(error => {
  console.error('❌ Unhandled error in worker script:', error);
  process.exit(1);
});