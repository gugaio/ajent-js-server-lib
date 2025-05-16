class Logger {
    static info(message) {
      console.log(`[INFO] ${message}`);
    }
    
    static warn(message) {
      console.warn(`[WARNING] ${message}`);
    }
    
    static error(message) {
      console.error(`[ERROR] ${message}`);
    }
    
    static debug(message) {
      console.debug(`[DEBUG] ${message}`);
    }
  }
  
  module.exports = Logger;