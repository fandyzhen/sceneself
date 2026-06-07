// 首页 'Cinema Strip Wall' 的真实素材集 — 全部来自历史 generation_job 的 R2 永久 URL。
// 由 db 一次性拉出后冻结。最新一批刷新于 2026-06-06：
//   - 9 个新组（南极/Superman/求婚/健身/直升机/演唱会/iPhone/奥斯卡/火星）= 西方男/女最近 jobs
//   - 4 个旧组保留（成为大厨/蜕变成大厨/圣诞夜市/晨跑公园）补齐 profession/transformation/seasonal/lifestyle 4 cluster
//   - 13 组共 74 张,全 8 个 storyline cluster 都有覆盖
//   - 排除了中文「变身超人」错例、冲浪场景、亚洲女性 selfie 上传的素材
// **不要直接改 URL**:若 R2 bucket 迁移,重新生成此文件。

export interface ShowcaseSet {
  id: string;                                       // 原 job id (debug 用)
  storyline: 'profession' | 'transformation' | 'fantasy_role' | 'ownership_flex' | 'journey' | 'milestone_event' | 'seasonal' | 'lifestyle';
  labelZh: string;                                  // 中文短标签 (用户可见,如 '成为大厨')
  labelEn: string;                                  // 英文短标签
  images: readonly string[];                        // 4-6 张 R2 永久 URL
}

export const SHOWCASE_SETS: readonly ShowcaseSet[] = [
  {
    "id": "9aab07da-190f-4657-bbed-873e73722742",
    "storyline": "journey",
    "labelZh": "南极度假",
    "labelEn": "Antarctica Vacation",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780732907856_fnzd85.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780732940154_s6cfok.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780732940358_fxlg3c.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780732926146_afmtwc.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780732927658_c5wh8j.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780732929070_tmk0s.png"
    ]
  },
  {
    "id": "50d65ca2-aa04-40ce-a898-2cacfd055efa",
    "storyline": "fantasy_role",
    "labelZh": "变身超人",
    "labelEn": "Become Superman",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731708779_vtl5u.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731664801_61sev.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731706293_9kkada.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731690548_klxoq4.jpg"
    ]
  },
  {
    "id": "cec684a5-91d9-4faa-9a65-d6cecffb04f2",
    "storyline": "milestone_event",
    "labelZh": "向她求婚",
    "labelEn": "I Proposed to Her",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731041795_760rj.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731057681_fa2mko.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731080421_574sq.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731075871_czkusk.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731096913_j34xa.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780731078463_z9pie8.png"
    ]
  },
  {
    "id": "e5159167-483a-49fd-810c-dfbc70479da7",
    "storyline": "milestone_event",
    "labelZh": "健身赛夺冠",
    "labelEn": "Fitness Competition Win",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730877992_t1vw4q.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730896563_bohp4o.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730917977_zqmzdc.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730913947_ibldiq.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730894990_624nn.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730919505_chw50g.png"
    ]
  },
  {
    "id": "95f27cd7-3641-4cb4-8f04-12e94d784f4a",
    "storyline": "ownership_flex",
    "labelZh": "私人直升机",
    "labelEn": "Private Helicopter",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730343195_lnt1y.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730375034_y68jgl.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730377636_2qlcf.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730418698_8tkihd.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730380097_7y57o9.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730382714_j7o8l.png"
    ]
  },
  {
    "id": "235ca57a-c497-4460-964b-d941322bd2b7",
    "storyline": "milestone_event",
    "labelZh": "我的演唱会",
    "labelEn": "My Sold-out Concert",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730101690_t5vg5.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730127297_xsu6v.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730156778_srsjf.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730135060_bawtnl.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730137396_hapfh.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780730153033_02this.jpg"
    ]
  },
  {
    "id": "f6da7b2e-081f-4009-a1dd-a4cdc74e76ed",
    "storyline": "ownership_flex",
    "labelZh": "新机入手",
    "labelEn": "New iPhone Day",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729890869_y3lkhc.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729914976_3122ox.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729964457_yhvh1t.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729955095_vaa0b.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729933231_acwes2q.png"
    ]
  },
  {
    "id": "23e82fe8-9fea-4582-b590-9635056afea8",
    "storyline": "milestone_event",
    "labelZh": "奥斯卡领奖",
    "labelEn": "Oscars Speech",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729558951_6574si.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729594863_k08q7b.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729712209_bwkbrb.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729582835_ilth2j.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729674809_am205f.jpg"
    ]
  },
  {
    "id": "5f7f4e8c-3ab5-4dd2-af13-1160866b6ace",
    "storyline": "fantasy_role",
    "labelZh": "移民火星",
    "labelEn": "Immigrating to Mars",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729390979_hyag1.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729366469_jb6rlt.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729399332_izkmf6.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729365698_onhefl.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729369546_16ys1.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780729359683_zm0po6.png"
    ]
  },
  // ── 以下 4 组从旧批次保留，补齐 profession/transformation/seasonal/lifestyle 4 个 cluster ──
  {
    "id": "6dcaeb32-a6c4-4b76-b542-0d3accdbab40",
    "storyline": "profession",
    "labelZh": "成为大厨",
    "labelEn": "Becoming a Chef",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780655745572_3cfeyj.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780655790689_7w29s8.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780655807407_c3zdlq.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780655810382_gmxsn.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780655809431_br8ctl.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780655775802_e0i5g6.png"
    ]
  },
  {
    "id": "e7a2e4d3-c5d9-4cd4-81f1-52e5c5f7c232",
    "storyline": "transformation",
    "labelZh": "蜕变成大厨",
    "labelEn": "Transforming into a Chef",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780628191353_dttxvw.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780628122838_2m2fu7.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780628165162_0mtopg.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780628188633_epe0g.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780628194939_js00nr.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780628193099_k51qmq.png"
    ]
  },
  {
    "id": "86f8dc5d-b7ce-4a00-a73f-3c7d78f7a1a8",
    "storyline": "seasonal",
    "labelZh": "圣诞夜市",
    "labelEn": "Christmas Market",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780559123377_ptfrxw.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780559125841_qefloc.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780559121942_xf0z3.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780559123243_kpbm2g.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780559123111_otyksm.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780559118941_zg67yf.jpg"
    ]
  },
  {
    "id": "056f2d40-5b00-4618-a91b-932c0ef32727",
    "storyline": "lifestyle",
    "labelZh": "晨跑公园",
    "labelEn": "Morning Run",
    "images": [
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780555166934_3s6u7q.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780555151196_c10jg.jpg",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780555161069_h4gcy.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780555197334_4aboou.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780555201911_ok9cva.png",
      "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev/images/102b86d6-05b7-40ac-9525-bdaad1fb553d/1780555191299_vwv8wq.jpg"
    ]
  }
] as const;

// 把所有图扁平化成一个线性数组,用于 marquee (50 张)。
// 同组相邻 ⇒ marquee 横向滚动时 '一组' 视觉上连续出现 (胶片孔洞带感)。
export const SHOWCASE_FLAT_IMAGES: readonly { url: string; setId: string }[] =
  SHOWCASE_SETS.flatMap(s => s.images.map(url => ({ url, setId: s.id })));
