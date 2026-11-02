import { sceneText } from './scene-runtime.mjs';
// Shared fallback for validated response and document views.
// Keep quiz grading fields out of readable output regardless of runtime state.
export function mathText(node) {
  if (typeof node === 'string') return node;
  if (node.text !== undefined) return node.text;
  const children = (node.children || []).map(mathText);
  switch (node.tag) {
    case 'mfrac': return `(${children[0]})/(${children[1]})`;
    case 'msup': return `${children[0]}^(${children[1]})`;
    case 'msub': return `${children[0]}_(${children[1]})`;
    case 'msubsup': return `${children[0]}_(${children[1]})^(${children[2]})`;
    case 'msqrt': return `√(${children.join('')})`;
    case 'mroot': return `root(${children[1]}, ${children[0]})`;
    case 'mtr': return children.join(' | ');
    case 'mtable': return children.join('\n');
    default: return children.join('');
  }
}
function richText(nodes) {
  return nodes.map(node => {
    const nested = () => richText(node.children || []);
    switch (node.type) {
      case 'text': return node.text;
      case 'code': return '`' + node.text + '`';
      case 'codeblock': return `\n\`\`\`${node.language || ''}\n${node.text}\n\`\`\`\n`;
      case 'math': return node.display ? `\n\\[${node.tex}\\]\n` : `\\(${node.tex}\\)`;
      case 'link': return `${nested()} (${node.href})`;
      case 'strong': return `**${nested()}**`;
      case 'em': return `*${nested()}*`;
      case 'del': return `~~${nested()}~~`;
      case 'heading': return `\n${'#'.repeat(node.level)} ${nested()}\n`;
      case 'paragraph': return `${nested()}\n\n`;
      case 'blockquote': return `${nested().trim().split('\n').map(line => `> ${line}`).join('\n')}\n`;
      case 'list': return node.children.map((item, i) => `${node.ordered ? `${node.start + i}.` : '-'} ${richText(item.children).trim()}`).join('\n') + '\n\n';
      case 'row': return `${node.children.map(cell => richText(cell.children)).join(' | ')}\n`;
      case 'break': case 'rule': return '\n';
      default: return nested();
    }
  }).join('');
}
export function componentText(type, d) {
  const formula = item => {
    if (!item.math) return '';
    const rendered = mathText(item.math);
    return '\n' + [item.mathLabel, rendered].filter((value, index, values) => value && values.indexOf(value) === index).join('\n');
  };
  const lines = [];
  switch (type) {
    case 'input-form':
      lines.push('输入表单：草稿由宿主组件状态支持恢复；提交生成输入快照，并可将输入值提供模型上下文。', ...d.fields.map(field => {
        const initial = field.value === undefined || field.value === null || field.value === '' ? '未填写' : String(field.value);
        return `${field.label}（${field.type}${field.required ? '，必填' : ''}）：初始值 ${initial}${field.type === 'number' ? `；范围 ${field.min ?? -1e12} 至 ${field.max ?? 1e12}` : ''}${['text', 'textarea'].includes(field.type) ? `；最多 ${field.maxLength ?? (field.type === 'textarea' ? 500 : 160)} 字符` : ''}${field.options ? `；选项 ${field.options.map(option => `${option.label} (${option.value})`).join('、')}` : ''}${field.hint ? `；${field.hint}` : ''}`;
      }), '填写后可提交、重置；这里的全文复制保留初始表单定义，不包含操作后的草稿或提交结果。'); break;
    case 'progress':
      for (const stage of d.stages || [{ label: d.label || '完成进度', value: d.value }]) lines.push(`${stage.label}：${stage.value}/${d.total}${d.unit || ''}（${Number((stage.value / d.total * 100).toFixed(2))}%）${stage.subsetOf ? `；包含于 ${d.stages.find(parent => parent.id === stage.subsetOf)?.label}` : ''}`);
      lines.push(...(d.details || [])); break;
    case 'timeline': case 'steps': case 'reveal-steps': lines.push(...d.items.map((item, i) => `${i + 1}. ${[item.date, item.title, item.status].filter(Boolean).join(' · ')}${formula(item)}\n${item.detail || ''}`)); break;
    case 'profile': lines.push(d.eyebrow, d.name, d.subtitle, d.tags?.join(' · '), d.summary); break;
    case 'rhythm': lines.push(...d.items.map(item => `${item.label}：${{ brief: '简写', moderate: '适度展开', focus: '重点展开' }[item.emphasis]}`), '关注度为定性建议，不代表实测百分比。'); break;
    case 'comparison': lines.push(...d.items.map(item => `${item.label}${item.title ? ` · ${item.title}` : ''}${formula(item)}\n${item.detail || ''}`)); break;
    case 'answer': lines.push(d.label, d.title, formula(d), d.detail); break;
    case 'quiz': lines.push(...d.questions.map((q, i) => `${i + 1}. ${q.prompt}\n${q.options.map(o => `   ${o.id}. ${o.label}`).join('\n')}`), '请选择各题答案；提交后再判断正确性和解释。'); break;
    case 'line-chart': lines.push(`${d.seriesLabel}；横轴 ${d.xLabel}${d.xUnit ? ` (${d.xUnit})` : ''}；纵轴 ${d.yLabel}${d.yUnit ? ` (${d.yUnit})` : ''}`, ...d.points.map(point => `(${point.x}, ${point.y})`)); break;
    case 'force-diagram': lines.push(d.body, ...d.forces.map(force => d.mode === 'direction' ? `${force.label}：方向 ${force.angle}°（不按大小缩放）` : `${force.label}：Fx=${force.fx} ${d.unit}，Fy=${force.fy} ${d.unit}`)); if (d.axisAngle !== undefined) lines.push(`观察轴旋转 ${d.axisAngle}°；分力不增加真实力。`); break;
    case 'motion-lab': lines.push(`匀加速运动实验：v₀=${d.initialVelocity} m/s，a=${d.acceleration} m/s²，时长 ${d.duration} s。`, `初始观察时间 t=${d.time ?? 0} s。`, 'v(t)=v₀+at；x(t)=v₀t+½at²。实验读数不改写固定题设。'); break;
    case 'geometry': {
      const q = d.heightRatio ?? 1.5, h = d.radius * q, x = d.radius * Math.sqrt(2 * q - q * q), unit = d.unit || '单位';
      lines.push(`圆内接三角形实验：半径 r=${d.radius} ${unit}，初始高度 h/r=${q}。`, '底边 b=2√(2rh−h²)，面积 A=h√(2rh−h²)。', `初始实验结果：高度 ${h} ${unit}；半底边 ${x} ${unit}；底边 ${2 * x} ${unit}；面积 ${h * x} ${unit}²。`, '滑块或精确输入范围 0.05≤h/r≤1.95；结果表随当前实验联动，重置恢复初始值。固定推导与全文复制保留初始题设。'); break;
    }
    case 'tabs': lines.push(...d.items.map(item => `${item.label}\n${item.title || ''}\n${item.body}\n${(item.points || []).join('\n')}`)); break;
    case 'data-table': lines.push(d.columns.map(col => col.label).join(' | '), ...d.rows.map(row => d.columns.map(col => row.values[col.key]).join(' | '))); break;
    case 'media-panel': lines.push(...d.items.map(item => [item.title, item.body, `图像描述：${item.alt}`, item.caption ? `图注：${item.caption}` : '', item.credit ? `归属：${item.credit}` : '', `来源：${item.sourceLabel} (${item.sourceUrl})；未自动加载原图。`].filter(Boolean).join('\n'))); break;
  }
  if (d.note) lines.push(d.note);
  return lines.filter(value => value !== undefined && value !== '').join('\n');
}
export function responseText(view) {
  let sceneCharacters = 0;
  const blocks = values => values.map(block => {
    const title = block.title ? `## ${block.title}\n\n` : '';
    let body;
    switch (block.kind) {
      case 'prose': body = `${block.eyebrow ? block.eyebrow + '\n' : ''}${richText(block.nodes)}`; break;
      case 'math': body = [block.label, block.tex ? `\\[${block.tex}\\]` : mathText(block.math), block.detail].filter(Boolean).join('\n'); break;
      case 'component': body = componentText(block.type, block.data); break;
      case 'scene': body = sceneText(block); sceneCharacters += body.length; if (sceneCharacters > 100000) throw new Error('生成视图文字快照超过预算，请拆分本轮内容。'); break;
      case 'diagram': body = [block.description, ...(block.elements || []).map(item => item.label || (item.kind === 'text' ? item.text : '')).filter(Boolean), ...(block.states || []).map(state => `${state.label}：${state.description || ''}\n${state.elements.map(item => item.label || item.text || '').filter(Boolean).join('；')}`)].join('\n'); break;
      case 'group': body = blocks(block.blocks); break;
      case 'collapse': body = `${block.summary}\n${blocks(block.blocks)}`; break;
      case 'tabs': body = block.items.map(item => `${item.label}\n${blocks(item.blocks)}`).join('\n\n'); break;
    }
    return title + body;
  }).join('\n\n');
  return `${view.title ? `# ${view.title}\n\n` : ''}${blocks(view.blocks)}`.trim();
}
