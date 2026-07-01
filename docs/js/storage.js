import { STORAGE_KEYS } from './config.js';

const todayKey = () => new Date().toISOString().slice(0, 10);

export const getHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
  } catch {
    return [];
  }
};

export const saveHistoryEntry = (entry) => {
  const history = getHistory();
  const record = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ...entry
  };
  history.unshift(record);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, 200)));
  bumpStats(entry);
  return record;
};

export const bumpStats = ({ testType, summary = {} }) => {
  const stats = getStats();
  const day = todayKey();
  if (!stats[day]) {
    stats[day] = { sites: 0, phones: 0, domains: 0, failed: 0 };
  }
  if (testType === 'site') stats[day].sites += summary.total || 1;
  if (testType === 'phone') stats[day].phones += 1;
  if (testType === 'domain' || testType === 'spreadsheet') {
    stats[day].domains += summary.total || summary.checked || 1;
  }
  stats[day].failed += summary.fail || 0;
  localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
};

export const getStats = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.stats) || '{}');
  } catch {
    return {};
  }
};

export const getTodayStats = () => {
  const stats = getStats();
  return stats[todayKey()] || { sites: 0, phones: 0, domains: 0, failed: 0 };
};

export const getSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
  } catch {
    return {};
  }
};

export const saveSettings = (settings) => {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
};

export const clearHistory = () => {
  localStorage.removeItem(STORAGE_KEYS.history);
};

export const clearStats = () => {
  localStorage.removeItem(STORAGE_KEYS.stats);
};

export const clearAllData = () => {
  clearHistory();
  clearStats();
};

export const getStorageSummary = () => {
  const history = getHistory();
  const stats = getStats();
  const dayCount = Object.keys(stats).length;
  return {
    historyCount: history.length,
    statsDays: dayCount,
    oldestEntry: history.length ? history[history.length - 1].date : null
  };
};
