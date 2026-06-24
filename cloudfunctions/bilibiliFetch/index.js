// cloudfunctions/bilibiliFetch/index.js
// 入参：{ bvid: 'BV1xx...' | 'https://www.bilibili.com/video/BV1xx...' }
// 返回：{ success, data: { title, cover, up_name, duration, play_count, like_count, publish_time, url, tags } }
//
// B 站视频信息 API：https://api.bilibili.com/x/web-interface/view?bvid=xxx
//   - 需要 UA + Referer 头，不需要登录态
// 用 Node 原生 https 模块拉取（云函数 Node 14 跑，无全局 fetch）
const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BV_REGEX = /^BV1[A-Za-z0-9]{8,}$/;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 10_000;

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 用 https 调 B 站 API（云函数环境无全局 fetch） */
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Referer: 'https://www.bilibili.com/',
          Accept: 'application/json',
        },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error(`JSON 解析失败：${e.message}`));
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error(`请求超时（${REQUEST_TIMEOUT / 1000}s）`));
    });
    req.on('error', (e) => reject(e));
  });
}

/** 从输入中提取 bvid（支持纯 bvid / B 站视频 URL） */
function extractBvid(raw) {
  if (BV_REGEX.test(raw)) return raw;
  const m = raw.match(/\/video\/(BV1[A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

exports.main = async (event /*, context*/) => {
  const raw = ((event && event.bvid) || '').toString().trim();
  if (!raw) return { success: false, error: '请提供 bvid' };

  const bvid = extractBvid(raw);
  if (!bvid) {
    return { success: false, error: 'bvid 格式不正确（应为 BV 开头 10+ 位）' };
  }

  // 优化：视频信息 + tag 并行拉取（原为串行两次 await，耗时翻倍）
  // 视频信息必须成功，tag 失败不阻塞主流程
  const videoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const tagUrl = `https://api.bilibili.com/x/tag/archive/tags?bvid=${encodeURIComponent(bvid)}`;

  let json, tagJson;
  try {
    [json, tagJson] = await Promise.all([
      httpGetJson(videoUrl),
      httpGetJson(tagUrl).catch((e) => {
        console.warn('[bilibiliFetch] tags 拉取失败（非阻塞）', e && e.message);
        return null;
      }),
    ]);
  } catch (e) {
    console.error('[bilibiliFetch] network fail', e);
    return { success: false, error: `拉取失败：${e.message || '网络异常'}` };
  }

  if (!json || json.code !== 0) {
    const msg = (json && json.message) || `B 站返回错误 (code=${json && json.code})`;
    return { success: false, error: msg };
  }

  const d = json.data || {};
  const pubdateSec = Number(d.pubdate) || 0;
  const pubDate = pubdateSec > 0 ? new Date(pubdateSec * 1000) : new Date();

  // 解析 tag（失败时为空数组）
  let tagNames = [];
  if (tagJson && tagJson.code === 0 && Array.isArray(tagJson.data)) {
    tagNames = tagJson.data
      .map((t) => (t && typeof t.tag_name === 'string' ? t.tag_name.trim() : ''))
      .filter(Boolean);
  }

  return {
    success: true,
    data: {
      bvid,
      title: d.title || '',
      cover: d.pic || '',
      up_name: (d.owner && d.owner.name) || '',
      duration: Number(d.duration) || 0,
      play_count: (d.stat && Number(d.stat.view)) || 0,
      like_count: (d.stat && Number(d.stat.like)) || 0,
      publish_time: formatDateTime(pubDate),
      url: `https://www.bilibili.com/video/${bvid}`,
      tags: tagNames,
    },
  };
};
