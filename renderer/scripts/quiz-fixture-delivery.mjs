// Build-time fixtures only. The instance label is explicitly supplied by the
// trusted generator, never derived from grading or supplied to a real MCP call.
import { createHash } from 'node:crypto';

export function trustedFixtureDeliveryId(instanceLabel) {
  if (typeof instanceLabel !== 'string' || !instanceLabel.trim() || instanceLabel.length > 300) throw new Error('Expected an explicit trusted fixture instance label');
  const bytes = createHash('sha256').update('chatui:trusted-build-quiz-instance:v1:' + instanceLabel).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
