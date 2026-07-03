const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 数据有变更时，手动修改这个版本号即可触发前端重拉全量快照。
const ANIMATIONS_DATASET_VERSION = '2026-07-03-v1';

exports.main = async () => {
  return {
    success: true,
    version: ANIMATIONS_DATASET_VERSION,
  };
};
