// cloudfunctions/animationSubmit/index.js
// 动画提交入口（用户录入新动画 / 详情页勘误）
// 入参：
//   - mode: 'create' | 'correction'
//       create     → 新建一条 status=2 记录（需全部必填字段）
//       correction → 保留原 bvid + 拷贝原动画其他字段，只允许改 title + tag
//   - payload:
//       create:     { title, bvid, up_name, cover, duration, tag, url?, play_count?, like_count?, publish_time }
//       correction: { title, tag }
//   - correction_of?:  原动画 _id（仅 correction 模式）
// 返回：{ success, data: { _id, status } } 或 { success: false, error }
//
// 校验规则：
//   1. create: 必填 title/bvid/up_name/cover/duration/publish_time/tag；bvid 格式 + 唯一性
//   2. correction: 必填 title + tag；其他字段从原动画拷贝；bvid 沿用原值
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/** create 模式必填字段统一校验 */
function validateCreatePayload(p) {
  if (!p) return '表单为空';
  const required = ['title', 'bvid', 'up_name', 'cover', 'duration', 'publish_time', 'tag'];
  for (const k of required) {
    if (p[k] === undefined || p[k] === null || p[k] === '') {
      return `缺少必填字段：${k}`;
    }
  }
  if (typeof p.duration !== 'number' || p.duration <= 0) {
    return 'duration 必须为正数（秒）';
  }
  if (typeof p.bvid !== 'string' || !/^BV1[A-Za-z0-9]{8,}$/.test(p.bvid)) {
    return 'bvid 格式不正确（应为 BV 开头 10+ 位的 B 站视频 ID）';
  }
  return null;
}

/** correction 模式只校验 title + tag */
function validateCorrectionPayload(p) {
  if (!p) return '表单为空';
  if (!p.title || !String(p.title).trim()) return '标题不能为空';
  if (!p.tag || !String(p.tag).trim()) return '标签不能为空';
  return null;
}

/**
 * bvid 唯一性校验
 *  - 「同 bvid + 状态为 1 或 2」视为已占用（不允许再提交）
 *  - 状态 3（驳回）的同 bvid 记录允许用户重新提交
 */
async function checkBvidUnique(bvid, excludeId) {
  const res = await db
    .collection('animations')
    .where({
      bvid,
      status: _.in([1, 2]),
    })
    .limit(10)
    .get();
  const conflict = (res.data || []).filter((it) => it._id !== excludeId);
  return conflict.length === 0;
}

async function checkBvidUniqueAction(bvid) {
  const ok = await checkBvidUnique(bvid);
  return { success: true, data: { unique: ok } };
}

async function submit(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '未登录' };

  const mode = event.mode || 'create';
  const payload = event.payload || {};

  if (mode === 'create') {
    const err = validateCreatePayload(payload);
    if (err) return { success: false, error: err };
  } else if (mode === 'correction') {
    const err = validateCorrectionPayload(payload);
    if (err) return { success: false, error: err };
  } else {
    return { success: false, error: '不支持的 mode' };
  }

  let correctionOf = null;
  let orig = null;
  if (mode === 'correction') {
    correctionOf = event.correction_of;
    if (!correctionOf) {
      return { success: false, error: '勘误模式缺少 correction_of' };
    }
    try {
      orig = await db.collection('animations').doc(correctionOf).get();
    } catch (e) {
      return { success: false, error: '原动画不存在' };
    }
  }

  // bvid 唯一性（仅 create 模式；correction 沿用原 bvid）
  if (mode === 'create') {
    const unique = await checkBvidUnique(payload.bvid);
    if (!unique) {
      return { success: false, error: 'bvid 已存在（已被使用或正在审核中）' };
    }
  }

  const now = new Date();
  let doc;
  if (mode === 'correction') {
    // 勘误：拷贝原动画所有字段，只覆盖 title + tag
    const o = orig.data;
    doc = {
      ...o,
      _id: undefined, // 不可拷贝 _id
      title: String(payload.title).trim(),
      tag: String(payload.tag).trim(),
      status: 2,
      submitter_openid: openid,
      submitted_at: now,
      correction_of: correctionOf,
      // 清空审核相关字段（新提交待审）
      reviewer_openid: undefined,
      review_time: undefined,
      review_comment: undefined,
      // 时间戳
      update_time: now,
    };
    // 清理 undefined，避免 db.add 拒绝
    Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);
  } else {
    doc = {
      title: String(payload.title).trim(),
      bvid: String(payload.bvid).trim(),
      url: payload.url ? String(payload.url).trim() : `https://www.bilibili.com/video/${payload.bvid}`,
      up_name: String(payload.up_name).trim(),
      cover: String(payload.cover).trim(),
      duration: Number(payload.duration),
      play_count: Number(payload.play_count) || 0,
      like_count: Number(payload.like_count) || 0,
      publish_time: new Date(payload.publish_time),
      update_time: now,
      tag: String(payload.tag).trim(),
      status: 2,
      submitter_openid: openid,
      submitted_at: now,
    };
  }

  try {
    const res = await db.collection('animations').add({ data: doc });
    return { success: true, data: { _id: res._id, status: 2 } };
  } catch (e) {
    console.error('[animationSubmit] 写入失败', e);
    return { success: false, error: e.message };
  }
}

exports.main = async (event /*, context*/) => {
  // 提供独立 action 用于前端实时校验
  if (event.action === 'checkBvidUnique') {
    return checkBvidUniqueAction(event.bvid);
  }
  return submit(event);
};
