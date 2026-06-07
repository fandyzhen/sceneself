import type { StorylineType, SceneTone, Era } from "@/lib/scene/types";

export interface FocusOption {
  id: string;
  label: string;          // 中文 UI 展示名
  // 英文执行指令(注入 LLM prompt),告诉模型"选了这个 focus 时 6 张该怎么拍"。
  // 旧实现只传 label(如"幕后真实"),LLM 缺执行指引几乎忽略;promptFragment 让 Q2 真正影响 beat 设计。
  promptFragment: string;
}

export interface StorylineTypeDef {
  id: StorylineType;
  label: string;                 // 中文
  organizingLogic: string;       // 英文:6 个场景如何组织(注入故事线生成 prompt)
  continuityLock: string;        // 英文:连贯靠什么(注入 prompt)
  focusOptions: FocusOption[];   // Q2 侧重专属选项(含 promptFragment)
  toneBias: string[];            // 该类默认高亮的调性 id
  test: RegExp;                  // 关键词(中英),用于 fallback 分类
  era: Era;                      // 时代约束:modern/historical/fantasy/future
  allowSelfie: boolean;          // 是否允许自拍视角
  allowModernProps: boolean;     // 是否允许现代道具(手机/现代包等)
  attireHint: string;            // 英文造型指引,注入造型生成 prompt
}

export const STORYLINE_TYPES: StorylineTypeDef[] = [
  {
    id: "ownership_flex",
    label: "拥有炫耀",
    organizingLogic: "Orbit one owned hero object: each photo a different scene/use of it, every shot makes it unmistakably the subject's own.",
    continuityLock: "the exact same object (lock its color/model/markings) + main outfit",
    focusOptions: [
      {id:"luxury",label:"极致豪华",promptFragment:"spotlight the object's high-end craftsmanship and exclusive context — soaring lobbies, valet drives, private hangars, monogrammed details that scream tier-1 ownership"},
      {id:"lifestyle",label:"上流生活方式",promptFragment:"weave the object into routines only the privileged have — Sunday brunch on the deck, evening commutes via helipad, weekend escapes that feel effortless"},
      {id:"social",label:"社交名利场",promptFragment:"the object as a stage for social gravity — friends arriving, valets handling it, bystanders glancing, the subject the center of attention around it"},
      {id:"detail",label:"质感细节",promptFragment:"linger on tactile, intimate proof of quality — stitched leather, dial faces, badge close-ups, the kind of detail only owners notice"},
    ],
    toneBias: ["versailles_flex","cinematic_drama"],
    test: /买|购入|拥有|我的|私人(飞机|游艇|直升机)|豪车|跑车|名表|劳力士|法拉利|兰博基尼|保时捷|游艇|直升机|mansion|bought|i own|ferrari|lamborghini|porsche|yacht|rolex|helicopter|private jet/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: true,
    attireHint: "affluent restraint, NEVER loud branding. Output as a comma list with explicit color+material for EACH piece, e.g. 'charcoal grey cashmere crewneck sweater, oatmeal beige tailored wool trousers, a thin gold watch on the left wrist, soft black leather loafers'. NO logos, NO graphic prints. Lock the same exact colors across all beats.",
  },
  {
    id: "fantasy_role",
    label: "幻想角色",
    organizingLogic: "Greatest-hits of one fantasy identity: different iconic moments of that character/world, NOT a time arc.",
    continuityLock: "the same costume + the same world/era aesthetic",
    focusOptions: [
      {id:"world",label:"世界观沉浸",promptFragment:"immerse in the world's textures — its architecture, weather, ambient population, implied sounds — so the setting feels lived-in, not a backdrop"},
      {id:"charisma",label:"角色魅力",promptFragment:"each beat showcases a facet of THIS character's signature charisma — their gait, their gaze, their command of space, the way others react around them"},
      {id:"epic",label:"史诗大场面",promptFragment:"scale matters — sweeping vistas, massed crowds, charging hordes, towering architecture; the subject is one figure in something vast"},
      {id:"aesthetic",label:"唯美意境",promptFragment:"prioritize painterly beauty — composition, color harmony, evocative weather/lighting; each frame could be a film still or oil painting"},
    ],
    toneBias: ["cinematic_drama","epic_blood"],
    test: /穿越|古代|未来|超人|英雄|超级英雄|动漫|武侠|仙侠|赛博朋克|魔法|变身|cosplay|超能力|superhero|fantasy|time travel|cyberpunk|anime|warrior/i,
    era: "fantasy",
    allowSelfie: false,
    allowModernProps: false,
    attireHint: "full period/character ensemble — output every visible piece as a comma list with explicit color+material+named identifier. MANDATORY pieces by archetype: ancient warrior → '[color] iron-banded helmet OR ornate full crown, [color] lamellar/scale armor over [color] silk war robe, leather pauldrons, [color] cloak with [trim color] trim, iron sword belt, leather boots'; superhero → '[primary color] form-fitting suit with [color] chest emblem, [color] cape (if applicable), [color] cowl/mask (if applicable), [color] boots, [color] gloves'; ancient noble → '[color] silk court robe, [color] embroidered sash, jade hair ornament, embroidered slippers'. The HEADWEAR/CROWN/HELMET/MASK MUST be listed if the archetype implies one — never omit it. Absolutely NO modern clothing.",
  },
  {
    id: "milestone_event",
    label: "高光事件",
    organizingLogic: "Event arc across one occasion: prep -> the peak moment -> celebration, different stages.",
    continuityLock: "the same event setting + main outfit",
    focusOptions: [
      {id:"peak",label:"高光时刻",promptFragment:"at least 3 beats must depict THE moment itself or its immediate edges — the cue, the act, the first reaction — not just before/after wrappers"},
      {id:"prep",label:"幕后准备",promptFragment:"dwell on the unseen prep — fingers tying a tie, last-glance mirror checks, deep breaths in a hallway, the small rituals before the moment"},
      {id:"celebrate",label:"欢庆",promptFragment:"the aftermath energy — embraces, raised glasses, confetti, the loosening of formality, the texture of shared joy"},
      {id:"emotion",label:"情感",promptFragment:"eyes and microexpressions carry each beat — the verge of tears, the swallowed laugh, the held breath; quiet over spectacle"},
    ],
    toneBias: ["narrative_doc","surprise_highlight"],
    test: /毕业|婚礼|生日|升职|开业|获奖|典礼|周年|纪念日|graduation|wedding|birthday|anniversary|ceremony|award|launch/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: false,
    attireHint: "occasion-specific formal outfit, locked color across the WHOLE set. Output every piece with explicit color+material. By occasion: wedding bride → 'ivory satin floor-length gown, matching veil, ivory satin heels, simple pearl earrings'; wedding groom → 'black wool tuxedo jacket, black tuxedo trousers, white pleated dress shirt, black silk bow tie, black patent leather shoes'; graduation → 'black graduation gown, black mortarboard cap with gold tassel on the right side (CAP MUST BE WORN in every beat), regular shoes underneath'; gala/award → 'single-color (specify) floor-length evening gown OR matching tuxedo'. NO casual jeans/sneakers/t-shirts anywhere.",
  },
  {
    id: "profession",
    label: "职业身份",
    organizingLogic: "Identity facets of one role: at work / focused / candid break / signature moment, different sides.",
    continuityLock: "the same professional attire + workplace",
    focusOptions: [
      {id:"authority",label:"专业权威",promptFragment:"the subject in command of the room — others deferring, instruments wielded with practiced ease, posture and gaze that say 'this is mine'"},
      {id:"warm",label:"亲和温度",promptFragment:"human moments inside the role — a patient's hand held, a junior coached, eye contact that says 'I see you', the warmth profession often hides"},
      {id:"backstage",label:"幕后真实",promptFragment:"the unglamorous reality the public doesn't see — the 4am prep, the broken equipment, the exhausted slump between rushes, the real labor"},
      {id:"peak",label:"高光时刻",promptFragment:"the signature moment that defines this profession — the dish presented to a master, the surgery's final stitch, the keynote landed; capture witness reactions around the subject"},
    ],
    toneBias: ["narrative_doc","cinematic_drama"],
    test: /ceo|总裁|创始人|医生|律师|飞行员|机长|厨师|主厨|艺术家|设计师|程序员|教师|executive|founder|doctor|lawyer|pilot|chef|artist/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: false,
    attireHint: "the profession's COMPLETE real uniform — output as a comma list with EVERY required piece, color + material. MANDATORY full sets (the headwear/hat item MUST be the FIRST item in the outfit string, never omit it): chef → 'tall white chef toque hat (mandatory headwear), crisp white double-breasted chef jacket with rolled sleeves, black or dark grey checkered chef trousers, white knee-length bistro apron (white, not khaki or beige)'; doctor → 'white knee-length lab coat over light blue surgical scrubs, black stethoscope around the neck, white sneakers'; surgeon → 'light blue surgical scrub cap (mandatory headwear), light blue surgical mask pulled down at the neck, light blue scrub top and trousers'; pilot → 'four-stripe black captain peaked cap (mandatory headwear), navy airline jacket with four gold sleeve stripes and gold wings pin on the chest, matching navy trousers, white shirt, black tie, black leather shoes'; executive → 'sharp charcoal wool tailored blazer, matching charcoal trousers or pencil skirt, crisp white shirt, leather oxford shoes'. Accessory should be a SIMPLE held/worn item (NEVER a small tool/spoon tucked into a pocket — those render as floating objects).",
  },
  {
    id: "transformation",
    label: "蜕变成长",
    organizingLogic: "Contrast arc: from one state toward another, showing the change across the set.",
    continuityLock: "the same person identity; the transformation theme",
    focusOptions: [
      {id:"before_after",label:"前后对比",promptFragment:"the set MUST read as a visible arc — at least one early beat shows the 'before' state and at least one late beat shows the transformed 'after'"},
      {id:"process",label:"过程记录",promptFragment:"the middle is the story — sweat, repetition, small wins, the unsexy grind; each beat a different day or phase in the process"},
      {id:"result",label:"成果绽放",promptFragment:"lean toward the payoff — the new self in their new context, confident, claimed by the change, witnesses noticing"},
    ],
    toneBias: ["epic_blood","narrative_doc"],
    test: /减肥|增肌|健身蜕变|变装|改造|蜕变|逆袭|transformation|glow up|makeover|weight loss/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: true,
    attireHint: "TWO distinct locked looks — output BOTH in attire.outfit as 'START LOOK: <comma list with color+material for each piece>; END LOOK: <comma list with color+material for each piece>'. The set splits cleanly: beats 1-3 wear the START look, beats 4-6 wear the END look. NO gradual blending or mixing between the two. Examples: weight loss → 'START LOOK: oversized grey hoodie, baggy black sweatpants, worn black sneakers; END LOOK: fitted black athletic tank, slim black leggings, white running shoes'. Each piece needs explicit color+material.",
  },
  {
    id: "seasonal",
    label: "节日季节",
    organizingLogic: "Atmosphere spread of one festival/season: different scenes & activities of it.",
    continuityLock: "the festival/season elements + main outfit",
    focusOptions: [
      {id:"festive",label:"节日氛围",promptFragment:"saturate every beat with the festival's signature signals — decorations, lights, foods, gatherings, the unmistakable visual code of this holiday"},
      {id:"cozy",label:"温馨治愈",promptFragment:"warm, intimate, indoor or twilight; small gatherings, hot drinks, candlelight, the protected feeling of the season"},
      {id:"scenery",label:"季节风景",promptFragment:"the season's natural beauty centerstage — snow on branches, sakura tunnels, autumn maples, foggy mornings; subject inside the landscape"},
      {id:"party",label:"欢聚",promptFragment:"people-rich beats — friends, family, hosts, guests; mid-celebration energy, raised glasses, costumes, dance, shared frames"},
    ],
    toneBias: ["healing_chill","romantic"],
    test: /圣诞|万圣节|新年|春节|樱花|秋天|雪景|节日|christmas|halloween|new year|sakura|autumn|snow|festival/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: true,
    attireHint: "season/festival-iconic outfit, LOCKED across all beats. Output every piece with explicit color+material; the iconic headwear/hat MUST be the FIRST item when applicable. By season: snow → 'cream wool beanie (mandatory headwear in outdoor beats), cream chunky wool turtleneck sweater, charcoal wool coat, dark blue denim jeans, brown leather snow boots, beige knit scarf'; Christmas → 'red knit Christmas sweater with white snowflake pattern, dark blue jeans, brown leather boots'; Halloween → '<specific costume with named character pieces, color+material for each>'; sakura → 'pale pink linen blouse, white pleated midi skirt, white canvas sneakers, beige straw boater hat'; autumn → 'rust orange wool sweater, brown corduroy trousers, brown leather ankle boots, mustard yellow knit scarf'. NEVER write 'warm winter clothes' — list every piece.",
  },
  {
    id: "lifestyle",
    label: "生活美学",
    organizingLogic: "Theme variations of one aesthetic: different moments sharing the same vibe.",
    continuityLock: "the aesthetic mood + main outfit",
    focusOptions: [
      {id:"calm",label:"松弛日常",promptFragment:"slow, unrushed, low-stakes — coffee at the window, a book at noon, a walk that goes nowhere; the antithesis of hustle"},
      {id:"active",label:"活力运动",promptFragment:"motion and effort — mid-stride, mid-stretch, sweat, post-workout glow; the body engaged, not just posed"},
      {id:"home",label:"居家温度",promptFragment:"the texture of the subject's actual space — kitchen counter scenes, sofa rituals, plants and pets and unmade beds; intimate, not styled"},
      {id:"taste",label:"品味格调",promptFragment:"every beat reads as 'someone with a point of view chose this' — the way they pour, the books they keep, the music implied; aesthetic as identity"},
    ],
    toneBias: ["healing_chill","narrative_doc"],
    test: /慢生活|日常|居家|晨间|咖啡|健身|瑜伽|跑步|cottagecore|soft life|lifestyle|morning routine|cafe|yoga|running/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: true,
    attireHint: "ONE locked everyday outfit fitting the activity, output every piece with explicit color+material. Activity-specific MANDATORY pieces (the headwear/cap MUST appear in outfit when activity needs it): yoga → 'fitted grey marl athletic tank, black high-waist leggings, bare feet'; cafe/cottagecore → 'cream chunky knit cardigan over white cotton tee, light wash blue jeans, white canvas sneakers'; running → 'fitted neon coral tank, black running shorts, white running shoes, black running cap (mandatory headwear)'; cooking at home → 'striped navy and white cotton apron over a white tee, dark jeans, no shoes'; reading at home → 'oversized cream knit sweater, grey loose loungewear pants, fluffy white socks'. NEVER write 'athletic wear' alone — list every piece with color.",
  },
  {
    id: "journey",
    label: "旅程体验",
    organizingLogic: "Time arc of one trip/experience: arrive -> explore -> highlight -> wind down, different moments in time.",
    continuityLock: "the same trip + main outfit",
    focusOptions: [
      {id:"scenery",label:"风景人文",promptFragment:"the destination's signature views and human texture — landmarks, street life, local faces in background, what makes THIS place not anywhere"},
      {id:"food",label:"美食",promptFragment:"the trip's culinary thread — the dish that defines this region, the market stall, the dinner that becomes a memory; meals as anchors"},
      {id:"shopping",label:"购物",promptFragment:"the haul as story — picking, holding, trying, leaving with bags; the small economy of choosing what comes home with you"},
      {id:"leisure",label:"悠闲放空",promptFragment:"unhurried, no agenda — drifting through a park, lingering on a bench, watching boats; the trip's quiet between-moments"},
    ],
    toneBias: ["narrative_doc","healing_chill"],
    test: /旅行|旅程|游轮|邮轮|度假|出游|citywalk|探店|约会|trip|travel|cruise|vacation|journey|date/i,
    era: "modern",
    allowSelfie: true,
    allowModernProps: true,
    attireHint: "ONE locked travel outfit fitting the destination, output every piece with explicit color+material. Destination-specific MANDATORY pieces (hat/cap MUST be the FIRST item when sun/beach/snow is implied): beach/tropical → 'beige straw wide-brim sun hat (mandatory headwear), white linen short-sleeve button-up shirt, tan linen shorts, leather sandals, brown canvas tote'; cold city (Tokyo winter, Paris autumn) → 'charcoal wool overcoat, cream cashmere scarf, dark blue jeans, black leather Chelsea boots, black leather crossbody bag'; warm city (Bali, summer Europe) → 'pale yellow cotton sundress, tan leather sandals, woven beach bag, gold-rim sunglasses'; cruise/yacht → 'navy and white striped boatneck top, white linen wide-leg trousers, white canvas espadrilles, gold-rim sunglasses, beige sun hat'; ski/snow trip → 'red insulated ski jacket, black ski trousers, white knit beanie (mandatory headwear), black snow boots, black ski gloves'. NEVER write 'travel outfit' alone — list every piece.",
  },
];

// 兜底:未命中任何专门类型 → journey(最通用的时间线)
export function getStorylineType(text: string): StorylineTypeDef {
  for (const s of STORYLINE_TYPES) {
    if (s.id !== "journey" && s.test.test(text)) return s;
  }
  return STORYLINE_TYPES.find(s => s.id === "journey")!;
}

export const SCENE_TONES: SceneTone[] = [
  { id: "narrative_doc",     label: "叙事纪实", emoji: "📖", promptFragment: "plain documentary record of the real experience, like candid vlog stills" },
  { id: "surprise_highlight",label: "惊喜高光", emoji: "✨", promptFragment: "emphasize unexpected, delightful, memorable peak moments" },
  { id: "healing_chill",     label: "松弛治愈", emoji: "🌊", promptFragment: "slow, warm, relaxed, savoring-the-moment mood" },
  { id: "cinematic_drama",   label: "电影戏剧", emoji: "🎬", promptFragment: "cinematic tension and a sense of story climax, like film stills" },
  { id: "versailles_flex",   label: "凡尔赛炫耀", emoji: "💎", promptFragment: "understated luxury flex, enviable upper-class lifestyle" },
  { id: "funny_meme",        label: "搞笑沙雕", emoji: "😂", promptFragment: "light, funny, playful, meme-able candid energy" },
  { id: "romantic",          label: "浪漫氛围", emoji: "💕", promptFragment: "soft romantic dreamy atmosphere" },
  { id: "epic_blood",        label: "燃系热血", emoji: "🔥", promptFragment: "high-energy, heroic, adrenaline, epic momentum" },
];

export function getTone(id: string): SceneTone | undefined {
  return SCENE_TONES.find(t => t.id === id);
}
