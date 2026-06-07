// quality check 必须把 bokeh / 戏剧光 / 模特摆拍 / 杂志构图 看作减分项，
// 让"看起来太专业"的首图触发重试，火山 4.0 偶发出专业图时自动 reroll。
import { describe, it, expect } from "vitest";
import { QUALITY_PROMPT } from "@/lib/scene/services/quality-check";

describe("QUALITY_PROMPT penalises professional-looking output", () => {
  it("explicitly tells the vision model to deduct quality for bokeh / shallow depth of field", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/deduct|reduce|penali[sz]e|lower/);
    expect(p).toMatch(/bokeh|shallow depth|background blur|portrait mode/);
  });

  it("calls out dramatic / backlit / golden-hour fashion lighting as a quality killer", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/dramatic|backlit|rim light|golden hour|sunset.*shoot|sunrise.*shoot|fashion.*light/);
  });

  it("calls out magazine-cover composition / model pose as a quality killer", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/magazine|editorial|model pose|fashion editorial|stylized pose|photoshoot/);
  });

  it("anchors the target as 'phone snapshot taken by a friend'", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/phone (snapshot|photo)|friend|camera roll|amateur/);
  });
});

describe("QUALITY_PROMPT: same_person 聚焦主体 + 遮挡合理（用户产品判断）", () => {
  // 用户反馈：医生戴 mask / 蝙蝠侠戴面具是合理场景。
  // identity 判定不该因脸被合理遮挡就降级；应看眼+露出皮肤+身材轮廓。
  // 多人画面（家属感谢）要让 vlm 知道主体是谁。

  it("same_person 判定显式聚焦主体（前景/穿主 outfit），忽略 background companions", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/main subject|primary subject|the subject.*foreground|focus on (?:the )?subject|main person/);
    expect(p).toMatch(/ignore.*(?:companion|bystander|extra|background person|second person)|not.*(?:companion|bystander).*identity/);
  });

  it("遮挡场景下 same_person 从可见特征判定（眼/露出皮肤/身材），不因部分脸被挡而 false", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/mask|helmet|hood|scarf|face covering|occlud/);
    expect(p).toMatch(/eyes|exposed skin|body proportions|posture|silhouette|visible feature/);
    expect(p).toMatch(/do not.*downgrade|do not.*false|still judge|judge.*from (?:the )?visible/);
  });

  it("背面/侧面/silhouette 场景：从 outfit + 发型 + 露出皮肤 + 体型 判 same_person（D3）", () => {
    const p = QUALITY_PROMPT.toLowerCase();
    expect(p).toMatch(/back view|profile|silhouette|three[- ]?quarter back|partial view|hands?[- ]only|face turned away|facing away/);
    expect(p).toMatch(/outfit|wardrobe|hair (?:color|texture|style)|body (?:proportions?|shape|silhouette)|skin tone|hands?/);
    expect(p).toMatch(/do not.*(?:require|need).*(?:front|face[- ]?on|frontal)|do not.*(?:false|downgrade).*back|still (?:judge|assess|verify)/);
  });
});
