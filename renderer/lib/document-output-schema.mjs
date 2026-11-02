import { RESPONSE_OUTPUT_SCHEMA } from './response-output-schema.mjs';
import { DOCUMENT_TONES } from './document-validation.mjs';
export const DOCUMENT_OUTPUT_SCHEMA = (() => {
  const schema = structuredClone(RESPONSE_OUTPUT_SCHEMA);
  Object.assign(schema.properties, {
    mode: { const: 'document' }, documentVersion: { const: 1 }, sourceHash: { type: 'string', pattern: '^[a-f0-9]{16}$' },
    runtimeDiagnostics: { type: 'object', additionalProperties: false, required: ['version', 'instanceId'], properties: { version: { type: 'string', maxLength: 40 }, instanceId: { type: 'string', maxLength: 80 }, ...Object.fromEntries(['instanceStartedAt', 'requestNumber', 'serverReceivedAt', 'serverCompletedAt', 'documentCompileNumber', 'normalizationMs', 'mathFallbacks'].map(key => [key, { type: 'number', minimum: 0 }])) } },
    callouts: { type: 'object', maxProperties: 32, propertyNames: { pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$' }, additionalProperties: { enum: DOCUMENT_TONES } }
  });
  schema.required.push('mode', 'documentVersion', 'sourceHash', 'callouts');
  return schema;
})();
