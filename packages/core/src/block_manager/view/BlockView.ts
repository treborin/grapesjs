import { isFunction } from 'underscore';
import { View } from '../../common';
import EditorModel from '../../editor/model/Editor';
import { on, off } from '../../utils/dom';
import { hasDnd } from '../../utils/mixins';
import { BlockManagerConfig } from '../config/config';
import Block from '../model/Block';
import ComponentSorter from '../../utils/sorter/ComponentSorter';
import CanvasNewComponentNode from '../../utils/sorter/CanvasNewComponentNode';

export interface BlockViewConfig {
  em?: EditorModel;
  pStylePrefix?: string;
  appendOnClick?: BlockManagerConfig['appendOnClick'];
  getSorter?: () => ComponentSorter<CanvasNewComponentNode>;
}

export default class BlockView extends View<Block> {
  em: EditorModel;
  config: BlockViewConfig;
  ppfx: string;

  events() {
    return {
      click: 'handleClick',
      mousedown: 'startDrag',
      dragstart: 'handleDragStart',
      drag: 'handleDrag',
      dragend: 'handleDragEnd',
    };
  }

  constructor(o: any, config: BlockViewConfig = {}) {
    super(o);
    const { model } = this;
    this.em = config.em!;
    this.config = config;
    this.endDrag = this.endDrag.bind(this);
    this.ppfx = config.pStylePrefix || '';
    this.listenTo(model, 'destroy remove', this.remove);
    this.listenTo(model, 'change', this.render);
  }

  __getModule() {
    return this.em.Blocks;
  }

  handleClick(ev: Event) {
    const { config, model, em } = this;
    const onClick = model.get('onClick') || config.appendOnClick;
    em.trigger('block:click', model, ev);
    if (!onClick) {
      return;
    } else if (isFunction(onClick)) {
      return onClick(model, em?.getEditor(), { event: ev });
    }
    const sorter = config.getSorter?.();
    if (!sorter) return;
    const content = model.get('content')!;
    let dropModel = this.getTempDropModel(content);
    const el = dropModel.view?.el;
    const sources = el ? [{ element: el, dragSource: { content } }] : [];
    const selected = em.getSelected();
    let target,
      valid,
      insertAt,
      index = 0;

    // If there is a selected component, try first to append
    // the block inside, otherwise, try to place it as a next sibling
    if (selected) {
      valid = sorter.validTarget(selected.getEl(), sources, index);

      if (valid) {
        target = selected;
      } else {
        const parent = selected.parent();
        if (parent) {
          valid = sorter.validTarget(parent.getEl(), sources, index);
          if (valid) {
            target = parent;
            insertAt = parent.components().indexOf(selected) + 1;
          }
        }
      }
    }

    // If no target found yet, try to append the block to the wrapper
    if (!target) {
      const wrapper = em.getWrapper()!;
      valid = sorter.validTarget(wrapper.getEl(), sources, index);
      if (valid) target = wrapper;
    }

    const result = target && target.append(content, { at: insertAt })[0];
    result && em.setSelected(result, { scroll: 1 });
  }

  /**
   * Start block dragging
   * @private
   */
  startDrag(e: MouseEvent) {
    const { config, em, model } = this;
    const disable = model.get('disable');
    //Right or middel click
    if (e.button !== 0 || !config.getSorter || this.el.draggable || disable) return;
    em.refreshCanvas();
    const sorter = config.getSorter();
    sorter.__currentBlock = model;
    const content = this.model.get('content');
    let dropModel = this.getTempDropModel(content);
    const el = dropModel.view?.el;
    const sources = el ? [{ element: el, dragSource: { content } }] : [];
    sorter.startSort(sources);
    on(document, 'mouseup', this.endDrag);
  }

  handleDragStart(ev: DragEvent) {
    this.__getModule().__startDrag(this.model, ev);
  }

  handleDrag(ev: DragEvent) {
    this.__getModule().__drag(ev);
  }

  handleDragEnd() {
    this.__getModule().__endDrag();
  }

  /**
   * Drop block
   * @private
   */
  endDrag() {
    off(document, 'mouseup', this.endDrag);
    const sorter = this.config.getSorter?.();
    if (sorter) {
      sorter.endDrag();
    }
  }

  /**
   * Generates a temporary model of the content being dragged for use with the sorter.
   * @returns The temporary model representing the dragged content.
   */
  private getTempDropModel(content?: any) {
    const comps = this.em.Components.getComponents();
    const opts = {
      avoidChildren: 1,
      avoidStore: 1,
      avoidUpdateStyle: 1,
    };
    const tempModel = comps.add(content, { ...opts, temporary: true });
    let dropModel = comps.remove(tempModel, { ...opts, temporary: true } as any);
    // @ts-ignore
    dropModel = dropModel instanceof Array ? dropModel[0] : dropModel;
    dropModel.view?.$el.data('model', dropModel);
    return dropModel;
  }

  render() {
    const { em, el, $el, ppfx, model } = this;
    const disable = model.get('disable');
    const attr = model.get('attributes') || {};
    const cls = attr.class || '';
    const className = `${ppfx}block`;
    const label = (em && em.t(`blockManager.labels.${model.id}`)) || model.get('label');
    // @ts-ignore deprecated
    const render = model.get('render');
    const media = model.get('media');
    const clsAdd = disable ? `${className}--disable` : `${ppfx}four-color-h`;
    $el.attr(attr);
    el.className = `${cls} ${className} ${ppfx}one-bg ${clsAdd}`.trim();
    el.innerHTML = `
      ${media ? `<div class="${className}__media">${media}</div>` : ''}
      <div class="${className}-label">${label}</div>
    `;
    el.title = attr.title || el.textContent?.trim();
    el.setAttribute('draggable', `${hasDnd(em) && !disable ? true : false}`);
    // @ts-ignore
    const result = render && render({ el, model, className, prefix: ppfx });
    if (result) el.innerHTML = result;
    return this;
  }
}
