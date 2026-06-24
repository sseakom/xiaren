// cloudfunctions/phoneLogin/index.js
// 入参：{ cloudID?, encryptedData?, iv?, code?, sessionKey? }
//  - 优先用 cloudID（云开发自动解密，免 session_key）
//  - 兜底用 encryptedData + iv（需自行解密）
// 出参：{ success, phoneNumber, openid } 或 { success:false, error }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event /*, context*/) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    return { success: false, error: '未获取到 openid' };
  }

  let phoneNumber = '';

  // 方式 1：cloudID（推荐，零依赖解密）
  if (event && event.cloudID) {
    try {
      const res = await cloud.getOpenData({ list: [{ cloudID: event.cloudID }] });
      phoneNumber =
        (res && res.list && res.list[0] && res.list[0].data && res.list[0].data.phoneNumber) || '';
    } catch (e) {
      console.error('[phoneLogin] cloudID 解密失败', e);
    }
  }

  // 方式 2：兜底 encryptedData + iv
  if (!phoneNumber && event && event.encryptedData && event.iv) {
    try {
      const WXBizDataCrypt = require('./WXBizDataCrypt');
      const pc = new WXBizDataCrypt(wxContext.APPID, event.sessionKey || '');
      phoneNumber = pc.decryptData(event.encryptedData, event.iv).phoneNumber || '';
    } catch (e) {
      console.error('[phoneLogin] encryptedData 解密失败', e);
    }
  }

  if (!phoneNumber) {
    return { success: false, error: '未拿到手机号' };
  }

  // upsert 用户档案：以 openid 作主键，phoneNumber 作业务字段
  // 优化：原代码 set→catch→update 的回退逻辑冗余且会覆盖已有字段；
  //   现先 update（只写 phoneNumber 不覆盖其他字段），
  //   stats.updated===0 表示文档不存在 → 用 set 创建完整档案
  const now = new Date();
  try {
    const updateRes = await db
      .collection('users')
      .doc(openid)
      .update({ data: { phoneNumber, updated_at: now } });

    if (!updateRes.stats || updateRes.stats.updated === 0) {
      await db.collection('users').doc(openid).set({
        data: {
          _id: openid,
          phoneNumber,
          nickName: '',
          avatarUrl: '',
          is_admin: false,
          created_at: now,
          updated_at: now,
        },
      });
    }
  } catch (e) {
    console.error('[phoneLogin] upsert 失败', e);
    // 不阻塞返回，phoneNumber 已经拿到
  }

  return { success: true, phoneNumber, openid };
};
