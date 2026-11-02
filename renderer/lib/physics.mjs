import { validateComponent } from './component-validation.mjs';

// A deliberately narrow model: a point mass on the upper face of a stationary,
// smooth plane, initially at rest or moving along the plane. Gravity and contact
// are the only possible forces. This is not a general physics solver.
export const INCLINE_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['massKg', 'gravityMps2', 'inclineDeg', 'contentId'],
  properties: {
    massKg: { type: 'number', exclusiveMinimum: 0, description: 'Known mass in kg. Required; no default. massKg × gravityMps2 must be at most 1e12 N.' },
    gravityMps2: { type: 'number', exclusiveMinimum: 0, description: 'The gravity stated or explicitly adopted for this problem, in m/s². Required; never silently use 9.81.' },
    inclineDeg: { type: 'number', minimum: -90, maximum: 90, description: 'Signed angle in degrees from global +x toward the plane tangent: positive rises to the right, negative falls to the right. 0 is horizontal; ±90 are vertical zero-contact-force limits.' },
    contentId: { type: 'string', minLength: 1, maxLength: 200, description: 'Identity for this problem and its current conditions; update when conditions change.' },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    body: { type: 'string', minLength: 1, maxLength: 120, description: 'Short label for the isolated point mass. Do not use this tool for friction, extra forces, curved/moving planes or unknown quantities.' }
  }
};

const check = (condition, message) => { if (!condition) throw new Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const zero = value => Object.is(value, -0) ? 0 : value;
const format = value => String(Number(zero(value).toPrecision(12)));

export function computeInclineForces(input) {
  check(input && typeof input === 'object' && !Array.isArray(input), '需要已知质量、g、斜面角度和内容标识的 JSON 对象。');
  check(Object.keys(input).every(key => Object.hasOwn(INCLINE_INPUT_SCHEMA.properties, key)), '此工具只接受质量、g、坡角和显示标签；不接受摩擦、额外力或手算分量。');
  const { massKg: mass, gravityMps2: gravity, contentId } = input;
  const angle = zero(input.inclineDeg);
  check(finite(mass) && mass > 0, 'massKg 必须是已知、有限的正数，单位 kg。');
  check(finite(gravity) && gravity > 0, 'gravityMps2 必须显式提供已知、有限的正数，单位 m/s²；不使用默认 g。');
  check(finite(angle) && angle >= -90 && angle <= 90, 'inclineDeg 必须是 -90° 至 90° 的已知有限数值；正值向右上升，负值向右下降。');
  check(text(contentId, 200), 'contentId 必须是1至200字符的有效文本。');
  check(input.title === undefined || text(input.title, 200), 'title 必须是1至200字符的有效文本。');
  check(input.body === undefined || text(input.body, 120), 'body 必须是1至120字符的有效文本。');
  const weight = mass * gravity;
  check(finite(weight) && weight > 0 && weight <= 1e12, '质量乘以 g 必须为可计算的正数，且不超过 10¹² N。');

  // Exact cardinal cases prevent a residual normal or resultant arrow at the
  // horizontal / vertical limits. Other angles keep full floating precision.
  const vertical = Math.abs(angle) === 90;
  const sine = angle === 0 ? 0 : vertical ? Math.sign(angle) : Math.sin(angle * Math.PI / 180);
  const cosine = vertical ? 0 : angle === 0 ? 1 : Math.cos(angle * Math.PI / 180);
  check(angle === 0 || sine !== 0, '角度过小，超出当前数值精度；不能将未知或不可计算的量默认为零。');
  const normal = weight * cosine;
  check(vertical || normal > 0, '支持力量级超出当前数值精度。');
  const nx = zero(-normal * sine), ny = zero(normal * cosine);
  const forces = [{ id: 'gravity', label: '重力', fx: 0, fy: -weight, tone: 'orange' }];
  if (!vertical) forces.push({ id: 'normal', label: '支持力', fx: nx, fy: ny, tone: 'green' });

  // Use exactly the same real-force sum as the existing diagram. Never compute
  // the prose from rounded components or add a resultant as another real force.
  const fx = nx, fy = zero(ny - weight);
  const magnitude = Math.hypot(fx, fy);
  const ax = zero(fx / mass), ay = zero(fy / mass), acceleration = Math.hypot(ax, ay);
  check([normal, nx, ny, fx, fy, magnitude, ax, ay, acceleration].every(finite), '计算结果超出有限数值范围。');
  check(angle === 0 || magnitude > 0 && acceleration > 0, '合力或加速度量级超出当前数值精度。');
  const calculation = {
    model: 'stationary_smooth_incline_gravity_and_contact_only',
    massKg: mass, gravityMps2: gravity, inclineDeg: angle,
    normalN: normal,
    netForceN: { fx, fy, magnitude },
    accelerationMps2: { x: ax, y: ay, magnitude: acceleration },
    verticalZeroContactLimit: vertical
  };
  const note = `静止光滑斜面，仅重力与接触力；m=${format(mass)} kg，g=${format(gravity)} m/s²，θ=${format(angle)}°；全局 +x 向右、+y 向上，局部 +x′ 沿 θ 指定的切线（负坡角时向右下）。${vertical ? '垂直极限：N=0，仅绘制重力，不画支持力箭头。' : ''}`;
  const summary = `${note}支持力 N=${format(normal)} N；合力 (${format(fx)}, ${format(fy)}) N，大小 ${format(magnitude)} N；加速度 (${format(ax)}, ${format(ay)}) m/s²，大小 ${format(acceleration)} m/s²。`;
  const config = validateComponent({
    schemaVersion: 1, contentId, type: 'force-diagram', title: input.title ?? '光滑斜面受力',
    data: { body: input.body ?? '斜面上的物块', unit: 'N', axisAngle: angle, forces, note, calculation }
  });
  return { config, calculation, summary };
}
