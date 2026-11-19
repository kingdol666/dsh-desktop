---
name: cae-workflow
description: 斜拉 CAE 引擎的调用规程：run/coupon/study 三种模式与结果解读
whenToUse: 需要 CAE 仿真数据支撑机理判别或工艺优化时
metadata:
  domain: simulation
  version: 1
---

# CAE 工作流

## 三种调用（pm_cae_run / pm_cae_study 包装底层 node scripts/cae-run.mjs / cae-study.mjs）
- `run`：全流程整机求解（--time 秒；10×24 网格约 13 s）→ 产物 metrics（Δn/R/E/收缩率）+ provenance（sourceSha256、deterministic）
- `coupon`：仿射验证 coupon（秒级）——引擎健康检查与网格基线
- `study`：machine-refine（网格比较）/ optimize（单变量扫描）→ 判别实验首选

## 结果纪律
- 每次 run 的 provenance.sourceSha256 必须随证据登记（哈希锚定）
- 网格无关性未证明的峰值应力只作参考（引擎文档明示）
- 优化结果 = 合格样本搜索，不是全局最优——claimSupport 必须写明范围

## 判别用法
H1（λ 主导幅值）vs H2（θ 主导幅值）：固定 θ 扫 λ、固定 λ 扫 θ 两个 study；比较 Δn 幅值敏感度 → 一方 refuted。

## 自检清单
- [ ] --params JSON 单位与引擎文档一致
- [ ] 结果 status=CONVERGED 且 valid=true 才可登记
- [ ] provenance 传给 pm_evidence_record.payload
