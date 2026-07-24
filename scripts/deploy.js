#!/usr/bin/env node
/**
 * miniprogram-ci 部署脚本
 *
 * 作用：命令行上传「微信小程序体验版」与「云函数」，无需微信开发者工具 GUI。
 *
 * 前提：
 *   1) 已在项目根放置代码上传密钥 private.wx29eab22ac6c0cfe7.key
 *      （微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥，已加入 .gitignore）
 *   2) 已在公众平台配置 IP 白名单
 *   3) 上传体验版前先 yarn build:weapp 产出 dist/
 *
 * 用法：
 *   node scripts/deploy.js                          # 上传体验版 + 全部云函数
 *   node scripts/deploy.js code [版本号] [robot]     # 只上传体验版（版本号/robot 可选，默认取 package.json / robot=1）
 *   node scripts/deploy.js cloud                    # 上传全部云函数
 *   node scripts/deploy.js cloud rating             # 只上传指定云函数
 *
 * 等价 npm script：
 *   yarn upload:all / yarn upload:code / yarn upload:cloud
 */

const ci = require('miniprogram-ci')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const APPID = 'wx29eab22ac6c0cfe7'
const ROOT = path.resolve(__dirname, '..')
const KEY_PATH = path.resolve(ROOT, `private.${APPID}.key`)
const CF_ROOT = path.resolve(ROOT, 'cloudfunctions')
const CLOUD_ENV = 'cloud1-d0gk61vsuefecd8cf' // 云环境 ID（取自 services/cloud.ts）

// projectPath 必须是含 project.config.json 的项目根
// miniprogram-ci 会自动读取其中的 miniprogramRoot=dist、cloudfunctionRoot
function createProject() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`❌ 未找到代码上传密钥：${KEY_PATH}`)
    console.error('   请到微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥 下载，并放到项目根目录。')
    process.exit(1)
  }
  return new ci.Project({
    appid: APPID,
    type: 'miniProgram',
    projectPath: ROOT,
    privateKeyPath: KEY_PATH,
    ignores: ['node_modules/**/*'],
  })
}

function listCloudFunctions() {
  return fs
    .readdirSync(CF_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

/**
 * 获取当前 git 分支与短 commit hash，用于上传 desc 提升版本辨识度。
 * git 不可用时返回空串，不影响上传。
 */
function gitInfo() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim()
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    return { branch, hash }
  } catch {
    return { branch: '', hash: '' }
  }
}

async function uploadCode(project, ver, robot) {
  const version = ver || require(path.resolve(ROOT, 'package.json')).version
  const { branch, hash } = gitInfo()
  const gitPart = branch || hash ? `${branch ? branch + '@' : ''}${hash}` : ''
  const desc = `v${version}${gitPart ? ' ' + gitPart : ''} ${new Date().toLocaleString('zh-CN')}`
  const uploadOpts = { project, version, desc, setting: { es6: false, minify: true } }
  if (robot) uploadOpts.robot = Number(robot)
  await ci.upload(uploadOpts)
  console.log(`✅ 体验版上传完成（v${version}${robot ? ', robot=' + robot : ''}）`)
}

async function uploadCloud(project, name) {
  const result = await ci.cloud.uploadFunction({
    project,
    env: CLOUD_ENV,
    name,
    path: path.resolve(CF_ROOT, name),
    remoteNpmInstall: true, // 云端安装依赖，无需本地预装
  })
  console.log(`✅ 云函数 ${name} 上传完成`, result || '')
}

async function uploadAllCloud(project) {
  const fns = listCloudFunctions()
  console.log(`开始上传 ${fns.length} 个云函数：${fns.join(', ')}`)
  for (const name of fns) {
    await uploadCloud(project, name)
  }
}

;(async () => {
  const [action, name, robot] = process.argv.slice(2)
  const project = createProject()
  try {
    if (action === 'code') {
      await uploadCode(project, name, robot)
    } else if (action === 'cloud') {
      name ? await uploadCloud(project, name) : await uploadAllCloud(project)
    } else {
      await uploadCode(project)
      await uploadAllCloud(project)
    }
  } catch (e) {
    console.error('❌ 上传失败：', e)
    process.exit(1)
  }
})()
