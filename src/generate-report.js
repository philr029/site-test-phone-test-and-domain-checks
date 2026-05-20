import { loadTargetsConfig } from './config/target-loader.js';
import { buildRunReport, writeReports } from './reporting/report-builder.js';

const run = async () => {
  const config = await loadTargetsConfig();
  const report = await buildRunReport(config.environment);
  const paths = await writeReports(report);

  console.log(JSON.stringify({ status: report.status, ...paths }));
};

run();
