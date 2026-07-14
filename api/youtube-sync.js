// api/youtube-sync.js — Syncs YouTube channel data into stash-schedule.json blob
import { put, list } from '@vercel/blob';
import { getValidAccessToken, ytFetch } from './_youtube.js';

export const config = { maxDuration: 60 };

// How far back to look for videos (drafts + recently published)
const LOOKBACK_DAYS = 180;

// Detect if a title is a show episode and extract show name
function parseEpisodeInfo(title) {
  // Matches: "Show - S1E1", "Show S01E01", "Show: Episode 3", "Show Ep.3"
  const patterns = [
    /^(.+?)\s*[-:]\s*S(\d+)E(\d+(?:-E?\d+)?)$/i,
    /^(.+?)\s+S(\d+)E(\d+(?:-E?\d+)?)$/i,
    /^(.+?)\s*[-:]\s*(?:Episode|Ep\.?)\s*(\d+)$/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m) return { isEpisode: true, showName: m[1].trim(), contentType: 'show' };
  }
  return { isEpisode: false, showName: null, contentType: 'movie' };
}

// Map YouTube API video object → app item format
function mapVideo(video, channelName) {
  const privacy      = video.status?.privacyStatus;    // 'public' | 'private' | 'unlisted'
  const uploadStatus = video.status?.uploadStatus;     // 'uploaded' | 'processed' | 'failed'
  const publishAt    = video.status?.publishAt;        // ISO string if scheduled
  const ytRating     = video.contentDetails?.contentRating?.ytRating;
  const isAgeRestricted = ytRating === 'ytAgeRestricted';

  const today = new Date().toISOString().slice(0, 10);
  const publishDate = publishAt ? new Date(publishAt) : null;
  const pubDateStr  = publishDate ? publishDate.toISOString().slice(0, 10) : null;

  let status;
  if (uploadStatus === 'uploaded') {
    status = 'transcoding';
  } else if (privacy === 'private' && pubDateStr && pubDateStr >= today) {
    status = 'scheduled';
  } else if (privacy === 'public') {
    status = 'published';
  } else if (privacy === 'unlisted') {
    status = 'unlisted';
  } else {
    status = 'draft'; // private with no future publish date
  }

  const title = video.snippet?.title || '';
  const { isEpisode, showName, contentType } = parseEpisodeInfo(title);

  return {
    videoId:       video.id,
    channel:       channelName,
    title,
    visibility:    privacy || 'private',
    restrictions:  isAgeRestricted ? 'Age-restricted' : '',
    publishDate,
    createdDate:   video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : null,
    uploadDate:    null,
    daysBetween:   null,
    priority:      null,
    hasCIC:        false, // not available via YouTube Data API v3 — requires Content ID API
    isAgeRestricted,
    disputeStatus: '',
    titleFormat:   contentType === 'show' ? 'Show' : 'Movie',
    contentType,
    isEpisode,
    showName,
    status,
    takedown:      '',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const accessToken = await getValidAccessToken();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    // ── 1. Get all channels for this account ───────────────────────────
    const channelsResp = await ytFetch(accessToken,
      'channels?part=snippet,contentDetails&mine=true&maxResults=50'
    );

    const allItems   = [];
    const channelSet = new Set();
    let apiCalls     = 1;

    for (const ch of channelsResp.items || []) {
      const channelName      = ch.snippet.title;
      const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) continue;

      channelSet.add(channelName);
      const videoIds  = [];
      let pageToken   = null;
      let stopPaging  = false;

      // ── 2. Paginate uploads playlist ────────────────────────────────
      while (!stopPaging) {
        const path = `playlistItems?part=contentDetails,snippet&playlistId=${uploadsPlaylistId}&maxResults=50`
          + (pageToken ? `&pageToken=${pageToken}` : '');
        const page = await ytFetch(accessToken, path);
        apiCalls++;

        for (const item of page.items || []) {
          // Uploads playlist is newest-first — stop once we pass cutoff
          const uploaded = new Date(item.snippet?.publishedAt || 0);
          if (uploaded < cutoff) { stopPaging = true; break; }
          const videoId = item.contentDetails?.videoId;
          if (videoId) videoIds.push(videoId);
        }

        pageToken = page.nextPageToken;
        if (!pageToken) stopPaging = true;
      }

      // ── 3. Get video details in batches of 50 ───────────────────────
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50).join(',');
        const videoResp = await ytFetch(accessToken,
          `videos?part=snippet,status,contentDetails&id=${batch}&maxResults=50`
        );
        apiCalls++;
        for (const video of videoResp.items || []) {
          allItems.push(mapVideo(video, channelName));
        }
      }
    }

    // ── 5. Overlay CIC data (Notion preferred, CSV upload as fallback) ──
    try {
      let cic = null;
      for (const blobKey of ['notion-cic.json', 'csv-cic.json']) {
        const { blobs: cicBlobs } = await list({ prefix: blobKey });
        if (cicBlobs.length) {
          const cicResp = await fetch(cicBlobs[0].url);
          cic = await cicResp.json();
          break; // use first source found; Notion wins if both exist
        }
      }
      if (cic) {
        const norm = t => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const item of allItems) {
          const entry = (item.videoId && cic.byVideoId[item.videoId]) || cic.byTitle[norm(item.title)];
          if (entry) {
            item.hasCIC = entry.hasCIC || entry.hasMusicCIC;
            if (!item.isAgeRestricted && entry.isAgeRestricted) item.isAgeRestricted = true;
          }
        }
      }
    } catch (e) {
      console.warn('CIC overlay skipped:', e.message);
    }

    // ── 4. Save to blob in the same format the app already reads ──────
    const payload = {
      items:      allItems,
      channels:   [...channelSet].sort(),
      hasPriority: false,
      syncedAt:   new Date().toISOString(),
      source:     'youtube_api',
      apiCalls,
    };

    await put('stash-schedule.json', JSON.stringify(payload), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return res.status(200).json({
      ok: true,
      channelCount: channelSet.size,
      itemCount: allItems.length,
      apiCalls,
      syncedAt: payload.syncedAt,
    });

  } catch (err) {
    console.error('YouTube sync error:', err);
    const notAuth = err.message === 'not_authenticated';
    return res.status(notAuth ? 401 : 500).json({
      ok: false,
      error: err.message,
      notAuthenticated: notAuth,
    });
  }
}
