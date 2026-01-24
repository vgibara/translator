import axios from 'axios';
import pino from 'pino';

const logger = pino();

export async function sendCallback(url: string, data: any, metadata?: any) {
  try {
    await axios.post(url, {
      status: 'completed',
      data,
      metadata,
      timestamp: new Date().toISOString(),
    });
    logger.info({ url }, 'Callback sent successfully');
  } catch (error: any) {
    logger.error({ url, error: error.message }, 'Failed to send callback');
    throw error; // Rethrow to trigger job retry if needed
  }
}

export async function sendErrorCallback(url: string, error: string, metadata?: any) {
  try {
    await axios.post(url, {
      status: 'failed',
      error,
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ url, error: err.message }, 'Failed to send error callback');
  }
}
