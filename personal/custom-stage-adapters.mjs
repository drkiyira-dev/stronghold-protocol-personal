// Strict presentation-only seams in generated output; upstream remains pinned.
export const CUSTOM_STAGE_ADAPTERS=[
 ['js/screens/room.js',
  "import { originalStageFor, originalStageInfo } from '/personal/custom-stage-ui.mjs';\n",[
   ["useData('chess', 'assets', 'config');","useData('chess', 'assets', 'config', 'stages');"],
   ['const myReady = !!facts.mine?.ready;\n  const info = difficultyInfo(room.mode, room.difficulty);','const myReady = !!facts.mine?.ready;\n  const originalStage = originalStageFor(room.content?.modeId);\n  const info = originalStage ? originalStageInfo(originalStage) : difficultyInfo(room.mode, room.difficulty);'],
   ["<h2>${DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''}","<h2>${originalStage ? info.name : DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''}"],
   ['disabled=${facts.isHost && !!busy} onClick=${openProto}','disabled=${!!originalStage || (facts.isHost && !!busy)} onClick=${openProto}'],
  ]],
 ['js/ui/matchEnemies.js',
  "import { OriginalStageBriefing } from '/personal/custom-stage-ui.mjs';\n",[
   ['const stage = pub.stageId ? gd.stage(pub.stageId) : null;','const stage = pub.stageId ? gd.stage(pub.stageId) : null;\n  if (stage?.options?.originalStage) return html`<${OriginalStageBriefing} stage=${stage.options.originalStage} />`;'],
  ]],
 ['js/ui/setupReroll.js',
  "import { originalStageFor } from '/personal/custom-stage-ui.mjs';\n",[
   ['if (!vote && !me) return null;','if (originalStageFor(pub.modeId) || (!vote && !me)) return null;'],
  ]],
];
