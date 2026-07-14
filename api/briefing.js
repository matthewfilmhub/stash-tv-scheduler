import { put, list } from '@vercel/blob';

const BLOB_KEY = 'briefing-config.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: load saved briefing config (notes + cadence overrides per channel) ──
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_KEY });
      if (!blobs.length) return res.status(200).json({ ok: true, config: {} });
      const response = await fetch(blobs[0].url);
      const data = await response.json();
      return res.status(200).json({ ok: true, config: data.config || {} });
    } catch (err) {
      console.error('briefing GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to load briefing config' });
    }
  }

  // ── POST: save config or send to Slack ──
  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.action) {
      return res.status(400).json({ ok: false, error: 'Missing action' });
    }

    // action: 'save' — persist notes and cadence overrides
    if (body.action === 'save') {
      if (!body.config || typeof body.config !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid config payload' });
      }
      try {
        await put(BLOB_KEY, JSON.stringify({ config: body.config, savedAt: new Date().toISOString() }), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('briefing save error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to save config' });
      }
    }

    // action: 'slack' — send weekly briefing message to #ops-channels
    if (body.action === 'slack') {
      if (!body.message) {
        return res.status(400).json({ ok: false, error: 'Missing message' });
      }

      // Option A: Slack Incoming Webhook URL (set SLACK_WEBHOOK_URL in Vercel env vars)
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      // Option B: Slack Bot Token + channel ID (set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID)
      const botToken = process.env.SLACK_BOT_TOKEN;
      const channelId = process.env.SLACK_CHANNEL_ID || 'C02A4D0RBPF'; // #filmfeed-stashtv-youtube default

      if (!webhookUrl && !botToken) {
        return res.status(503).json({
          ok: false,
          error: 'Slack not configured — add SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN to Vercel environment variables.',
        });
      }

      try {
        if (webhookUrl) {
          // Incoming Webhook approach
          const slackResp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: body.message }),
          });
          if (!slackResp.ok) {
            const errText = await slackResp.text();
            return res.status(502).json({ ok: false, error: `Slack webhook error: ${errText}` });
          }
        } else {
          // Bot token approach — chat.postMessage
          const slackResp = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${botToken}`,
            },
            body: JSON.stringify({
              channel: channelId,
              text: body.message,
              unfurl_links: false,
              unfurl_media: false,
            }),
          });
          const slackJson = await slackResp.json();
          if (!slackJson.ok) {
            return res.status(502).json({ ok: false, error: `Slack API error: ${slackJson.error}` });
          }
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('briefing slack send error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to send to Slack' });
      }
    }

    return res.status(400).json({ ok: false, error: 'Unknown action: ' + body.action });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
