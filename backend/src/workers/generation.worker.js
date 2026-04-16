// Queue worker is not used — generation runs in-process without a database.
import logger from '../services/logger.js';

logger.info('Generation worker not started — queue requires a database (running in-process mode)');
