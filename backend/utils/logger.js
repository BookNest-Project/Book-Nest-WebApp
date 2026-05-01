const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

export const logger = {
  error: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(JSON.stringify({ level: 'error', message, timestamp: new Date().toISOString(), ...meta }));
    }
  },
  warn: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(JSON.stringify({ level: 'warn', message, timestamp: new Date().toISOString(), ...meta }));
    }
  },
  info: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.info) {
      console.info(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...meta }));
    }
  },
  debug: (message, meta = {}) => {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.debug(JSON.stringify({ level: 'debug', message, timestamp: new Date().toISOString(), ...meta }));
    }
  },
};