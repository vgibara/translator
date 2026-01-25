import './queue/translation.worker.js';
import './queue/callback.worker.js';
import pino from 'pino';

const logger = pino();

logger.info('Translation worker started');
