const detectProvider = (webhookUrl = '') => {
  let hostname = '';
  try {
    hostname = new URL(webhookUrl).hostname.toLowerCase();
  } catch {
    hostname = '';
  }

  const provider = process.env.NOTIFIER_PROVIDER?.toLowerCase();
  if (provider) return provider;

  if (hostname === 'discord.com' || hostname.endsWith('.discord.com')) return 'discord';
  if (hostname === 'slack.com' || hostname.endsWith('.slack.com')) return 'slack';
  if (
    hostname === 'office.com' ||
    hostname.endsWith('.office.com') ||
    hostname === 'office365.com' ||
    hostname.endsWith('.office365.com')
  ) {
    return 'teams';
  }

  return 'generic';
};

const getGithubRunUrl = () => {
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) return null;
  return `${server}/${repository}/actions/runs/${runId}`;
};

const buildMarkdown = ({ environment, targetName, details, timestamp }) => {
  const runUrl = getGithubRunUrl();
  const lines = [
    `**Environment:** ${environment || 'unknown'}`,
    `**Target:** ${targetName || 'unspecified'}`,
    `**Failure:** ${details}`,
    `**Timestamp:** ${timestamp}`
  ];

  if (runUrl) {
    lines.push(`**GitHub Action Run:** ${runUrl}`);
  }

  return lines.join('\n');
};

const createPayload = (provider, title, markdown) => {
  if (provider === 'discord') {
    return { content: `## ${title}\n${markdown}` };
  }

  if (provider === 'slack') {
    return {
      text: `${title}\n${markdown}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${title}*\n${markdown}`
          }
        }
      ]
    };
  }

  if (provider === 'teams') {
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: title,
      themeColor: 'D00000',
      title,
      text: markdown.replace(/\n/g, '<br/>')
    };
  }

  return { text: `${title}\n${markdown}` };
};

export const sendNotification = async ({ title, environment, targetName, details, timestamp }) => {
  const webhookUrl = process.env.NOTIFIER_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: 'Webhook URL not configured' };

  const provider = detectProvider(webhookUrl);
  const markdown = buildMarkdown({ environment, targetName, details, timestamp });
  const payload = createPayload(provider, title, markdown);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Notification failed with status ${response.status}`);
  }

  return { sent: true, provider };
};
