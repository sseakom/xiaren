// 本地替身：在 node 单测环境替代云端 wx-server-sdk
// 仅实现 listAnimations 单测所需的最小接口（database().collection().skip().limit().get()）。
// 通过 setMockAnimations 在测试内注入假数据，db 闭包读取最新 store，行为等价于真实数据库读取。
let store = { animations: [] };

function setMockAnimations(list) {
  store.animations = Array.isArray(list) ? list : [];
}

function collection() {
  return {
    skip: () => ({
      limit: () => ({
        get: async () => ({ data: store.animations }),
      }),
    }),
  };
}

const db = { collection };

const cloud = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: 'env-test',
  database: () => db,
};

module.exports = {
  __esModule: true,
  init: cloud.init,
  DYNAMIC_CURRENT_ENV: cloud.DYNAMIC_CURRENT_ENV,
  database: cloud.database,
  setMockAnimations,
  default: cloud,
};
