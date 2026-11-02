// Fixed non-sensitive local acceptance fixture; not product routing.
import { verticalExperience, verticalExperienceText } from './vertical-experience.mjs';
export function mixedReadingExperience() {
  const input = verticalExperience();
  return { ...input, contentId: 'mixed-prose-scene-offline', blocks: [
    { id: 'intro', kind: 'prose', text: verticalExperienceText.nativeText + '\n\n' + '长正文保持阅读顺序与精确数值。'.repeat(24) + '\n\n' + 'LongUnbrokenMeasurementIdentifier'.repeat(10) },
    input.blocks[0],
    { id: 'explanation', kind: 'prose', text: verticalExperienceText.whyText + '\n\n' + 'The explanation remains unchanged when either diagram is explored. '.repeat(12) },
    input.blocks[1],
  ] };
}
