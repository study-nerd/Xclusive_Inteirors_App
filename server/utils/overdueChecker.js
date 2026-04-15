// utils/overdueChecker.js
// Runs every hour to check for POs with overdue goods receipt

const { checkOverdueReceipts } = require('../modules/notifications/notifications.routes');

const startOverdueChecker = () => {
  // Run immediately on startup (after 30s delay to let DB settle)
  setTimeout(async () => {
    try {
      const count = await checkOverdueReceipts();
      if (count > 0) console.log(`📬 Overdue receipt checker: ${count} notification(s) sent`);
    } catch (err) {
      console.error('Overdue checker error:', err.message);
    }
  }, 30_000);

  // Then run every hour
  setInterval(async () => {
    try {
      await checkOverdueReceipts();
    } catch (err) {
      console.error('Overdue checker error:', err.message);
    }
  }, 60 * 60 * 1000);
};

module.exports = { startOverdueChecker };
