function logError(context, error) {
  console.error(`[${context}] ${error.message}`);
}

module.exports = { logError };