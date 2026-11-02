// Kept byte-for-byte equivalent to the standalone kit's optional form helper.
// Parity is tested so standalone, MCP and generated clients reject the same spec.
export function formFieldError(field, value) {
  if (field.type === 'checkbox') return typeof value !== 'boolean' ? '需要布尔值。' : field.required && !value ? '请勾选此项。' : '';
  if (typeof value !== 'string') return '需要文本值。';
  const choices = field.type === 'select' || field.type === 'radio';
  const limit = field.type === 'number' ? 40 : choices ? 60 : field.maxLength ?? (field.type === 'textarea' ? 500 : 160);
  if (value.length > limit) return '输入超过长度限制。';
  if (choices) return value === '' ? field.required ? '请选择此项。' : '' : field.options.some(option => option.value === value) ? '' : '请选择有效选项。';
  if (!value.trim()) return field.required ? '请填写此项。' : '';
  if (field.type === 'number') {
    if (value.length > 40 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return '请输入有限数值。';
    const n = Number(value);
    return !Number.isFinite(n) || Math.abs(n) > 1e12 || n < (field.min ?? -1e12) || n > (field.max ?? 1e12) ? '数值超出允许范围。' : '';
  }
  return value.length <= (field.maxLength ?? (field.type === 'textarea' ? 500 : 160)) ? '' : '文字超过长度限制。';
}
export function validateInputForm(data) {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
  check(keys(data, ['fields', 'submitLabel', 'resetLabel', 'note']), '表单包含不受支持的字段。');
  check(Array.isArray(data.fields) && data.fields.length >= 1 && data.fields.length <= 8, '表单需要一至八个字段。');
  check(new Set(data.fields.map(field => field?.id)).size === data.fields.length, '表单字段标识必须唯一。');
  for (const key of ['submitLabel', 'resetLabel', 'note']) check(data[key] === undefined || text(data[key], key === 'note' ? 500 : 40), '表单标签或说明过长。');
  for (const field of data.fields) {
    check(keys(field, ['id', 'type', 'label', 'value', 'required', 'hint', 'min', 'max', 'maxLength', 'options']), '表单字段属性无效。');
    check(typeof field.id === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(field.id) && !['constructor', 'prototype'].includes(field.id) && text(field.label, 80), '表单字段需要安全标识和标签。');
    check(['text', 'textarea', 'number', 'select', 'radio', 'checkbox'].includes(field.type), '表单字段类型无效。');
    check(field.required === undefined || typeof field.required === 'boolean', 'required 必须为布尔值。');
    check(field.hint === undefined || text(field.hint, 240), '字段提示过长。');
    const numeric = field.type === 'number', choices = ['select', 'radio'].includes(field.type), textual = ['text', 'textarea'].includes(field.type);
    check(['min', 'max'].every(key => field[key] === undefined || numeric && typeof field[key] === 'number' && Number.isFinite(field[key]) && Math.abs(field[key]) <= 1e12), '仅数字字段接受有界 min/max。');
    check((field.min ?? -1e12) <= (field.max ?? 1e12), '数值上下限倒置。');
    check(field.maxLength === undefined || textual && Number.isInteger(field.maxLength) && field.maxLength >= 1 && field.maxLength <= 500, '文本长度限制须为 1–500。');
    check(field.options === undefined || choices, '仅选择字段接受 options。');
    if (choices) {
      check(Array.isArray(field.options) && field.options.length >= 2 && field.options.length <= 12, '选择字段需要二至十二个选项。');
      check(field.options.every(option => keys(option, ['value', 'label']) && text(option.value, 60) && text(option.label, 120)) && new Set(field.options.map(option => option.value)).size === field.options.length, '选项值必须唯一且标签有界。');
    }
    if (field.value !== undefined) {
      check(numeric ? field.value === null || typeof field.value === 'number' && Number.isFinite(field.value) : field.type === 'checkbox' ? typeof field.value === 'boolean' : typeof field.value === 'string', '默认值类型无效。');
      const value = numeric ? field.value === null ? '' : String(field.value) : field.value;
      check(!formFieldError({ ...field, required: false }, value), '默认值超出字段限制。');
    }
  }
  // Even worst-case JSON escapes fit the existing 15,000-character widget
  // envelope with both private draft and an explicitly submitted model snapshot.
  const capacity = data.fields.reduce((sum, field) => sum + (field.type === 'checkbox' ? 5 : field.type === 'number' ? 40 : ['select', 'radio'].includes(field.type) ? 60 : field.maxLength ?? (field.type === 'textarea' ? 500 : 160)), 0);
  check(capacity <= 1000, '表单字段总输入容量不得超过 1000 字符。');
}
