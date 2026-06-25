// Conjunto curado de modelos "ocultos": recentes/nicho que os LLMs subrepresentam.
// É o que a ferramenta existe para surfacar. Mantenha em sincronia com
// data/hidden_models.json (fonte legível para docs e benchmark; critério lá descrito).

export const HIDDEN_IDS: Set<string> = new Set([
  "l323", // TabPFN
  "l076", // NGBoost
  "l114", // TimeGPT
  "l113", // Chronos
  "l217", // PatchTST
  "l218", // iTransformer
  "l268", // TimesNet
  "l110", // N-HiTS
  "l109", // N-BEATS
  "l267", // Autoformer
  "l266", // Informer
  "l112", // TFT
  "l264", // DeepAR
  "l265", // TCN
  "l182", // Causal Forest
  "l183", // Double ML
  "l126", // DeepSurv
]);
